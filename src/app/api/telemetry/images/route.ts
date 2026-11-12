import { z } from "zod";
import { getChapterById } from "@/lib/data/chapters";
import { recordImageErrors } from "@/lib/data/image-errors";
import { route } from "@/server/http";

export const runtime = "nodejs";

const payload = z.object({
  chapterId: z.string().trim().min(1).max(64),
  indexes: z.array(z.number().int().min(0).max(5000)).min(1).max(20),
});

/**
 * POST /api/telemetry/images — remontée des échecs de chargement d'images
 * Envoyé par lots depuis le lecteur après échec des reprises, sans
 * donnée personnelle, et agrégé par jour pour l'alerte du cron de santé.
 */
export const POST = route(
  {
    rateLimit: { key: "telemetry:images", limit: 30, windowMs: 60_000 },
    body: payload,
    invalidBody: "Champs invalides.",
  },
  async ({ body }) => {
    const chapter = await getChapterById(body.chapterId);
    if (!chapter) {
      return Response.json({ error: "Chapitre introuvable.", code: "not_found" }, { status: 404 });
    }

    // La télémétrie n'est jamais bloquante : un échec ne doit pas faire échouer
    // la requête du lecteur.
    let recorded = 0;
    try {
      recorded = await recordImageErrors(body.chapterId, body.indexes);
    } catch (err) {
      console.error("[telemetry/images]", err);
    }
    return Response.json({ ok: true, recorded });
  },
);
