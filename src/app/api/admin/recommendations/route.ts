import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/data/moderation";
import { getSeriesById } from "@/lib/data/series";
import { serieDeDemo } from "@/lib/demo-gate";
import { getDb, TABLES } from "@/lib/db";
import type { Recommendation } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

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
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "manage_recommendations")) {
    return jsonError("Réservé aux administrateurs.", "forbidden", 403);
  }

  const { items } = await getDb().list<Recommendation>(TABLES.recommendations, {
    order: { field: "ordre", dir: "asc" },
    limit: 500,
  });
  /* Masquage du jeu de démo en production : même filtre que le panneau admin. */
  return Response.json({ items: items.filter((r) => !serieDeDemo(r.series_id)) });
}

/** POST /api/admin/recommendations — création (admin+). */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "manage_recommendations")) {
    return jsonError("Réservé aux administrateurs.", "forbidden", 403);
  }

  const ip = clientIp(request);
  const limit = rateLimit(`admin:reco:post:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }

  const parsed = recoInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }

  const data = parsed.data;
  const series = await getSeriesById(data.series_id);
  if (!series) return jsonError("Série introuvable.", "not_found", 404);
  if (data.debut && data.fin && new Date(data.debut) > new Date(data.fin)) {
    return jsonError("La date de fin précède la date de début.", "invalid_period", 400);
  }

  const id = `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const reco: Recommendation = { id, ...data };
  await getDb().create<Recommendation>(
    TABLES.recommendations,
    id,
    reco as unknown as Record<string, unknown>,
  );

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: "recommendation.create",
    cible: `recommendation:${id}`,
    apres: { ...data, series: series.titre },
    ip,
  });

  return Response.json({ recommendation: reco }, { status: 201 });
}
