import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/data/moderation";
import { getSeriesById } from "@/lib/data/series";
import { getDb, TABLES } from "@/lib/db";
import type { Recommendation } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

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
  return getDb().get<Recommendation>(TABLES.recommendations, id);
}

/** PATCH /api/admin/recommendations/[id] — édition (admin+). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "manage_recommendations")) {
    return jsonError("Réservé aux administrateurs.", "forbidden", 403);
  }

  const ip = clientIp(request);
  const limit = rateLimit(`admin:reco:patch:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const existing = await find(id);
  if (!existing) return jsonError("Recommandation introuvable.", "not_found", 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }
  const parsed = patchInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }

  const patch = parsed.data;
  if (patch.series_id) {
    const series = await getSeriesById(patch.series_id);
    if (!series) return jsonError("Série introuvable.", "not_found", 404);
  }

  const debut = patch.debut !== undefined ? patch.debut : existing.debut;
  const fin = patch.fin !== undefined ? patch.fin : existing.fin;
  if (debut && fin && new Date(debut) > new Date(fin)) {
    return jsonError("La date de fin précède la date de début.", "invalid_period", 400);
  }

  const updated = await getDb().update<Recommendation>(
    TABLES.recommendations,
    id,
    patch as Record<string, unknown>,
  );

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
}

/** DELETE /api/admin/recommendations/[id] — suppression (admin+). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "manage_recommendations")) {
    return jsonError("Réservé aux administrateurs.", "forbidden", 403);
  }

  const ip = clientIp(request);
  const limit = rateLimit(`admin:reco:delete:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const existing = await find(id);
  if (!existing) return jsonError("Recommandation introuvable.", "not_found", 404);

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
}
