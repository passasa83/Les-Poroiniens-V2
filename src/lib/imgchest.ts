import "server-only";
import { cached } from "@/lib/db";

/**
 * Client ImgChest (source d'images du site).
 *
 * Un chapitre = un album ImgChest (`https://imgchest.com/p/<id>`) : les pages
 * sont servies **directement depuis le CDN** (`cdn.imgchest.com`), aucune
 * transformation ni copie n'est nécessaire. Côté serveur on ne fait que
 * résoudre l'album en liste d'URLs, qu'on met en cache (30 jours, comme
 * l'ancien worker Cloudflare) pour ne pas re-scrapé la page à chaque lecture.
 *
 * Les URLs stockées en base sont des URLs **complètes** : `pageUrl()` les
 * transmet telles quelles (cas « URL héritée »).
 *
 * Tout est appelé depuis le serveur : le navigateur ne parle jamais à
 * ImgChest, et la clé d'API (si fournie) ne quitte jamais Vercel.
 */

const USER_AGENT = "Les-Poroiniens-Reader/2.0 (+https://lesporoiniens.org)";
const DEFAULT_TIMEOUT_MS = 15_000;
/** Cache des fichiers d'un album : les fichiers d'un post ne changent pas. */
const POST_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Cache de la liste des albums du compte. */
const LIST_TTL_MS = 60 * 60 * 1000;
const PAGE_SIZE = 24;

export type ImgChestErrorCode =
  | "unconfigured"
  | "invalid_id"
  | "http_error"
  | "unreachable"
  | "timeout"
  | "protocol";

export class ImgChestError extends Error {
  readonly code: ImgChestErrorCode;
  readonly status?: number;
  constructor(code: ImgChestErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ImgChestError";
    this.code = code;
    this.status = status;
  }
}

/** Identifiant d'album : 4 à 32 caractères alphanumériques (`qe4gwgozq7j`). */
const POST_ID = /^[a-z0-9]{4,32}$/i;

export type ImgChestFile = {
  /** URL CDN complète, servie telle quelle au lecteur. */
  url: string;
  position: number;
  width?: number;
  height?: number;
  bytes?: number;
  /** Identifiant du fichier ImgChest : sert de hash de version (`?v=`). */
  hash?: string;
  type?: string;
};

export type ImgChestPost = {
  id: string;
  title: string;
  views: number;
  nsfw: boolean;
  files: ImgChestFile[];
};

export type ImgChestPostSummary = {
  id: string;
  title: string;
  views: number;
  nsfw: boolean;
  /** Miniature : utile pour reconnaître un album dans l'import. */
  thumbnail: string | null;
  created: string | null;
};

function strip(value: string | undefined): string {
  return (value ?? "").replace(/\/+$/, "");
}

export function imgchestEnv() {
  return {
    /** Facultatif : surcharge du domaine (miroir, proxy interne). */
    apiBase: strip(process.env.IMG_CHEST_API_BASE) || "https://imgchest.com",
    /** Compte du Gérant : requis uniquement pour lister ses albums. */
    username: (process.env.IMG_CHEST_USERNAME ?? "").trim(),
    /** Clé d'API : envoyée en `Authorization: Bearer` si elle est fournie. */
    apiKey: (process.env.IMG_CHEST_API_KEY ?? "").trim(),
  };
}

/** Variable d'état affichée dans l'espace Gérant. */
export function imgchestEnvStatus(): Record<string, boolean> {
  const env = imgchestEnv();
  return {
    IMG_CHEST_USERNAME: Boolean(env.username),
    IMG_CHEST_API_KEY: Boolean(env.apiKey),
  };
}

/** La lecture d'un album est publique : seule la liste demande un compte. */
export function imgchestListAvailable(): boolean {
  return Boolean(imgchestEnv().username);
}

function headers(): Record<string, string> {
  const out: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "*/*",
  };
  const { apiKey } = imgchestEnv();
  if (apiKey) {
    out.Authorization = `Bearer ${apiKey}`;
    out["X-Api-Key"] = apiKey;
  }
  return out;
}

async function request(url: string, accept: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...headers(), Accept: accept },
      cache: "no-store",
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch (err) {
    const timedOut =
      err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ImgChestError(
      timedOut ? "timeout" : "unreachable",
      timedOut
        ? "Délai dépassé auprès d'ImgChest."
        : "Impossible de joindre ImgChest.",
    );
  }
  if (!res.ok) {
    throw new ImgChestError(
      "http_error",
      `ImgChest a répondu ${res.status}.`,
      res.status,
    );
  }
  return res;
}

/** Décodage des entités HTML d'un attribut JSON (`data-page`). */
function decodeAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Normalise les fichiers d'un album (`props.post.files`, repli
 * `props.files` observé sur l'ancien site) : `link || url`, entrées
 * non-URL et vidéos écartées, triées par `position`.
 */
