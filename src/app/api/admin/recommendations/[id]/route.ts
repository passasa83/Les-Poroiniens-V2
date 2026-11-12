import { z } from "zod";
import { audit } from "@/lib/data/moderation";
import { getSeriesById } from "@/lib/data/series";
import { getDb, TABLES } from "@/server/db";
import type { Recommendation } from "@/lib/types";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

const patchInput = z.object({
  placement: z.enum(["home", "series", "end_chapter"]).optional(),
  titre: z.string().trim().min(1).max(120).optional(),
  series_id: z.string().trim().min(1).max(64).optional(),
  ordre: z.number().int().min(0).max(999).optional(),
  debut: z.string().datetime({ offset: true }).nullable().optional(),
  fin: z.string().datetime({ offset: true }).nullable().optional(),
  actif: z.boolean().optional(),
});

function snapshot(reco: Recommendation): Record<string, unknown> {
  return {
    placement: reco.placement,
    titre: reco.titre,
    series_id: reco.series_id,
    ordre: reco.ordre,
    debut: reco.debut,
    fin: reco.fin,
    actif: reco.actif,
  };
}

async function find(id: string): Promise<Recommendation | null> {
  return getDb().get(TABLES.recommendations, id);
}

/** PATCH /api/admin/recommendations/[id] — édition (admin+). */
export const PATCH = route(
  {
    auth: "manage_recommendations",
    forbidden: "Réservé aux administrateurs.",
    rateLimit: {
      key: "admin:reco:patch",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
    body: patchInput,
    invalidBody: "issue",
  },
  async ({ body, params, user, ip }) => {
    const { id } = params;
    const existing = await find(id);
    if (!existing) fail(404, "Recommandation introuvable.", "not_found");

    const patch = body;
    if (patch.series_id) {
      const series = await getSeriesById(patch.series_id);
      if (!series) fail(404, "Série introuvable.", "not_found");
    }

    const debut = patch.debut !== undefined ? patch.debut : existing.debut;
    const fin = patch.fin !== undefined ? patch.fin : existing.fin;
    if (debut && fin && new Date(debut) > new Date(fin)) {
      fail(400, "La date de fin précède la date de début.", "invalid_period");
    }

    const updated = await getDb().update(TABLES.recommendations, id, patch);

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "recommendation.update",
      cible: `recommendation:${id}`,
      avant: snapshot(existing),
      apres: snapshot(updated),
      ip,
    });

    return Response.json({ recommendation: updated });
  },
);

/** DELETE /api/admin/recommendations/[id] — suppression (admin+). */
export const DELETE = route(
  {
    auth: "manage_recommendations",
    forbidden: "Réservé aux administrateurs.",
    rateLimit: {
      key: "admin:reco:delete",
      limit: 30,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
  },
  async ({ params, user, ip }) => {
    const { id } = params;
    const existing = await find(id);
    if (!existing) fail(404, "Recommandation introuvable.", "not_found");

    await getDb().remove(TABLES.recommendations, id);

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "recommendation.delete",
      cible: `recommendation:${id}`,
      avant: snapshot(existing),
      apres: null,
      ip,
    });

    return Response.json({ ok: true });
  },
);
