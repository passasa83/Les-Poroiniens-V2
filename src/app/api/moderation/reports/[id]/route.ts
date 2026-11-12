import { z } from "zod";
import { audit, handleReport } from "@/lib/data/moderation";
import { softDeleteComment, getComment } from "@/lib/data/comments";
import { getDb, TABLES } from "@/server/db";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

const patchInput = z.object({
  statut: z.enum(["traite", "rejete"]),
  masquerCommentaire: z.boolean().default(false),
});

/** PATCH /api/moderation/reports/[id] — traitement d'un signalement (modo+). */
export const PATCH = route(
  {
    auth: "moderate",
    forbidden: "Réservé aux modérateurs.",
    rateLimit: {
      key: "moderation:reports:patch",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
    body: patchInput,
    invalidBody: "issue",
  },
  async ({ body, params, user, ip }) => {
    const { id } = params;
    const report = await getDb().get(TABLES.reports, id);
    if (!report) fail(404, "Signalement introuvable.", "not_found");

    const { statut, masquerCommentaire } = body;
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
  },
);
