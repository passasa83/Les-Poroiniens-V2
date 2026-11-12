import { z } from "zod";
import { rateLimit } from "@/server/http/rate-limit";
import { audit, createImportJob, updateImportJob } from "@/lib/data/moderation";
import {
  deleteChapterCascade,
  invalidateChapters,
  refreshSeriesChapterCount,
} from "@/lib/data/chapters";
import { getSeriesById, saveSeries } from "@/lib/data/series";
import { getDb, parLots, rowId, TABLES } from "@/server/db";
import { libelleUnite } from "@/lib/format";
import {
  indexDemo,
  indexFromImgchest,
  indexFromNas,
  messageResultat,
  SourceError,
  type SourceIndex,
} from "@/lib/import/sources";
import { transitionChapterFiles, type FileTransition } from "@/lib/publishing";
import { detectNumero, uniteDeKind } from "@/lib/unite";
import type { Chapter, ImportJob, Unite } from "@/lib/types";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error, code, ...(extra ?? {}) }, { status });
}

const importInput = z.object({
  series_id: z.string().trim().min(1).max(64),
  numero: z.number().int().min(1).max(100000),
  titre: z.string().trim().max(200).default(""),
  /** Unité importée : absente → déduite du nom du dossier (`Tome 3`). */
  unite: z.enum(["chapitre", "tome"]).optional(),
  volume: z.number().int().min(1).max(999).nullable().default(null),
  classification: z.enum(["all", "adult"]).default("all"),
  /** `upload` : noms déposés ; `nas` : dossier déjà présent sur le NAS ;
   *  `imgchest` : album ImgChest déjà publié par le Gérant. */
  source: z.enum(["upload", "nas", "imgchest"]).default("upload"),
  /** Dossier du NAS : si renseigné, le listing est fait **côté serveur**. */
  chemin: z.string().trim().max(500).optional(),
  /** Identifiant d'album ImgChest (`qe4gwgozq7j`) : résolu côté serveur. */
  imgchest_post: z.string().trim().max(64).optional(),
  /** Noms de fichiers uniquement (les octets ne transitent pas par Vercel). */
  pages: z.array(z.string().trim().min(1).max(255)).max(5000).default([]),
  /** Brouillon (défaut), programmé ou publié directement (étape 4). */
  statut: z.enum(["draft", "scheduled", "published"]).default("draft"),
  publish_at: z.string().datetime({ offset: true }).nullable().default(null),
  /** Import par lot : chapitre rattaché au job ouvert par l'interface. */
  batch: z
    .object({
      jobId: z.string().trim().min(1).max(64),
      index: z.number().int().min(1).max(5000),
      total: z.number().int().min(1).max(5000),
    })
    .nullable()
    .default(null),
});

/**
 * POST /api/owner/import — import d'un chapitre (Gérant exclusif).
 *
 * Trois sources d'indexation (`@/lib/import/sources`) : album ImgChest,
 * dossier du NAS (`chemin`), ou noms seuls → planches de démonstration.
 * La route valide, crée le chapitre et son index de pages, puis publie.
 */
