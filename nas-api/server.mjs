/**
 * API de listing du NAS « Les Poroiniens » (phase 2 « tout sur le NAS »).
 *
 * Serveur HTTP Node **zéro dépendance**, lu par le site via `NAS_API_BASE`
 * (contrat en miroir de `src/lib/nas.ts` + `scripts/import-ancien.mts`).
 * Exposé derrière Nginx Proxy Manager sous `/api` sur le domaine images.
 *
 * Endpoints :
 * - `GET /list?path=<rel>` — fichiers d'un dossier (tableau JSON par défaut ;
 *   `?format=object` → `{ path, count, pages }` ;
 *   `?format=urls` → tableau d'URLs absolues (ancien format proprio)).
 * - `GET /tree?path=<rel>` — dossiers + fichiers (écran d'import Gérant).
 * - `GET /health` — `{ status, disk_free_pct, version }` (cron).
 * - `POST /move` `{ from, to }` — `staging/` → `public/`.
 * - `POST /upload?path=<rel>[&overwrite=1]` — écrit le corps brut (octets) au
 *   chemin relatif ; **texte uniquement** (`.txt`), 2 Mo max, crée les
 *   dossiers parents, refuse d'écraser sauf `overwrite=1`. Comme `/move`,
 *   l'API key est **toujours** exigée (import LN + création Gérant).
 * - `GET /file?path=<rel>` — octets d'un fichier (repli `/api/image`).
 *
 * Configuration (variables d'environnement) :
 * - `IMG_ROOT` (requis) : racine des images dans le conteneur (`/images`).
 * - `PORT` (défaut `8660`).
 * - `NAS_API_KEY` (optionnel) : si définie, exigée (`X-Api-Key` ou
 *   `Authorization: Bearer`). `/move` l'exige **toujours**.
 * - `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` (optionnels) : service
 *   token Cloudflare Access accepté en plus de la clé.
 * - `RATE_LIMIT_PER_MIN` (défaut `600`, `0` = désactivé) : quota par IP.
 *
 * Sécurité : garde-fous anti traversal (miroir de `isSafePath`), confinement
 * à `IMG_ROOT`, `/move` limité aux racines `staging`/`public`, CORS fermé
 * (aucun en-tête), journalisation d'une ligne par appel.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import {
  createReadStream,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const PORT = Number(process.env.PORT || 8660);
const ROOT = path.resolve(process.env.IMG_ROOT || "/images");
const API_KEY = process.env.NAS_API_KEY || "";
const CF_ID = process.env.CF_ACCESS_CLIENT_ID || "";
const CF_SECRET = process.env.CF_ACCESS_CLIENT_SECRET || "";
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 600);
const VERSION = "nas-api/1.1.0";
/** `/upload` : texte seulement (chapitres light novel), 2 Mo par fichier. */
const UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
const UPLOAD_EXT = new Set([".txt"]);
const STARTED_AT = Date.now();

// ── Chemins ────────────────────────────────────────────────────────────────

/** Miroir de `isSafePath` côté site : ni `..`, ni antislash, ni disque local. */
function isSafeRel(value) {
  if (!value || value.length > 500) return false;
  if (value.includes("\0") || value.includes("\\")) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  if (value.split("/").some((seg) => seg === "..")) return false;
  return true;
}

/** Décodage tolérant (`%20` → espace ; brut conservé si invalide). */
function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Encodage par segment, comme les anciennes URLs `img.` (`%20`, `%23`…). */
function encodeRel(rel) {
  return rel
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/**
 * Candidats de résolution : brut d'abord (chemin exact), puis décodé (appel
 * avec un chemin encore encodé, ex. collé depuis une ancienne URL).
 */
function candidates(rel) {
  const out = [rel];
  const decoded = safeDecode(rel);
  if (decoded !== rel) out.push(decoded);
  return out;
}

/**
 * Résout un chemin relatif vers un existant sous `ROOT`, sinon `null`.
 * Les candidats dangereux sont écartés avant tout accès disque.
 */
function pickExisting(rel) {
  for (const cand of candidates(rel)) {
    if (!isSafeRel(cand)) continue;
    const abs = path.resolve(ROOT, cand);
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) continue;
    try {
      const st = statSync(abs);
      return { abs, rel: cand, stat: st };
    } catch {
      /* inexistant : candidat suivant */
    }
  }
  return null;
}

