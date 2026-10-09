import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/data/moderation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { can } from "@/lib/roles";
import { getSeriesById } from "@/lib/data/series";
import { lnContentPath, refreshSeriesChapterCount } from "@/lib/data/chapters";
import { getDb, rowId, TABLES } from "@/lib/db";
import { libelleUnite } from "@/lib/format";
import { NasError, nasUpload } from "@/lib/nas";
import type { Chapter } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

/** Garde-fou aligné sur le poids du `.txt` téléversable (2 Mo côté NAS). */
const LN_TEXT_MAX = 1_900_000;

const createInput = z.object({
  series_id: z.string().trim().min(1),
  numero: z.number().min(1).max(100000),
  titre: z.string().trim().max(200).optional(),
  texte: z.string().max(LN_TEXT_MAX).refine((v) => v.trim().length > 0, "Texte vide."),
  statut: z.enum(["draft", "published"]).default("draft"),
});

/**
 * POST /api/admin/chapters — création d'un chapitre **texte** (light novel).
 *
 * La création d'un chapitre image reste le travail de l'import NAS/ImgChest
 * (indexation des planches) : cette route n'accepte que des séries
 * `light_novel`, écrit le `.txt` sur le NAS puis pose la ligne `chapters`.
 * Gérant uniquement (matrice 4.3).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "publish_chapter")) {
    return jsonError("Création de chapitres réservée au Gérant.", "owner_only", 403);
  }

  const limit = rateLimit(`admin:chapters:create:${clientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }
  const parsed = createInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }
  const data = parsed.data;

  const series = await getSeriesById(data.series_id);
  if (!series) return jsonError("Série introuvable.", "not_found", 404);
  if (series.type !== "light_novel") {
    return jsonError(
      "Création de texte réservée aux séries light novel (les chapitres image passent par l'import).",
      "not_light_novel",
      400,
    );
  }

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

  /* Écriture du texte AVANT la ligne : un NAS en panne ne laisse jamais un
     chapitre vide en base. Un fichier orphelin (chapitre supprimé puis
     recréé au même numéro) est remplacé — c'est la même unité de lecture. */
  const chemin = lnContentPath(series, data.numero);
  try {
    try {
      await nasUpload(chemin, data.texte);
    } catch (err) {
      if (err instanceof NasError && err.status === 409) {
        await nasUpload(chemin, data.texte, { overwrite: true });
      } else {
        throw err;
      }
    }
  } catch (err) {
    const message =
      err instanceof NasError
        ? err.code === "unconfigured"
          ? "API du NAS non configurée (NAS_API_BASE)."
          : err.message
        : "Écriture du fichier texte impossible.";
    return jsonError(message, "nas_upload_failed", 502);
  }

  const chapterId = rowId(`${series.id}-c${data.numero}`);
  const now = new Date().toISOString();
  const chapter = {
    id: chapterId,
    series_id: data.series_id,
    numero: data.numero,
    volume: null,
    titre: data.titre || libelleUnite(data.numero, series.unite),
    statut: data.statut,
    publish_at: data.statut === "published" ? now : null,
    source: "nas",
    // dénormalisé pour les filtres de « Dernières sorties »
    series_type: series.type,
    nb_pages: 0,
    classification: series.classification,
    contenu_chemin: chemin,
    teams: [],
    vues: 0,
    created_by: user.id,
    created_at: now,
  } as unknown as Chapter;

  try {
    await db.create<Chapter>(TABLES.chapters, chapterId, {
      ...(chapter as unknown as Record<string, unknown>),
    });
  } catch {
    return jsonError("Création impossible (chapitre déjà présent ?).", "create_failed", 409);
  }
  await refreshSeriesChapterCount(data.series_id);

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: "chapter.create",
    cible: `chapter:${chapterId}`,
    avant: null,
    apres: {
      numero: data.numero,
      statut: data.statut,
      series_id: data.series_id,
      contenu_chemin: chemin,
    },
    ip: clientIp(request),
  });

  return Response.json({ chapter }, { status: 201 });
}
