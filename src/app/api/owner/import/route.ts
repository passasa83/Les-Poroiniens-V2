import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit, createImportJob, updateImportJob } from "@/lib/data/moderation";
import { refreshSeriesChapterCount } from "@/lib/data/chapters";
import { getSeriesById } from "@/lib/data/series";
import { getDb, rowId, TABLES } from "@/lib/db";
import { demoPagePath } from "@/lib/db/seed";
import { nasErrorMessage, nasList, type NasPage } from "@/lib/nas";
import { imgchestErrorMessage, imgchestPost as fetchImgChestPost } from "@/lib/imgchest";
import { transitionChapterFiles, type FileTransition } from "@/lib/publishing";
import type { Chapter } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

const importInput = z.object({
  series_id: z.string().trim().min(1).max(64),
  numero: z.number().int().min(1).max(100000),
  titre: z.string().trim().max(200).default(""),
  volume: z.number().int().min(1).max(999).nullable().default(null),
  classification: z.enum(["all", "adult"]).default("all"),
  /** `upload` : noms déposés ; `nas` : dossier déjà présent sur le NAS (§5.1) ;
   *  `imgchest` : album ImgChest déjà publié par le Gérant. */
  source: z.enum(["upload", "nas", "imgchest"]).default("upload"),
  /** Dossier du NAS : si renseigné, le listing est fait **côté serveur** (§4.1). */
  chemin: z.string().trim().max(500).optional(),
  /** Identifiant d'album ImgChest (`qe4gwgozq7j`) : résolu côté serveur. */
  imgchest_post: z.string().trim().max(64).optional(),
  /** Noms de fichiers uniquement (les octets ne transitent pas par Vercel). */
  pages: z.array(z.string().trim().min(1).max(255)).max(5000).default([]),
  /** Brouillon (défaut), programmé ou publié directement (§5.1, étape 4). */
  statut: z.enum(["draft", "scheduled", "published"]).default("draft"),
  publish_at: z.string().datetime({ offset: true }).nullable().default(null),
});