/**
 * Refus explicite d'un chemin dangereux (aucun candidat sûr), sinon `null`
 * pour continuer vers la résolution (existant → 200, absent → 500 + ENOENT).
 */
function unsafeRefusal(rel) {
  if (rel === "") return null;
  if (candidates(rel).some((c) => isSafeRel(c))) return null;
  return { error: "invalid_path" };
}

/** Absolu confiné (sans vérification d'existence, pour la cible de `/move`). */
function confinedAbs(rel) {
  const cand = candidates(rel).find((c) => isSafeRel(c)) ?? rel;
  if (!isSafeRel(cand)) return null;
  const abs = path.resolve(ROOT, cand);
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return { abs, rel: cand };
}

// ── Métadonnées images (zéro dépendance) ────────────────────────────────────

function imageDims(buf) {
  try {
    if (buf.length > 24 && buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (buf.length > 26 && buf.toString("ascii", 0, 2) === "BM") {
      return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
    }
    if (
      buf.length > 30 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    ) {
      const fourcc = buf.toString("ascii", 12, 16);
      if (fourcc === "VP8X") {
        return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
      }
      if (fourcc === "VP8 ") {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (fourcc === "VP8L" && buf[20] === 0x2f) {
        const w = ((buf[22] & 0x3f) << 8) | buf[21];
        const h = ((buf[24] & 0x0f) << 10) | (buf[23] << 2) | ((buf[22] & 0xc0) >> 6);
        return { width: w + 1, height: h + 1 };
      }
    }
    if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i + 8 < buf.length) {
        if (buf[i] !== 0xff) break;
        const marker = buf[i + 1];
        if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          i += 2;
          continue;
        }
        const len = buf.readUInt16BE(i + 2);
        if (len < 2 || i + len > buf.length) break;
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
    }
    const ispe = buf.indexOf("ispe");
    if (ispe > 0 && ispe + 16 <= buf.length) {
      const width = buf.readUInt32BE(ispe + 8);
      const height = buf.readUInt32BE(ispe + 12);
      if (width > 0 && height > 0 && width <= 32000 && height <= 32000) {
        return { width, height };
      }
    }
  } catch {
    /* dimensions inconnues : l'import applique ses défauts */
  }
  return undefined;
}

// Cache dimensions + hash : clé `chemin|taille|mtime` (invalidation auto).
const META_CACHE = new Map();
const META_CACHE_MAX = 20000;

function fileMeta(abs, rel) {
  let st;
  try {
    st = statSync(abs);
  } catch {
    return null;
  }
  if (!st.isFile()) return null;
  const key = `${rel}|${st.size}|${st.mtimeMs}`;
  const hit = META_CACHE.get(key);
  if (hit) return { bytes: st.size, mtime: Math.floor(st.mtimeMs / 1000), ...hit };
  let meta = {};
  try {
    const buf = readFileSync(abs);
    meta.hash = createHash("sha1").update(buf).digest("hex");
    const dims = imageDims(buf);
    if (dims && dims.width > 0 && dims.height > 0) {
      meta.width = dims.width;
      meta.height = dims.height;
    }
  } catch {
    /* lecture impossible : on renvoie au moins taille et date */
  }
  if (META_CACHE.size >= META_CACHE_MAX) META_CACHE.clear();
  META_CACHE.set(key, meta);
  return { bytes: st.size, mtime: Math.floor(st.mtimeMs / 1000), ...meta };
}

