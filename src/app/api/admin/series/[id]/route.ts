import { deleteChapterCascade, invalidateChapters } from "@/lib/data/chapters";
import { z } from "zod";
import { audit } from "@/lib/data/moderation";
import { deleteSeries, getSeriesById, getSeriesBySlug, saveSeries } from "@/lib/data/series";
import { getDb, listAll, parLots, TABLES } from "@/server/db";
import type { Series } from "@/lib/types";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

function listField(maxItems: number, maxLen: number) {
  return z.preprocess(
    (value) =>
      typeof value === "string"
        ? value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : value,
    z.array(z.string().trim().min(1).max(maxLen)).max(maxItems),
  );
}

const patchInput = z.object({
  titre: z.string().trim().min(1).max(200).optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Slug invalide (lettres minuscules, chiffres et tirets).")
    .optional(),
  titresAlt: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  synopsis: z.string().max(8000).optional(),
  couverture: z.string().trim().max(500).optional(),
  banniere: z.string().trim().max(500).optional(),
  statut: z.enum(["en_cours", "termine", "hiatus", "abandonne", "archive"]).optional(),
  type: z.enum(["manga", "manhwa", "manhua", "light_novel"]).optional(),
  unite: z.enum(["chapitre", "tome"]).optional(),
  annee: z.number().int().min(1900).max(2100).nullable().optional(),
  langue: z.string().trim().min(2).max(10).optional(),
  classification: z.enum(["all", "adult"]).optional(),
  genres: listField(20, 60).optional(),
  tags: listField(40, 60).optional(),
  auteurs: listField(10, 120).optional(),
});

function snapshot(series: Series): Record<string, unknown> {
  return {
    titre: series.titre,
    slug: series.slug,
    statut: series.statut,
    type: series.type,
    unite: series.unite ?? "chapitre",
    classification: series.classification,
    annee: series.annee,
    langue: series.langue,
    couverture: series.couverture,
    banniere: series.banniere,
    synopsis: series.synopsis,
    titresAlt: series.titresAlt,
    genres: series.genres,
    tags: series.tags,
    auteurs: series.auteurs,
  };
}

/** PATCH /api/admin/series/[id] — édition de la fiche (admin+). */
export const PATCH = route(
  {
    auth: "edit_series",
    forbidden: "Réservé aux administrateurs.",
    rateLimit: {
      key: "admin:series:patch",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
    body: patchInput,
    invalidBody: "issue",
  },
  async ({ body, params, user, ip }) => {
    const { id } = params;
    const existing = await getSeriesById(id);
    if (!existing) fail(404, "Série introuvable.", "not_found");

    const patch = body;
    if (patch.slug && patch.slug !== existing.slug) {
      const clash = await getSeriesBySlug(patch.slug, { includeArchived: true });
      if (clash && clash.id !== id) {
        fail(409, "Ce slug est déjà utilisé.", "slug_taken");
      }
    }

    const series = await saveSeries({ ...patch, id });

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "series.update",
      cible: `series:${id}`,
      avant: snapshot(existing),
      apres: snapshot(series),
      ip,
    });

    return Response.json({ series });
  },
);

/** DELETE /api/admin/series/[id] — suppression de la fiche et de ses chapitres (admin+). */
export const DELETE = route(
  {
    auth: "edit_series",
    forbidden: "Réservé aux administrateurs.",
    rateLimit: {
      key: "admin:series:delete",
      limit: 20,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
  },
  async ({ params, user, ip }) => {
    const { id } = params;
    const existing = await getSeriesById(id);
    if (!existing) fail(404, "Série introuvable.", "not_found");

    const db = getDb();
    const [chapters, recos] = await Promise.all([
      listAll(TABLES.chapters, {
        filters: [{ field: "series_id", op: "eq", value: id }],
        select: ["series_id"],
      }),
      listAll(TABLES.recommendations, {
        filters: [{ field: "series_id", op: "eq", value: id }],
        select: ["series_id"],
      }),
    ]);
    // Chapitres 3 par 3 (chacun supprime déjà ses pages 10 par 10).
    await parLots(chapters, (chapter) => deleteChapterCascade(chapter.id), 3);
    await parLots(recos, (reco) => db.remove(TABLES.recommendations, reco.id));

    await deleteSeries(id);
    invalidateChapters({ seriesId: id });

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "series.delete",
      cible: `series:${id}`,
      avant: snapshot(existing),
      apres: null,
      ip,
    });

    return Response.json({ ok: true, deletedChapters: chapters.length });
  },
);
