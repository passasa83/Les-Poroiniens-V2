import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  canEditComment,
  getComment,
  softDeleteComment,
  updateComment,
  validateComment,
} from "@/lib/data/comments";
import { can } from "@/lib/roles";

export const runtime = "nodejs";

const PatchSchema = z.object({
  contenu: z.string().min(1),
});

type Params = { params: Promise<{ id: string }> };

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

export async function PATCH(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Connexion requise.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`comment-edit:${clientIp(request)}:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "trop de requêtes", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { id } = await params;
  const comment = await getComment(id);
  if (!comment || comment.statut === "supprime") {
    return NextResponse.json(
      { error: "commentaire introuvable", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const moderate = can(user.role, "moderate");
  if (comment.user_id !== user.id) {
    return NextResponse.json(
      { error: "Vous ne pouvez modifier que vos propres commentaires.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }
  if (!moderate && !canEditComment(comment, user.id)) {
    return NextResponse.json(
      { error: "Délai de modification dépassé (15 minutes).", code: "EDIT_WINDOW" },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const validation = await validateComment({
    userId: user.id,
    contenu: parsed.data.contenu,
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
    return NextResponse.json(
      { error: "modification impossible", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    comment: { ...updated, liked: false, canEdit: true, canDelete: true, children: [] },
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Connexion requise.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`comment-del:${clientIp(request)}:${user.id}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "trop de requêtes", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { id } = await params;
  const comment = await getComment(id);
  if (!comment || comment.statut === "supprime") {
    return NextResponse.json(
      { error: "commentaire introuvable", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  const moderate = can(user.role, "moderate");
  if (comment.user_id !== user.id && !moderate) {
    return NextResponse.json(
      { error: "Suppression non autorisée.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  await softDeleteComment(comment.id);
  return NextResponse.json({ ok: true });
}
