import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canEditComment,
  getComment,
  softDeleteComment,
  updateComment,
  validateComment,
} from "@/lib/data/comments";
import { can } from "@/lib/roles";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

const PatchSchema = z.object({
  contenu: z.string().min(1),
});

function rejectionMessage(reason: string): string {
  switch (reason) {
    case "vide":
      return "Le commentaire ne peut pas être vide.";
    case "trop_long":
      return "Le commentaire dépasse 4 000 caractères.";
    case "doublon":
      return "Vous avez déjà publié ce commentaire.";
    case "trop_tot":
      return "Veuillez patienter quelques secondes.";
    case "lien":
      return "Les liens sont bloqués dans les commentaires des comptes récents.";
    default:
      return "Commentaire refusé.";
  }
}

export const PATCH = route(
  {
    auth: "user",
    rateLimit: {
      key: "comment-edit",
      by: "ip+user",
      limit: 30,
      windowMs: 60_000,
      message: "trop de requêtes",
    },
    body: PatchSchema,
    invalidBody: "corps invalide",
  },
  async ({ params, user, body }) => {
    const { id } = params;
    const comment = await getComment(id);
    if (!comment || comment.statut === "supprime") {
      fail(404, "commentaire introuvable", "NOT_FOUND");
    }

    const moderate = can(user.role, "moderate");
    if (comment.user_id !== user.id) {
      fail(403, "Vous ne pouvez modifier que vos propres commentaires.", "FORBIDDEN");
    }
    if (!moderate && !canEditComment(comment, user.id)) {
      fail(403, "Délai de modification dépassé (15 minutes).", "EDIT_WINDOW");
    }

    const validation = await validateComment({
      userId: user.id,
      contenu: body.contenu,
      parentId: comment.parent_id,
    });
    if (!validation.ok) {
      return NextResponse.json(
        { error: rejectionMessage(validation.reason), code: validation.reason.toUpperCase() },
        { status: 400 },
      );
    }

    const updated = await updateComment(comment.id, { contenu: validation.contenu });
    if (!updated) {
      fail(404, "modification impossible", "NOT_FOUND");
    }

    return NextResponse.json({
      comment: { ...updated, liked: false, canEdit: true, canDelete: true, children: [] },
    });
  },
);

export const DELETE = route(
  {
    auth: "user",
    rateLimit: {
      key: "comment-del",
      by: "ip+user",
      limit: 30,
      windowMs: 60_000,
      message: "trop de requêtes",
    },
  },
  async ({ params, user }) => {
    const { id } = params;
    const comment = await getComment(id);
    if (!comment || comment.statut === "supprime") {
      fail(404, "commentaire introuvable", "NOT_FOUND");
    }

    const moderate = can(user.role, "moderate");
    if (comment.user_id !== user.id && !moderate) {
      fail(403, "Suppression non autorisée.", "FORBIDDEN");
    }

    await softDeleteComment(comment.id);
    return NextResponse.json({ ok: true });
  },
);
