import { z } from "zod";
import { getChapterById } from "@/lib/data/chapters";
import { recordImageErrors } from "@/lib/data/image-errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const payload = z.object({
  chapterId: z.string().trim().min(1).max(64),
  indexes: z.array(z.number().int().min(0).max(5000)).min(1).max(20),
});

/**
 * POST /api/telemetry/images — remontée des échecs de chargement d'images
 * (§9.1). Envoyé par lots depuis le lecteur après échec des reprises, sans
 * donnée personnelle, et agrégé par jour pour l'alerte du cron de santé.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`telemetry:images:${clientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) return Response.json({ ok: true, recorded: 0 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corps JSON invalide.", code: "invalid_body" }, { status: 400 });
  }

  const parsed = payload.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Champs invalides.", code: "invalid_body" }, { status: 400 });
  }

  const chapter = await getChapterById(parsed.data.chapterId);
  if (!chapter) {
    return Response.json({ error: "Chapitre introuvable.", code: "not_found" }, { status: 404 });
  }

  // La télémétrie n'est jamais bloquante : un échec ne doit pas faire échouer
  // la requête du lecteur.
  let recorded = 0;
  try {
    recorded = await recordImageErrors(parsed.data.chapterId, parsed.data.indexes);
  } catch (err) {
    console.error("[telemetry/images]", err);
  }
  return Response.json({ ok: true, recorded });
}
