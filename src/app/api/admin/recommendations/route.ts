import { z } from "zod";
import { audit } from "@/lib/data/moderation";
import { getSeriesById } from "@/lib/data/series";
import { serieDeDemo } from "@/lib/demo-gate";
import { getDb, listAll, TABLES } from "@/server/db";
import type { Recommendation } from "@/lib/types";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

const recoInput = z.object({
  placement: z.enum(["home", "series", "end_chapter"]),
  titre: z.string().trim().min(1).max(120),
  series_id: z.string().trim().min(1).max(64),
  ordre: z.number().int().min(0).max(999).default(0),
  debut: z.string().datetime({ offset: true }).nullable().default(null),
  fin: z.string().datetime({ offset: true }).nullable().default(null),
  actif: z.boolean().default(true),
});

/** GET /api/admin/recommendations — liste complète (admin+). */
export const GET = route(
  {
    auth: "manage_recommendations",
    forbidden: "Réservé aux administrateurs.",
  },
  async () => {
    const items = await listAll(TABLES.recommendations, { order: { field: "ordre", dir: "asc" } });
    /* Masquage du jeu de démo en production : même filtre que le panneau admin. */
    return Response.json({ items: items.filter((r) => !serieDeDemo(r.series_id)) });
  },
);

/** POST /api/admin/recommendations — création (admin+). */
export const POST = route(
  {
    auth: "manage_recommendations",
    forbidden: "Réservé aux administrateurs.",
    rateLimit: {
      key: "admin:reco:post",
      limit: 30,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
    body: recoInput,
    invalidBody: "issue",
  },
  async ({ user, body, ip }) => {
    const data = body;
    const series = await getSeriesById(data.series_id);
    if (!series) fail(404, "Série introuvable.", "not_found");
    if (data.debut && data.fin && new Date(data.debut) > new Date(data.fin)) {
      fail(400, "La date de fin précède la date de début.", "invalid_period");
    }

    const id = `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const reco: Recommendation = { id, ...data };
    await getDb().create(TABLES.recommendations, id, reco);

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "recommendation.create",
      cible: `recommendation:${id}`,
      apres: { ...data, series: series.titre },
      ip,
    });

    return Response.json({ recommendation: reco }, { status: 201 });
  },
);