// ── Auth, quota, HTTP ───────────────────────────────────────────────────────

function sameSecret(a, b) {
  if (!a || !b) return false;
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

function authorized(req) {
  if (CF_ID && CF_SECRET) {
    const id = req.headers["cf-access-client-id"];
    const secret = req.headers["cf-access-client-secret"];
    if (!sameSecret(Array.isArray(id) ? id[0] : (id ?? ""), CF_ID)) return false;
    if (!sameSecret(Array.isArray(secret) ? secret[0] : (secret ?? ""), CF_SECRET)) return false;
  }
  if (API_KEY) {
    const header = req.headers["x-api-key"];
    const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const key = Array.isArray(header) ? header[0] : (header ?? "");
    if (!sameSecret(key || bearer, API_KEY)) return false;
  }
  return true;
}

const RATE = new Map();
function rateLimited(ip) {
  if (!RATE_LIMIT_PER_MIN || RATE_LIMIT_PER_MIN <= 0) return false;
  const now = Date.now();
  const windowStart = now - (now % 60000);
  const hit = RATE.get(ip);
  if (!hit || hit.start !== windowStart) {
    RATE.set(ip, { start: windowStart, count: 1 });
    if (RATE.size > 5000) RATE.clear();
    return false;
  }
  hit.count += 1;
  return hit.count > RATE_LIMIT_PER_MIN;
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(payload);
}

const MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
};

function natural(a, b) {
  return a.localeCompare(b, "fr", { numeric: true });
}

