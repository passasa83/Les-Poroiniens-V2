import "server-only";
import { createHmac } from "node:crypto";
import type { ScanPage } from "@/lib/types";

/**
 * Système d'images NAS → Cloudflare.
 *
 * Toutes les variables sont lues côté serveur : le navigateur ne reçoit que
 * des URLs publiques déjà construites (`img.` + chemin relatif + version).
 * Les chemins stockés en base sont **toujours relatifs**
 * (`public/<slug>/chapitres/0012/001.webp`) : changer de domaine ou de CDN
 * ne demande aucune migration.
 */
export function imageEnv() {
  const strip = (value: string | undefined) => (value ?? "").replace(/\/+$/, "");
  return {
    /** Domaine public qui sert les fichiers : `img.`. */
    imgBase: strip(process.env.IMG_BASE_URL || process.env.CDN_BASE_URL),
    /** API privée de listing du NAS : `api-img.`. */
    nasApiBase: strip(process.env.NAS_API_BASE || process.env.NAS_API_URL),
    /** Signature HMAC des URLs à durée courte. */
    signingSecret: process.env.IMG_SIGNING_SECRET || process.env.AUTH_SECRET || "",
    /** Purge ciblée du cache Cloudflare. */
    cfToken: process.env.CF_API_TOKEN || "",
    cfZone: process.env.CF_ZONE_ID || "",
    /** Transformation d'images Cloudflare (`/cdn-cgi/image/`), opt-in. */
    cdnTransform: process.env.IMG_CDN_BLUR === "1",
  };
}

/** État des variables d'environnement, affiché dans l'espace Gérant. */
export function imageEnvStatus(): Record<string, boolean> {
  const env = imageEnv();
  return {
    IMG_BASE_URL: Boolean(env.imgBase),
    NAS_API_BASE: Boolean(env.nasApiBase),
    IMG_SIGNING_SECRET: Boolean(process.env.IMG_SIGNING_SECRET),
    CF_API_TOKEN: Boolean(env.cfToken && env.cfZone),
    IMG_CDN_BLUR: env.cdnTransform,
  };
}

const REMOTE = /^https?:\/\//i;
const SIGNED_TTL_SECONDS = 600; // 10 minutes

function hmac(payload: string): string {
  const key = imageEnv().signingSecret || "dev-secret-a-changer";
  return createHmac("sha256", key).update(payload).digest("base64url");
}

/** `?v=<hash 8 car.>` : l'URL change à chaque remplacement de page. */
function versionParam(hash?: string | null): string {
  return hash ? `v=${hash.slice(0, 8)}` : "";
}

function withQuery(url: string, params: string[]): string {
  const query = params.filter(Boolean).join("&");
  if (!query) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

/**
 * URL d'une page de scan :
 * - chemin local `/api/img/…` (démo) : servi tel quel ;
 * - chemin relatif NAS : `${IMG_BASE_URL}/${chemin}?v=<hash>` ;
 * - URL complète héritée des données existantes : conservée, versionnée ;
 * - sans CDN : proxy interne `/api/image` (jamais utilisable en prod).
 * `signed = true` ajoute `exp`/`sig` pour les chapitres non publiés.
 */
export function pageUrl(
  page: Pick<ScanPage, "chemin" | "hash">,
  opts: { signed?: boolean } = {},
): string {
  const raw = (page.chemin ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("/") || raw.startsWith("data:")) return raw;

  const env = imageEnv();
  const remote = REMOTE.test(raw);
  if (!remote && !env.imgBase) {
    return `/api/image?path=${encodeURIComponent(raw)}`;
  }

  const url = remote ? raw : `${env.imgBase}/${raw.replace(/^\/+/, "")}`;
  const params = [versionParam(page.hash)];
  if (opts.signed) {
    const exp = Math.floor(Date.now() / 1000) + SIGNED_TTL_SECONDS;
    params.push(`exp=${exp}`, `sig=${hmac(`${raw}|${exp}`)}`);
  }
  return withQuery(url, params);
}

/** Vérification d'une URL signée (utilisée par les routes de prévisualisation). */
export function verifySignature(path: string, exp: string, sig: string): boolean {
  const expMs = Number(exp) * 1000;
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false;
  return hmac(`${path}|${exp}`) === sig;
}

/* ── Couvertures et bannières ──────────────────────────────────── */

/** Version d'URL dérivée de la dernière mise à jour de la série. */
function coverVersion(version?: string | null): string {
  if (!version) return "";
  return version.replace(/[^0-9]/g, "").slice(0, 14);
}

/**
 * Résout la couverture d'une série vers une URL servable.
 * - vide → couverture générée `/api/img/cover/<slug>` (démo) ;
 * - chemin relatif NAS → `${IMG_BASE_URL}/…` ;
 * - URL complète → inchangée (données migrées de l'ancien site).
 */
export function resolveCover(couverture: string | null | undefined, version?: string | null): string {
  const raw = (couverture ?? "").trim();
  if (!raw) return "";
  // Version déjà présente dans l'URL : on ne la touche pas.
  if (/[?&]v=/.test(raw)) return raw;

  const v = coverVersion(version);
  if (raw.startsWith("/") || REMOTE.test(raw)) return withQuery(raw, [v]);

  const env = imageEnv();
  if (!env.imgBase) return raw;
  return withQuery(`${env.imgBase}/${raw.replace(/^\/+/, "")}`, [v]);
}

/** Variante floue servie par le CDN pour le contenu +18. */
export function coverBlurUrl(url: string): string | null {
  const env = imageEnv();
  if (!env.cdnTransform || !env.imgBase || !url.startsWith(`${env.imgBase}/`)) return null;
  const relative = url.slice(env.imgBase.length + 1);
  return `${env.imgBase}/cdn-cgi/image/blur=60,width=600/${relative}`;
}

/** Inverse de `resolveCover` : on ne réécrit jamais une URL en chemin stockable. */
export function storeCover(couverture: string | null | undefined): string {
  const raw = (couverture ?? "").trim();
  if (!raw) return "";
  const base = imageEnv().imgBase;
  // URL du CDN ou route locale : on stocke le chemin relatif (sans query).
  if (base && raw.startsWith(`${base}/`)) return raw.slice(base.length + 1).split("?")[0];
  if (raw.startsWith("/")) return raw.split("?")[0];
  // URL externe (ancien site, service tiers) : conservée avec sa signature.
  return raw;
}