function toFiles(raw: unknown): ImgChestFile[] {
  if (!Array.isArray(raw)) return [];
  const files = raw.flatMap((entry, order): ImgChestFile[] => {
    const row = (typeof entry === "string" ? { link: entry } : entry) as Record<string, unknown> | null;
    if (!row || typeof row !== "object") return [];
    const url =
      typeof row.link === "string" && row.link.trim()
        ? row.link.trim()
        : typeof row.url === "string"
          ? row.url.trim()
          : "";
    if (!url || !/^https?:\/\//i.test(url)) return [];
    if (row.mp4 === 1 || row.mp4 === true || /\.mp4($|\?)/i.test(url)) return [];
    return [
      {
        url,
        position: num(row.position) ?? order + 1,
        width: num(row.width),
        height: num(row.height),
        bytes: num(row.size),
        hash: typeof row.id === "string" && row.id ? row.id : undefined,
        type: typeof row.type === "string" ? row.type : undefined,
      },
    ];
  });
  return files.sort((a, b) => a.position - b.position);
}

/** `GET /p/<id>` : la page embarque l'album entier dans `data-page`. */
export async function imgchestPost(postId: string): Promise<ImgChestPost> {
  const id = (postId ?? "").trim();
  if (!POST_ID.test(id)) {
    throw new ImgChestError("invalid_id", "Identifiant d'album ImgChest invalide.");
  }

  return cached(`imgchest:post:${id}`, POST_TTL_MS, async () => {
    const res = await request(`${imgchestEnv().apiBase}/p/${id}`, "text/html");
    const html = await res.text();
    const match = html.match(/<div id="app" data-page="([^"]+)"><\/div>/);
    if (!match || !match[1]) {
      throw new ImgChestError(
        "protocol",
        "Réponse inattendue d'ImgChest (album introuvable ou page protégée).",
      );
    }

    let data: unknown;
    try {
      data = JSON.parse(decodeAttribute(match[1]));
    } catch {
      throw new ImgChestError("protocol", "Album illisible : données JSON invalides.");
    }

    const props = (data as { props?: { post?: Record<string, unknown>; files?: unknown } } | null)?.props;
    const post = props?.post;
    // Repli observé sur l'ancien site (`proxy.routes.js`) : certains albums
    // exposent leurs fichiers en `props.files` plutôt qu'en `props.post.files`.
    const files = toFiles(post && typeof post === "object" ? (post.files ?? props?.files) : props?.files);
    if (files.length === 0) {
      throw new ImgChestError("protocol", "Aucune image trouvée dans cet album.");
    }

    return {
      id: typeof post?.slug === "string" && post.slug ? post.slug : typeof post?.id === "string" ? post.id : id,
      title: typeof post?.title === "string" ? post.title : "",
      views: num(post?.views) ?? 0,
      nsfw: post?.nsfw === 1 || post?.nsfw === true,
      files,
    } satisfies ImgChestPost;
  });
}

/**
 * `GET /api/posts?username=` — albums les plus récents du compte, utilisés
 * par l'onglet d'import pour choisir le chapitre à indexer.
 */
export async function imgchestListPosts(
  page = 1,
): Promise<{ posts: ImgChestPostSummary[]; page: number; hasMore: boolean }> {
  const { apiBase, username } = imgchestEnv();
  if (!username) {
    throw new ImgChestError(
      "unconfigured",
      "IMG_CHEST_USERNAME manquante : la liste des albums est indisponible.",
    );
  }

  const current = Math.max(1, Math.min(50, Math.trunc(page) || 1));
  return cached(`imgchest:list:${current}`, LIST_TTL_MS, async () => {
    const url = new URL(`${apiBase}/api/posts`);
    url.searchParams.set("username", username);
    url.searchParams.set("sort", "new");
    url.searchParams.set("page", String(current));
    url.searchParams.set("status", "0");

    const res = await request(url.toString(), "application/json");
    let payload: { data?: unknown };
    try {
      payload = await res.json();
    } catch {
      throw new ImgChestError("protocol", "Réponse illisible d'ImgChest.");
    }

    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const posts = rows.flatMap((raw): ImgChestPostSummary[] => {
      if (!raw || typeof raw !== "object") return [];
      const row = raw as Record<string, unknown>;
      const id =
        typeof row.slug === "string" && row.slug
          ? row.slug
          : typeof row.id === "string"
            ? row.id
            : "";
      if (!id) return [];
      const thumb = row.thumbnail;
      const thumbUrl =
        typeof thumb === "string"
          ? thumb
          : thumb && typeof thumb === "object" && typeof (thumb as { link?: unknown }).link === "string"
            ? ((thumb as { link: string }).link)
            : null;
      return [
        {
          id,
          title: typeof row.title === "string" && row.title ? row.title : "Sans titre",
          views: num(row.views) ?? 0,
          nsfw: row.nsfw === 1 || row.nsfw === true,
          thumbnail: thumbUrl,
          created: typeof row.created === "string" ? row.created : null,
        },
      ];
    });

    return { posts, page: current, hasMore: rows.length >= PAGE_SIZE };
  });
}

/** Message français prêt à afficher à l'espace Gérant. */
export function imgchestErrorMessage(err: unknown): string {
  if (err instanceof ImgChestError) return err.message;
  return "Erreur inconnue lors de l'appel à ImgChest.";
}