export const POST = route(
  {
    auth: "import_chapters",
    forbidden: "L'import de contenu est réservé au Gérant.",
    body: importInput,
    invalidBody: "issue",
  },
  async ({ user, body, ip }) => {
    /* Un lot enchaîne les chapitres : le quota est relevé pour la durée de
     l'opération, au prorata du nombre de chapitres annoncé (60/min par défaut
     + le déclaratif du lot, borné) — un import manuel reste bloqué à 10/min. */
    const batchTotal = body.batch?.total ?? 0;
    const limit = rateLimit(`owner:import:${ip}`, {
      limit: body.batch ? Math.min(600, 60 + batchTotal) : 10,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      fail(429, "Trop d'imports en une minute.", "rate_limited", { retryAfter: limit.retryAfter });
    }

    const data = body;

    /* Job de lot : vérifié du côté serveur — un jobId étranger est refusé. */
    let batchJob: ImportJob | null = null;
    if (data.batch) {
      /* Lecture par identifiant (avant : recherche parmi les 500 derniers
         jobs, un lot plus ancien était refusé). */
      const job = await getDb().get(TABLES.importJobs, data.batch.jobId);
      batchJob = job && job.created_by === user.id ? job : null;
      if (!batchJob) fail(404, "Lot d'import introuvable.", "batch_not_found");
    }

    const nasPath = data.chemin?.trim().replace(/^\/+/, "").replace(/\/+$/, "") || "";
    /* Nature du dossier importé : `Tome 3` → tome, `Chapitre 12` → chapitre ;
     un dossier au nom neutre (« 12 », album ImgChest, pages de démonstration)
     laisse décider l'organisation déjà enregistrée sur la série. */
    const folderKind = detectNumero(nasPath.split("/").pop() ?? "").kind;
    const imgchestId = data.source === "imgchest" ? (data.imgchest_post ?? "").trim() : "";
    if (data.source === "imgchest" && !imgchestId) {
      fail(400, "Sélectionnez un album ImgChest.", "invalid_body");
    }
    if (data.source !== "imgchest" && !nasPath && data.pages.length === 0) {
      fail(400, "Sélectionnez un dossier NAS ou des pages.", "invalid_body");
    }
    if (data.statut === "scheduled" && !data.publish_at) {
      fail(400, "Une date de publication est requise.", "publish_at_required");
    }

    const series = await getSeriesById(data.series_id);
    if (!series) fail(404, "Série introuvable.", "not_found");

    /* Unité importée : explicitement fournie par l'analyse, sinon déduite du
     nom du dossier, sinon organisation de la série — titre et libellés en
     découlent (`Tome 3` créé dans une série en tomes). */
    const unite: Unite =
      data.unite ??
      (folderKind !== "dossier" ? uniteDeKind(folderKind) : undefined) ??
      series.unite ??
      "chapitre";

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
        `Le numéro ${data.numero} existe déjà pour cette série.`,
        "chapter_exists",
        409,
      );
    }

    // ── Indexation des pages : une source par cas ─────────────────────
    let index: SourceIndex;
    try {
      index = imgchestId
        ? await indexFromImgchest(imgchestId)
        : nasPath
          ? await indexFromNas(nasPath)
          : indexDemo(series.slug, data.numero, data.pages);
    } catch (err) {
      if (err instanceof SourceError) return jsonError(err.message, err.code, err.status);
      throw err;
    }
    const { pages: indexed, storage } = index;

    const chapterId = rowId(`${series.id}-c${data.numero}`);
    const now = new Date().toISOString();
    const publishAt =
      data.statut === "scheduled"
        ? new Date(data.publish_at!).toISOString()
        : data.statut === "published"
          ? now
          : null;

    const job: ImportJob =
      batchJob ??
      (await createImportJob({
        type: imgchestId ? "imgchest" : data.source === "nas" || nasPath ? "nas" : "upload",
        statut: "cours",
        progression: 10,
        message: `Indexation de ${indexed.length} pages…`,
        erreurs: [],
        created_by: user.id,
      }));

    /** Progression lissée du lot : `3/12` → 25 %. */
    const batchProgression = data.batch
      ? Math.round((data.batch.index / data.batch.total) * 100)
      : 100;

    let chapitreCree = false;
    try {
      const chapter: Chapter = {
        id: chapterId,
        series_id: data.series_id,
        numero: data.numero,
        volume: data.volume,
        titre: data.titre || libelleUnite(data.numero, unite),
        statut: data.statut,
        publish_at: publishAt,
        source: (imgchestId ? "imgchest" : "nas") as Chapter["source"],
        // dénormalisé pour les filtres de « Dernières sorties »
        series_type: series.type,
        nb_pages: indexed.length,
        classification: data.classification || series.classification,
        // Import manuel du Gérant : aucun groupe de scan connu (pas de pastille).
        teams: [],
        vues: 0,
        created_by: user.id,
        created_at: now,
      } satisfies Chapter;

      await db.create(TABLES.chapters, chapterId, chapter);
      chapitreCree = true;
      await refreshSeriesChapterCount(data.series_id);
      /* Un dépôt découpé en tomes impose ses libellés à la fiche : le premier
       import d'un tome bascule la série en « tomes ». Jamais l'inverse — une
       série déjà en tomes n'est pas renversée par un dossier isolé. */
      if (unite === "tome" && series.unite !== "tome") {
        await saveSeries({ id: series.id, unite: "tome" });
      }

      // Index des pages : 10 créations à la fois (avant : une par une).
      await parLots(
        indexed.map((page, ordre) => ({ page, ordre })),
        ({ page, ordre }) =>
          db.create(TABLES.pages, rowId(chapterId, `p${ordre}`), {
            chapter_id: chapterId,
            index: ordre,
            chemin: page.chemin,
            largeur: page.largeur,
            hauteur: page.hauteur,
            bytes: page.bytes ?? 0,
            hash: page.hash ?? "",
          }),
      );
      invalidateChapters({ seriesId: data.series_id, chapterId });

      // ── Publication immédiate : staging → public + purge (étape 5) ──
      let nas: FileTransition | undefined;
      if (data.statut === "published") {
        nas = await transitionChapterFiles(chapter, "publish");
      }

      const warning = nas?.action === "error" ? nas.error : undefined;
      const libelle = libelleUnite(data.numero, unite);
      const resultat = messageResultat(
        libelle,
        index,
        storage === "imgchest" ? imgchestId : nasPath,
        warning,
      );

      await updateImportJob(
        job.id,
        batchJob
          ? {
              /* Le job de lot reste « en cours » jusqu'à la clôture envoyée par
             l'interface : il porte la progression de l'ensemble. */
              progression: batchProgression,
              message: `${resultat} (${data.batch!.index}/${data.batch!.total})`,
              ...(warning ? { erreurs: [...(batchJob.erreurs ?? []), warning].slice(-20) } : {}),
            }
          : {
              statut: warning ? "erreur" : "termine",
              progression: 100,
              message: resultat,
              ...(warning ? { erreurs: [warning] } : {}),
            },
      );

      await audit({
        actorId: user.id,
        actorPseudo: user.pseudo,
        action: "import.upload",
        cible: `chapter:${chapterId}`,
        apres: {
          series: series.titre,
          numero: data.numero,
          unite,
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
          /* Unité retenue (chapitre / tome) : l'interface s'en sert pour son
           rapport, la série bascule elle aussi côté serveur. */
          unite,
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
      /* Chapitre à moitié indexé : retiré, sinon le nouvel essai butait sur
         « numéro déjà existant » avec des pages manquantes. */
      if (chapitreCree) {
        await deleteChapterCascade(chapterId).catch(() => undefined);
        await refreshSeriesChapterCount(data.series_id).catch(() => undefined);
        invalidateChapters({ seriesId: data.series_id, chapterId });
      }
      await updateImportJob(
        job.id,
        batchJob
          ? {
              /* Un chapitre en erreur n'arrête pas le lot : l'interface enchaîne
             et clôt le job avec le rapport complet. */
              progression: batchProgression,
              message: `Échec du chapitre ${data.batch!.index}/${data.batch!.total}.`,
              erreurs: [...(batchJob.erreurs ?? []), message].slice(-20),
            }
          : {
              statut: "erreur",
              progression: 100,
              message: "Échec de l'import.",
              erreurs: [message],
            },
      );
      await audit({
        actorId: user.id,
        actorPseudo: user.pseudo,
        action: "import.upload",
        cible: `chapter:${chapterId}`,
        apres: { erreur: message },
        ip,
      });
      fail(500, "Échec de l'import du chapitre.", "import_failed");
    }
  },
);