function readBody(req, limit = 65536) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Corps en octets (upload) — même garde-fou de taille, sans décodage. */
function readBodyBuffer(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Endpoints ───────────────────────────────────────────────────────────────

function handleList(url, req, res) {
  const raw = url.searchParams.get("path");
  if (raw === null) {
    send(res, 400, { error: "Missing 'path' query param" });
    return;
  }
  const rel = raw.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  const refused = unsafeRefusal(rel);
  if (refused) {
    send(res, 400, refused);
    return;
  }
  const found = rel === "" ? { abs: ROOT, rel: "", stat: statSync(ROOT) } : pickExisting(rel);
  if (!found || !found.stat.isDirectory()) {
    send(res, 500, {
      error: "Failed to list folder",
      details: `ENOENT: no such file or directory, scandir '${rel}'`,
    });
    return;
  }
  let names;
  try {
    names = readdirSync(found.abs, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort(natural);
  } catch {
    send(res, 500, { error: "Failed to list folder", details: `ENOENT: scandir '${rel}'` });
    return;
  }
  const format = (url.searchParams.get("format") || "").toLowerCase();
  const pages = [];
  for (const name of names) {
    const childRel = found.rel ? `${found.rel}/${name}` : name;
    const meta = fileMeta(path.join(found.abs, name), childRel);
    if (!meta) continue;
    pages.push({ name, path: encodeRel(childRel), ...meta });
  }
  if (format === "object") {
    send(res, 200, { path: encodeRel(found.rel), count: pages.length, pages });
    return;
  }
  if (format === "urls") {
    const proto = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
    send(
      res,
      200,
      pages.map((p) => `${String(proto).split(",")[0].trim()}://${String(host).split(",")[0].trim()}/${p.path}`),
    );
    return;
  }
  send(res, 200, pages);
}

function handleTree(url, res) {
  const raw = (url.searchParams.get("path") ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  // `content` = alias historique de la racine (défaut de `nasTree`).
  const rel = raw === "" || raw === "content" ? "" : raw;
  const refused = unsafeRefusal(rel);
  if (refused) {
    send(res, 400, refused);
    return;
  }
  let found = rel === "" ? { abs: ROOT, rel: "", stat: statSync(ROOT) } : pickExisting(rel);
  if (!found && rel === "content") found = { abs: ROOT, rel: "", stat: statSync(ROOT) };
  if (!found || !found.stat.isDirectory()) {
    send(res, 500, {
      error: "Failed to list folder",
      details: `ENOENT: no such file or directory, scandir '${rel}'`,
    });
    return;
  }
  let dirents;
  try {
    dirents = readdirSync(found.abs, { withFileTypes: true }).filter((e) => !e.name.startsWith("."));
  } catch {
    send(res, 500, { error: "Failed to list folder", details: `ENOENT: scandir '${rel}'` });
    return;
  }
  const entries = dirents.map((e) => {
    const childRel = found.rel ? `${found.rel}/${e.name}` : e.name;
    const isDir = e.isDirectory();
    return { name: e.name, path: encodeRel(childRel), type: isDir ? "dir" : "file", isDir };
  });
  entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || natural(a.name, b.name));
  send(res, 200, entries);
}

function handleHealth(res) {
  let diskFreePct;
  try {
    const s = statfsSync(ROOT);
    if (s.blocks > 0) diskFreePct = Math.round(((s.bavail * s.bsize) / (s.blocks * s.bsize)) * 1000) / 10;
  } catch {
    /* disque illisible : on répond quand même `ok` sans le pourcentage */
  }
  send(res, 200, {
    status: "ok",
    ...(diskFreePct !== undefined
      ? { disk_free_pct: diskFreePct, disk: { free_pct: diskFreePct } }
      : {}),
    version: VERSION,
    uptime_s: Math.floor((Date.now() - STARTED_AT) / 1000),
  });
}

function handleFile(url, res, method) {
  const raw = url.searchParams.get("path");
  if (raw === null) {
    send(res, 400, { error: "Missing 'path' query param" });
    return;
  }
  const rel = raw.trim().replace(/^\/+/, "");
  if (rel === "" || unsafeRefusal(rel)) {
    send(res, 400, { error: rel === "" ? "Missing 'path' query param" : "invalid_path" });
    return;
  }
  const found = pickExisting(rel);
  if (!found || !found.stat.isFile()) {
    send(res, 404, { error: `ENOENT: no such file '${rel}'` });
    return;
  }
  const ext = path.extname(found.abs).toLowerCase();
  const headers = {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": String(found.stat.size),
    "Cache-Control": "public, max-age=86400",
    "X-Cache": "MISS",
  };
  if (method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  res.writeHead(200, headers);
  createReadStream(found.abs).on("error", () => {
    if (!res.headersSent) send(res, 500, { error: "Failed to read file" });
    else res.destroy();
  }).pipe(res);
}

async function handleMove(req, res) {
  if (!API_KEY) {
    send(res, 403, { error: "move_requires_api_key" });
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    send(res, 400, { error: "invalid_json" });
    return;
  }
  const from = String(body?.from ?? "").trim().replace(/^\/+/, "");
  const to = String(body?.to ?? "").trim().replace(/^\/+/, "");
  if (!from || !to || unsafeRefusal(from) || unsafeRefusal(to)) {
    send(res, 400, { error: !from || !to ? "missing_from_or_to" : "invalid_path" });
    return;
  }
  const src = pickExisting(from);
  if (!src) {
    send(res, 404, { error: `ENOENT: no such file or directory, '${from}'` });
    return;
  }
  const dst = confinedAbs(to);
  // Publication : seuls `staging/` et `public/` sont déplaçables.
  const rootOf = (r) => r.split("/")[0];
  if (!dst || !["staging", "public"].includes(rootOf(src.rel)) || !["staging", "public"].includes(rootOf(dst.rel))) {
    send(res, 403, { error: "move_restricted_to_staging_public" });
    return;
  }
  try {
    if (statSync(dst.abs)) {
      send(res, 409, { error: "target_exists" });
      return;
    }
  } catch {
    /* cible libre : on continue */
  }
  try {
    mkdirSync(path.dirname(dst.abs), { recursive: true });
    renameSync(src.abs, dst.abs);
  } catch {
    send(res, 500, { error: "move_failed" });
    return;
  }
  send(res, 200, { ok: true, from: encodeRel(src.rel), to: encodeRel(dst.rel) });
}

/**
 * `POST /upload?path=<rel>[&overwrite=1]` : écriture directe du corps brut.
 * Même politique que `/move` : clé obligatoire. Extensions limitées à
 * `UPLOAD_EXT` (un upload ne doit pas pouvoir remplacer une image servie).
 */
async function handleUpload(url, req, res) {
  if (!API_KEY) {
    send(res, 403, { error: "upload_requires_api_key" });
    return;
  }
  const raw = (url.searchParams.get("path") ?? "").trim().replace(/^\/+/, "");
  if (raw === "" || unsafeRefusal(raw)) {
    send(res, 400, { error: raw === "" ? "missing_path" : "invalid_path" });
    return;
  }
  const dst = confinedAbs(raw);
  if (!dst) {
    send(res, 400, { error: "invalid_path" });
    return;
  }
  if (!UPLOAD_EXT.has(path.extname(dst.abs).toLowerCase())) {
    send(res, 403, { error: "extension_not_allowed", allowed: [...UPLOAD_EXT] });
    return;
  }
  let body;
  try {
    body = await readBodyBuffer(req, UPLOAD_MAX_BYTES);
  } catch (e) {
    send(res, e && e.message === "body_too_large" ? 413 : 400, {
      error: e && e.message === "body_too_large" ? "body_too_large" : "body_read_failed",
    });
    return;
  }
  if (body.length === 0) {
    send(res, 400, { error: "empty_body" });
    return;
  }
  const overwrite = (url.searchParams.get("overwrite") ?? "") === "1";
  if (!overwrite) {
    try {
      if (statSync(dst.abs)) {
        send(res, 409, { error: "target_exists" });
        return;
      }
    } catch {
      /* cible libre : on continue */
    }
  }
  try {
    mkdirSync(path.dirname(dst.abs), { recursive: true });
    writeFileSync(dst.abs, body);
  } catch {
    send(res, 500, { error: "upload_failed" });
    return;
  }
  send(res, 200, { ok: true, path: encodeRel(dst.rel), bytes: body.length });
}

// ── Serveur ─────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const started = Date.now();
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?";
  res.on("finish", () => {
    console.log(
      JSON.stringify({ ts: new Date().toISOString(), ip, method: req.method, route: req.url?.split("?")[0], status: res.statusCode, ms: Date.now() - started }),
    );
  });
  const done = (code, body, headers) => {
    send(res, code, body, headers);
  };
  try {
    if (rateLimited(ip)) {
      done(429, { error: "rate_limited" });
      return;
    }
    if (!authorized(req)) {
      done(401, { error: "unauthorized" });
      return;
    }
    const url = new URL(req.url || "/", "http://nas-api");
    const routePath = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
    const method = (req.method || "GET").toUpperCase();
    if (routePath === "/list" && method === "GET") {
      handleList(url, req, res);
      return;
    }
    if (routePath === "/tree" && method === "GET") {
      handleTree(url, res);
      return;
    }
    if (routePath === "/health" && method === "GET") {
      handleHealth(res);
      return;
    }
    if (routePath === "/file" && (method === "GET" || method === "HEAD")) {
      handleFile(url, res, method);
      return;
    }
    if (routePath === "/move" && method === "POST") {
      await handleMove(req, res);
      return;
    }
    if (routePath === "/upload" && method === "POST") {
      await handleUpload(url, req, res);
      return;
    }
    done(404, { error: "not_found" });
  } catch {
    if (!res.headersSent) done(500, { error: "internal_error" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg: "nas-api ready", port: PORT, root: ROOT, auth: Boolean(API_KEY || (CF_ID && CF_SECRET)) }));
});
