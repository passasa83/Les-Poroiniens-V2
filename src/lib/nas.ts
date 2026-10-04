import "server-only";
import { imageEnv } from "@/lib/media";

/**
 * Client de l'API du NAS (§4) — appelé **uniquement depuis le serveur**.
 *
 * `api-img.` est privé (Cloudflare Access ou clé) : le navigateur ne l'atteint
 * jamais. Tous les chemins sont normalisés, bornés à 500 caractères et
 * interdisent `..` (§4.3), et chaque appel dispose d'un délai.
 */
export type NasPage = {
  name: string;
  path: string;
  width?: number;
  height?: number;
  bytes?: number;
  hash?: string;
  mtime?: number;
};

export type NasEntry = { name: string; path: string; isDir: boolean };

export type NasHealth = {
  ok: boolean;
  reason?: string;
  latencyMs?: number;
  diskFreePct?: number;
  detail?: string;
};

export type NasErrorCode =
  | "unconfigured"
  | "invalid_path"
  | "http_error"
  | "unreachable"
  | "timeout"
  | "protocol";

export class NasError extends Error {
  readonly code: NasErrorCode;
  readonly status?: number;
  constructor(code: NasErrorCode, message: string, status?: number) {
    super(message);
    this.name = "NasError";
    this.code = code;
    this.status = status;
  }
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;
const DEFAULT_TIMEOUT_MS = 15_000;

export function nasConfigured(): boolean {
  return Boolean(imageEnv().nasApiBase);
}

/** Contrôle anti path traversal (§4.3) : ni `..`, ni antislash, ni disque local. */
export function isSafePath(value: string): boolean {
  if (!value || value.length > 500) return false;
  if (value.includes("\0") || value.includes("\\")) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  if (value.split("/").some((seg) => seg === "..")) return false;
  return true;
}

/** En-têtes d'authentification : service token Access + clé d'API (§4.3). */
export function nasHeaders(): Record<string, string> {
  const out: Record<string, string> = { Accept: "application/json" };
  const id = process.env.NAS_API_CLIENT_ID;
  const secret = process.env.NAS_API_CLIENT_SECRET;
  if (id && secret) {
    // Service token Cloudflare Access (§4.3)
    out["CF-Access-Client-Id"] = id;
    out["CF-Access-Client-Secret"] = secret;
  }
  const key = process.env.NAS_API_KEY;
  if (key) {
    out["X-Api-Key"] = key;
    out.Authorization = `Bearer ${key}`;
  }
  return out;
}

async function nasRequest<T>(
  endpoint: string,
  opts: {
    method?: "GET" | "POST";
    query?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const base = imageEnv().nasApiBase;
  if (!base) throw new NasError("unconfigured", "API du NAS non configurée.");

  const url = new URL(`${base}/${endpoint.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(opts.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        ...nasHeaders(),
        ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new NasError(
      timedOut ? "timeout" : "unreachable",
      timedOut ? "Délai dépassé auprès de l'API du NAS." : "Impossible de joindre l'API du NAS.",
    );
  }

  if (!res.ok) {
    throw new NasError("http_error", `L'API du NAS a répondu ${res.status}.`, res.status);
  }

  try {
    return (await res.json()) as T;
  } catch {
    throw new NasError("protocol", "Réponse illisible de l'API du NAS.");
  }
}

function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    for (const key of ["pages", "entries", "items", "files", "children"]) {
      if (Array.isArray(row[key])) return row[key] as unknown[];
    }
  }
  return [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function normalizePath(base: string, name: string): string {
  const clean = name.replace(/^[./]+/, "");
  return `${base.replace(/\/+$/, "")}/${clean}`.replace(/\/+/g, "/").replace(/^\//, "");
}

function toEntry(raw: unknown, basePath: string): NasEntry | null {
  if (typeof raw === "string") {
    const isDir = raw.endsWith("/");
    const name = raw.replace(/\/+$/, "");
    if (!name) return null;
    return { name, path: normalizePath(basePath, name), isDir };
  }
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const rawName = str(row.name) || str(row.filename) || str(row.path) || str(row.url);
  if (!rawName) return null;
  const name = rawName.replace(/\/+$/, "").split("/").pop() ?? rawName;
  const type = str(row.type);
  const isDir =
    type === "dir" || type === "directory" || type === "folder" || row.is_dir === true;
  const path = str(row.path) || str(row.url) || normalizePath(basePath, name);
  return { name, path: path.replace(/^\//, ""), isDir };
}

function toPage(raw: unknown, basePath: string): NasPage | null {
  const entry = toEntry(raw, basePath);
  if (!entry || entry.isDir || !IMAGE_EXT.test(entry.name)) return null;
  const row = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    name: entry.name,
    path: entry.path,
    width: num(row.width) ?? num(row.w),
    height: num(row.height) ?? num(row.h),
    bytes: num(row.bytes) ?? num(row.size),
    hash: str(row.hash) || str(row.checksum) || str(row.sha1) || undefined,
    mtime: num(row.mtime) ?? num(row.modified),
  };
}

/** Tri naturel garanti côté API : `002` avant `010` (§4.2). */
function natural(a: string, b: string): number {
  return a.localeCompare(b, "fr", { numeric: true });
}

/** `GET /list?path=` — pages d'un dossier de chapitre (§4.1). */
export async function nasList(path: string): Promise<{ path: string; count: number; pages: NasPage[] }> {
  if (!isSafePath(path)) {
    throw new NasError("invalid_path", "Chemin refusé (validation anti traversal).");
  }
  const data = await nasRequest<unknown>("list", { query: { path } });
  const pages = asArray(data)
    .map((raw) => toPage(raw, path))
    .filter((page): page is NasPage => page !== null)
    .sort((a, b) => natural(a.name, b.name));
  return { path, count: pages.length, pages };
}

/** `GET /tree?path=` — arborescence pour l'écran d'import (§4.1). */
export async function nasTree(path: string): Promise<{ path: string; entries: NasEntry[] }> {
  const safe = path && isSafePath(path) ? path : "content";
  const data = await nasRequest<unknown>("tree", { query: { path: safe } });
  const entries = asArray(data)
    .map((raw) => toEntry(raw, safe))
    .filter((entry): entry is NasEntry => entry !== null)
    .sort((a, b) => Number(b.isDir) - Number(a.isDir) || natural(a.name, b.name));
  return { path: safe, entries };
}

/** `GET /health` — état du NAS (§9.1). Tolère une API sans `/health`. */
export async function nasHealth(): Promise<NasHealth> {
  if (!nasConfigured()) return { ok: false, reason: "nas_not_configured" };
  const started = Date.now();
  try {
    const data = await nasRequest<Record<string, unknown>>("health", { timeoutMs: 5_000 });
    const latencyMs = Date.now() - started;
    const disk =
      data?.disk && typeof data.disk === "object"
        ? (data.disk as Record<string, unknown>)
        : undefined;
    const rawDisk =
      data?.disk_free_pct ?? data?.diskFreePct ?? data?.free_pct ?? disk?.free_pct ?? disk?.free;
    const diskFreePct = Number(rawDisk);
    const status = String(data?.status ?? data?.state ?? "ok").toLowerCase();
    const ok = status !== "error" && status !== "down" && status !== "ko";
    return {
      ok,
      reason: ok ? undefined : status,
      latencyMs,
      ...(Number.isFinite(diskFreePct) ? { diskFreePct } : {}),
      detail: typeof data?.version === "string" ? (data.version as string) : undefined,
    };
  } catch (err) {
    const latencyMs = Date.now() - started;
    if (err instanceof NasError && err.code === "http_error") {
      const status = err.status ?? 0;
      // `/health` absent (404) : l'API répond, donc elle est en service.
      if (status === 404 || status === 405) return { ok: true, latencyMs, reason: "health_unsupported" };
      if (status === 401 || status === 403) return { ok: false, latencyMs, reason: "auth_failed" };
      if (status >= 500) return { ok: false, latencyMs, reason: `http_${status}` };
      return { ok: true, latencyMs };
    }
    return {
      ok: false,
      latencyMs,
      reason: err instanceof NasError ? err.code : "unreachable",
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}

/**
 * `POST /move` — `staging/` → `public/` à la publication (§3.4).
 * Best effort : une API qui n'implémente pas `/move` ne bloque pas la
 * publication, l'erreur est remontée à l'appelant pour signalement.
 */
export async function nasMove(from: string, to: string): Promise<void> {
  if (!isSafePath(from) || !isSafePath(to)) {
    throw new NasError("invalid_path", "Chemin de déplacement refusé.");
  }
  await nasRequest<unknown>("move", {
    method: "POST",
    body: { from, to },
    timeoutMs: 30_000,
  });
}

/** Message français prêt à afficher à l'espace Gérant. */
export function nasErrorMessage(err: unknown): string {
  if (err instanceof NasError) return err.message;
  return "Erreur inconnue lors de l'appel au NAS.";
}
