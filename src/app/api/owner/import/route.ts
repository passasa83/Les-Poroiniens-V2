import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit, createImportJob, updateImportJob } from "@/lib/data/moderation";
import { getSeriesById } from "@/lib/data/series";
import { dataMode, getDb, TABLES } from "@/lib/db";
import { demoPagePath } from "@/lib/db/seed";
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
  /** `upload` : fichiers déposés ; `nas` : dossier déjà présent sur le NAS. */
  source: z.enum(["upload", "nas"]).default("upload"),
  /** Noms de fichiers uniquement (les octets ne transitent pas par Vercel, §5.3). */
  pages: z.array(z.string().trim().min(1).max(255)).min(1).max(5000),
  /** Dossier d'origine quand `source = nas`. */
  chemin: z.string().trim().max(500).optional(),
});

/** Tri naturel : `page 2` avant `page 10` (§10.2). */
function naturalSort(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

function pagePath(base: string | null, slug: string, numero: number, index: number, nom: string): string {
  if (base) {
    const safeName = encodeURIComponent(nom.replace(/[\\/]+/g, "_"));
    return `${base}/${slug}/${numero}/${index + 1}-${safeName}`;
  }
  return demoPagePath(slug, numero, index);
}

/**
 * POST /api/owner/import — import d'un chapitre (Gérant exclusif, §10).
 * Crée le chapitre en brouillon, l'index des pages et le job d'import.
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

  const nasBase = (
    process.env.NAS_PAGE_BASE_URL ||
    process.env.NAS_API_URL ||
    ""
  ).replace(/\/+$/, "");
  if (!nasBase && dataMode() !== "demo") {
    return jsonError(
      "Stockage des pages non configuré (NAS_PAGE_BASE_URL / NAS_API_URL).",
      "nas_unconfigured",
      502,
    );
  }

  const names = naturalSort(data.pages);
  const chapterId = `${series.id}-c${data.numero}`;
  const now = new Date().toISOString();

  const job = await createImportJob({
    type: data.source === "nas" ? "nas" : "upload",
    statut: "cours",
    progression: 10,
    message: `Indexation de ${names.length} pages…`,
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
      statut: "draft",
      publish_at: null,
      source: "nas",
      nb_pages: names.length,
      classification: data.classification || series.classification,
      vues: 0,
      created_by: user.id,
      created_at: now,
    } as unknown as Chapter;

    await db.create<Chapter>(TABLES.chapters, chapterId, {
      ...(chapter as unknown as Record<string, unknown>),
    });

    for (let index = 0; index < names.length; index++) {
      const pageId = `${chapterId}-p${index}`;
      await db.create(TABLES.pages, pageId, {
        id: pageId,
        chapter_id: chapterId,
        index,
        chemin: pagePath(nasBase || null, series.slug, data.numero, index, names[index]),
        largeur: 1200,
        hauteur: 1800,
      });
    }

    await updateImportJob(job.id, {
      statut: "termine",
      progression: 100,
      message: `Chapitre ${data.numero} créé en brouillon avec ${names.length} pages.`,
    });

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "import.upload",
      cible: `chapter:${chapterId}`,
      apres: {
        series: series.titre,
        numero: data.numero,
        pages: names.length,
        classification: chapter.classification,
        source: data.source,
        storage: nasBase ? "nas" : "demo",
      },
      ip,
    });

    return Response.json(
      { chapter, jobId: job.id, nbPages: names.length },
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