/** Tri naturel : `page 2` avant `page 10` (§10.2). */
function naturalSort(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

type IndexedPage = {
  chemin: string;
  largeur: number;
  hauteur: number;
  bytes?: number;
  hash?: string;
};

/**
 * POST /api/owner/import — import d'un chapitre (Gérant exclusif, §5).
 *
 * Trois sources d'indexation :
 * - `imgchest` : album déjà publié par le Gérant — les URLs CDN du fichier
 *   sont résolues ici puis stockées en base (la lecture n'appelle pas ImgChest) ;
 * - `chemin` renseigné : listing serveur via `GET /list` — largeurs, hauteurs,
 *   poids et hash sont lus sur le NAS puis stockés en base (§5.2) ;
 * - sinon : indexation des seuls noms, avec pages de démonstration si le NAS
 *   n'est pas configuré (dégradé assumé pour remplir et tester le site).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "import_chapters")) {
    return jsonError(
      "L'import de contenu est réservé au Gérant.",
      "owner_only",
      403,
    );
  }

  const ip = clientIp(request);
  const limit = rateLimit(`owner:import:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop d'imports en une minute.", "rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }

  const parsed = importInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }

  const data = parsed.data;
  const nasPath = data.chemin?.trim().replace(/^\/+/, "").replace(/\/+$/, "") || "";
  const imgchestId = data.source === "imgchest" ? (data.imgchest_post ?? "").trim() : "";
  if (data.source === "imgchest" && !imgchestId) {
    return jsonError("Sélectionnez un album ImgChest.", "invalid_body", 400);
  }
  if (imgchestId && !/^[a-z0-9]{4,32}$/i.test(imgchestId)) {
    return jsonError("Identifiant d'album ImgChest invalide.", "invalid_body", 400);
  }
  if (data.source !== "imgchest" && !nasPath && data.pages.length === 0) {
    return jsonError(
      "Sélectionnez un dossier NAS ou des pages.",
      "invalid_body",
      400,
    );
  }
  if (data.statut === "scheduled" && !data.publish_at) {
    return jsonError("Une date de publication est requise.", "publish_at_required", 400);
  }

  const series = await getSeriesById(data.series_id);
  if (!series) return jsonError("Série introuvable.", "not_found", 404);

  const db = getDb();
  const { total: duplicates } = await db.list(TABLES.chapters, {
    filters: [
      { field: "series_id", op: "eq", value: data.series_id },
      { field: "numero", op: "eq", value: data.numero },
    ],
    limit: 1,
  });
  if (duplicates > 0) {
    return jsonError(
      `Le chapitre ${data.numero} existe déjà pour cette série.`,
      "chapter_exists",
      409,
    );
  }

  // ── Indexation des pages (§5.1, étape 3) ─────────────────────────────
  let indexed: IndexedPage[];
  let storage: "nas" | "demo" | "imgchest";

  if (imgchestId) {
    // Album ImgChest : la liste des pages est résolue ici, puis les URLs CDN
    // sont stockées en base — la lecture n'appelle plus ImgChest.
    let album;
    try {
      album = await fetchImgChestPost(imgchestId);
    } catch (err) {
      return jsonError(imgchestErrorMessage(err), "imgchest_error", 502);
    }
    indexed = album.files.map((file) => ({
      chemin: file.url,
      largeur: file.width ?? 1200,
      hauteur: file.height ?? 1800,
      ...(file.bytes ? { bytes: file.bytes } : {}),
      ...(file.hash ? { hash: file.hash } : {}),
    }));
    storage = "imgchest";
  } else if (nasPath) {
    let listing: { pages: NasPage[] };
    try {
      listing = await nasList(nasPath);
    } catch (err) {
      return jsonError(nasErrorMessage(err), "nas_error", 502);
    }
    if (listing.pages.length === 0) {
      return jsonError(
        "Aucune image détectée dans ce dossier (format attendu : 001.webp, 002.webp…).",
        "empty_folder",
        422,
      );
    }
    indexed = listing.pages.map((page) => ({
      chemin: page.path || `${nasPath}/${page.name}`,
      largeur: page.width ?? 1200,
      hauteur: page.height ?? 1800,
      ...(page.bytes ? { bytes: page.bytes } : {}),
      ...(page.hash ? { hash: page.hash } : {}),
    }));
    storage = "nas";
  } else {
    const names = naturalSort(data.pages);
    indexed = names.map((name, index) => ({
      chemin: demoPagePath(series.slug, data.numero, index),
      largeur: 1200,
      hauteur: 1800,
      bytes: 0,
      hash: `demo-${index}`,
    }));
    storage = "demo";
  }

  const chapterId = rowId(`${series.id}-c${data.numero}`);
  const now = new Date().toISOString();
  const publishAt =
    data.statut === "scheduled"
      ? new Date(data.publish_at!).toISOString()
      : data.statut === "published"
        ? now
        : null;

  const job = await createImportJob({
    type: imgchestId ? "imgchest" : data.source === "nas" || nasPath ? "nas" : "upload",
    statut: "cours",
    progression: 10,
    message: `Indexation de ${indexed.length} pages…`,
    erreurs: [],
    created_by: user.id,
  });

  try {
    const chapter: Chapter = {
      id: chapterId,
      series_id: data.series_id,
      numero: data.numero,
      volume: data.volume,
      titre: data.titre || `Chapitre ${data.numero}`,
      statut: data.statut,
      publish_at: publishAt,
      source: (imgchestId ? "imgchest" : "nas") as Chapter["source"],
      // dénormalisé pour les filtres de « Dernières sorties » (§6.1)
      series_type: series.type,
      nb_pages: indexed.length,
      classification: data.classification || series.classification,
      // Import manuel du Gérant : aucun groupe de scan connu (pas de pastille).
      teams: [],
      vues: 0,
      created_by: user.id,
      created_at: now,
    } as unknown as Chapter;

    await db.create<Chapter>(TABLES.chapters, chapterId, {
      ...(chapter as unknown as Record<string, unknown>),
    });
    await refreshSeriesChapterCount(data.series_id);

    for (let index = 0; index < indexed.length; index++) {
      const page = indexed[index];
      const pageId = rowId(chapterId, `p${index}`);
      await db.create(TABLES.pages, pageId, {
        id: pageId,
        chapter_id: chapterId,
        index,
        chemin: page.chemin,
        largeur: page.largeur,
        hauteur: page.hauteur,
        bytes: page.bytes ?? 0,
        hash: page.hash ?? "",
      });
    }

    // ── Publication immédiate : staging → public + purge (§5.1, étape 5) ──
    let nas: FileTransition | undefined;
    if (data.statut === "published") {
      nas = await transitionChapterFiles(chapter, "publish");
    }

    const warning = nas?.action === "error" ? nas.error : undefined;
    await updateImportJob(job.id, {
      statut: warning ? "erreur" : "termine",
      progression: 100,
      message: warning
        ? `Chapitre ${data.numero} indexé (${indexed.length} pages) mais le déplacement NAS a échoué : ${warning}`
        : storage === "nas"
          ? `Chapitre ${data.numero} indexé : ${indexed.length} pages depuis ${nasPath}.`
          : storage === "imgchest"
            ? `Chapitre ${data.numero} indexé : ${indexed.length} pages depuis l'album ImgChest ${imgchestId}.`
            : `Chapitre ${data.numero} créé avec ${indexed.length} pages de démonstration — utilisez l'onglet « Depuis le NAS » pour indexer les scans réels.`,
      ...(warning ? { erreurs: [warning] } : {}),
    });

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "import.upload",
      cible: `chapter:${chapterId}`,
      apres: {
        series: series.titre,
        numero: data.numero,
        pages: indexed.length,
        classification: chapter.classification,
        source: data.source,
        statut: data.statut,
        storage,
        ...(nasPath ? { nasPath } : {}),
        ...(nas ? { nasMove: nas.action, nasError: nas.error ?? null } : {}),
      },
      ip,
    });

    return Response.json(
      {
        chapter,
        jobId: job.id,
        nbPages: indexed.length,
        storage,
        ...(nas ? { nas } : {}),
        ...(warning ? { warning } : {}),
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    await updateImportJob(job.id, {
      statut: "erreur",
      progression: 100,
      message: "Échec de l'import.",
      erreurs: [message],
    });
    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "import.upload",
      cible: `chapter:${chapterId}`,
      apres: { erreur: message },
      ip,
    });
    return jsonError("Échec de l'import du chapitre.", "import_failed", 500);
  }
}
