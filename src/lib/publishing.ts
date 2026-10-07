import "server-only";
import { purgeCloudflare } from "@/lib/cloudflare";
import { getDb, invalidate, TABLES } from "@/lib/db";
import { imageEnv, pageUrl } from "@/lib/media";
import { nasConfigured, nasErrorMessage, nasMove } from "@/lib/nas";
import { getPages, saveChapter } from "@/lib/data/chapters";
import { audit } from "@/lib/data/moderation";
import type { Chapter, ScanPage } from "@/lib/types";

/**
 * Passage `staging/` ↔ `public/` à la publication.
 *
 * L'état d'un chapitre est **dérivé du chemin stocké en base** : tant que les
 * pages commencent par `staging/`, aucune URL publique n'existe ; à la
 * publication le dossier est déplacé par le NAS et les chemins sont réécrits.
 * Chaque étape est best effort : une API sans `/move` ne bloque jamais la
 * publication, l'erreur est seulement remontée pour signalement.
 */
export type FileTransition = {
  action: "moved" | "none" | "error";
  from?: string;
  to?: string;
  /** Nombre de chemins réécrits en base. */
  rewritten: number;
  /** URLs envoyées à la purge Cloudflare. */
  purged: number;
  error?: string;
};

function folderOf(path: string): string | null {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : null;
}

function isRelativeNas(path: string): boolean {
  return Boolean(path) && !path.startsWith("/") && !/^https?:\/\//i.test(path);
}

async function rewritePrefix(chapterId: string, from: string, to: string): Promise<number> {
  const pages = await getPages(chapterId);
  const db = getDb();
  let rewritten = 0;
  for (const page of pages) {
    if (!page.chemin.startsWith(`${from}/`)) continue;
    await db.update(TABLES.pages, page.id, { chemin: `${to}${page.chemin.slice(from.length)}` });
    rewritten++;
  }
  invalidate("chapter-pages:");
  return rewritten;
}

async function purgePublicUrls(pages: ScanPage[]): Promise<number> {
  const env = imageEnv();
  if (!env.imgBase) return 0;
  const urls = pages.map((page) => pageUrl(page)).filter((url) => /^https?:\/\//i.test(url));
  const result = await purgeCloudflare(urls);
  return result.purged;
}

export async function transitionChapterFiles(
  chapter: Chapter,
  direction: "publish" | "unpublish",
): Promise<FileTransition> {
  const pages = await getPages(chapter.id);
  if (pages.length === 0) return { action: "none", rewritten: 0, purged: 0 };

  const folder = folderOf(pages[0].chemin ?? "");
  // Chemins locaux (démo) ou URLs externes : rien à déplacer sur le NAS.
  if (!folder || !isRelativeNas(pages[0].chemin)) {
    return { action: "none", rewritten: 0, purged: 0 };
  }

  const root = folder.split("/")[0];
  const wantRoot = direction === "publish" ? "public" : "staging";
  if (root !== "staging" && root !== "public") {
    // Arborescence inconnue : on ne touche à rien plutôt que de deviner.
    return { action: "none", rewritten: 0, purged: 0 };
  }
  if (root === wantRoot) {
    // Déjà dans l'état voulu : inutile de déplacer, on rafraîchit seulement
    // le cache (utile si des pages ont été remplacées sur le NAS).
    const purged = direction === "publish" ? await purgePublicUrls(pages) : 0;
    return { action: "none", rewritten: 0, purged };
  }

  const target = `${wantRoot}${folder.slice(root.length)}`;
  if (!nasConfigured()) {
    return {
      action: "error",
      from: folder,
      to: target,
      rewritten: 0,
      purged: 0,
      error: "NAS non configuré : les chemins n'ont pas été déplacés.",
    };
  }

  try {
    await nasMove(folder, target);
  } catch (err) {
    return {
      action: "error",
      from: folder,
      to: target,
      rewritten: 0,
      purged: 0,
      error: nasErrorMessage(err),
    };
  }

  const rewritten = await rewritePrefix(chapter.id, folder, target);
  const purged = direction === "publish" ? await purgePublicUrls(pages) : 0;
  return { action: "moved", from: folder, to: target, rewritten, purged };
}

/**
 * Publication des chapitres programmés (étape 4) : appelée par le cron
 * de revalidation. Chaque publication bascule ses fichiers vers `public/` et
 * est tracée au journal d'audit avec l'acteur `cron`.
 */
export async function publishDueChapters(limit = 50): Promise<{
  published: string[];
  errors: { id: string; error: string }[];
}> {
  const { items } = await getDb().list<Chapter>(TABLES.chapters, {
    filters: [
      { field: "statut", op: "eq", value: "scheduled" },
      { field: "publish_at", op: "lte", value: new Date().toISOString() },
    ],
    order: { field: "publish_at", dir: "asc" },
    limit,
  });

  const published: string[] = [];
  const errors: { id: string; error: string }[] = [];

  for (const chapter of items) {
    try {
      const updated = await saveChapter({ id: chapter.id, statut: "published" });
      const nas = await transitionChapterFiles(updated, "publish");
      if (nas.action === "error") errors.push({ id: chapter.id, error: nas.error ?? "erreur NAS" });
      await audit({
        actorId: "cron",
        actorPseudo: "cron",
        action: "chapter.publish",
        cible: `chapter:${chapter.id}`,
        avant: { statut: chapter.statut, publish_at: chapter.publish_at },
        apres: {
          statut: "published",
          publish_at: updated.publish_at,
          source: "cron",
          nasMove: nas.action,
          nasError: nas.error ?? null,
        },
        ip: "cron",
      });
      invalidate("recent-chapters:");
      published.push(chapter.id);
    } catch (err) {
      errors.push({
        id: chapter.id,
        error: err instanceof Error ? err.message : "erreur inconnue",
      });
    }
  }

  return { published, errors };
}

/**
 * Publication à la demande des chapitres programmés.
 *
 * Le plan Hobby de Vercel limite les crons à **une exécution par jour** : le
 * cron quotidien reste la source principale, mais dès qu'un lecteur ouvre une
 * fiche série ou un chapitre, on vérifie qu'aucun chapitre programmé n'est
 * arrivé à échéance, pour que la lecture ne dépende pas de l'horaire du cron.
 *
 * Le coût est une requête indexée (`statut` + `publish_at`) ; la publication
 * elle-même n'est déclenchée que si un chapitre est effectivement dû, et au
 * plus une fois par minute et par instance pour éviter les doublons.
 */
let lastPublishRun = 0;

export async function publishDueChaptersOnDemand(): Promise<void> {
  try {
    const { items } = await getDb().list<{ id: string }>(TABLES.chapters, {
      filters: [
        { field: "statut", op: "eq", value: "scheduled" },
        { field: "publish_at", op: "lte", value: new Date().toISOString() },
      ],
      limit: 1,
    });
    if (items.length === 0) return;

    const now = Date.now();
    if (now - lastPublishRun < 60_000) return;
    lastPublishRun = now;

    const { published, errors } = await publishDueChapters();
    if (published.length > 0) {
      console.info(`[publishing] chapitres programmés publiés : ${published.join(", ")}`);
    }
    for (const error of errors) console.error(`[publishing] ${error.id} : ${error.error}`);
  } catch (err) {
    console.error("[publishing] publication à la demande impossible", err);
  }
}
