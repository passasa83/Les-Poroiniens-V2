import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit, handleReport } from "@/lib/data/moderation";
import { softDeleteComment, getComment } from "@/lib/data/comments";
import { getDb, TABLES } from "@/lib/db";
import type { Report } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

const patchInput = z.object({
  statut: z.enum(["traite", "rejete"]),
  masquerCommentaire: z.boolean().default(false),
});

/** PATCH /api/moderation/reports/[id] — traitement d'un signalement (modo+). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "moderate")) {
    return jsonError("Réservé aux modérateurs.", "forbidden", 403);
  }

  const ip = clientIp(request);
  const limit = rateLimit(`moderation:reports:patch:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  const report = await getDb().get<Report>(TABLES.reports, id);
  if (!report) return jsonError("Signalement introuvable.", "not_found", 404);

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

  const { statut, masquerCommentaire } = parsed.data;
  let hidden = false;

  await handleReport(id, statut, user.id);

  if (masquerCommentaire && report.type === "comment") {
    const comment = await getComment(report.target_id);
    if (comment) {
      await softDeleteComment(comment.id);
      hidden = true;
    }
  }

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: statut === "traite" ? "report.handle" : "report.reject",
    cible: `report:${id}`,
    avant: { statut: report.statut, cible: `${report.type}:${report.target_id}` },
    apres: { statut, masque: hidden, raison: report.raison },
    ip,
  });

  return Response.json({ ok: true, statut, masque: hidden });
}
