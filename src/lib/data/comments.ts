import "server-only";
import { getDb, TABLES } from "@/lib/db";
import type { Comment } from "@/lib/types";

export interface CommentThread extends Comment {
  children: CommentThread[];
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const LINK_PATTERN = /(https?:\/\/|www\.)/i;

/** Nettoyage : texte brut uniquement, HTML retiré, longueur bornée (§14.1). */
export function sanitizeComment(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, 4000);
}

export type CommentRejection = "vide" | "trop_long" | "doublon" | "lien" | "trop_tot";

export async function validateComment(input: {
  userId: string;
  contenu: string;
  parentId?: string | null;
  isNewcomer?: boolean;
}): Promise<{ ok: true; contenu: string } | { ok: false; reason: CommentRejection }> {
  const contenu = sanitizeComment(input.contenu);
  if (contenu.length < 2) return { ok: false, reason: "vide" };
  if (contenu.length > 4000) return { ok: false, reason: "trop_long" };
  // Blocage des liens pour les comptes récents (anti-spam §8)
  if (input.isNewcomer && LINK_PATTERN.test(contenu)) return { ok: false, reason: "lien" };

  const recent = await getDb().list<Comment>(TABLES.comments, {
    filters: [{ field: "user_id", op: "eq", value: input.userId }],
    order: { field: "created_at", dir: "desc" },
    limit: 5,
  });
  const last = recent.items[0];
  if (last && Date.now() - new Date(last.created_at).getTime() < 5_000) {
    return { ok: false, reason: "trop_tot" };
  }
  if (last && last.contenu === contenu) return { ok: false, reason: "doublon" };
  return { ok: true, contenu };
}

export async function listComments(
  targetType: Comment["target_type"],
  targetId: string,
): Promise<{ roots: CommentThread[]; total: number }> {
  const { items, total } = await getDb().list<Comment>(TABLES.comments, {
    filters: [
      { field: "target_type", op: "eq", value: targetType },
      { field: "target_id", op: "eq", value: targetId },
      { field: "statut", op: "eq", value: "visible" },
    ],
    order: { field: "created_at", dir: "desc" },
    limit: 500,
  });
  const byId = new Map<string, CommentThread>();
  for (const c of items) byId.set(c.id, { ...c, children: [] });
  const roots: CommentThread[] = [];
  for (const c of items) {
    const node = byId.get(c.id)!;
    if (c.parent_id && byId.has(c.parent_id) && byId.get(c.parent_id)!.children.length < 1) {
      byId.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return { roots, total };
}

export async function createComment(input: {
  targetType: Comment["target_type"];
  targetId: string;
  parentId: string | null;
  userId: string;
  pseudo: string;
  contenu: string;
}): Promise<Comment> {
  const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const comment: Comment = {
    id,
    target_type: input.targetType,
    target_id: input.targetId,
    parent_id: input.parentId,
    user_id: input.userId,
    pseudo: input.pseudo,
    contenu: sanitizeComment(input.contenu),
    spoiler: false,
    likes: 0,
    dislikes: 0,
    statut: "visible",
    created_at: now,
    updated_at: now,
  };
  await getDb().create<Comment>(TABLES.comments, id, comment as unknown as Record<string, unknown>);
  return comment;
}

export async function getComment(id: string): Promise<Comment | null> {
  return getDb().get<Comment>(TABLES.comments, id);
}

/** Édition : fenêtre de 15 minutes pour l'auteur (§8). */
export async function updateComment(
  id: string,
  patch: { contenu?: string; spoiler?: boolean },
): Promise<Comment | null> {
  const existing = await getComment(id);
  if (!existing) return null;
  const data: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.contenu !== undefined) data.contenu = sanitizeComment(patch.contenu);
  if (patch.spoiler !== undefined) data.spoiler = patch.spoiler;
  return getDb().update<Comment>(TABLES.comments, id, data);
}

export async function softDeleteComment(id: string): Promise<void> {
  await getDb().update<Comment>(TABLES.comments, id, { statut: "supprime" });
}

export function canEditComment(comment: Comment, userId: string, now = Date.now()): boolean {
  if (comment.user_id !== userId) return false;
  return now - new Date(comment.created_at).getTime() < EDIT_WINDOW_MS;
}

/** Like unique par (user_id, target_id) — contrainte d'unicité (§14.8). */
export async function toggleLike(
  userId: string,
  commentId: string,
): Promise<{ likes: number; liked: boolean }> {
  const db = getDb();
  const likeId = `${userId}-${commentId}`;
  const existing = await db.get<{ id: string }>(TABLES.commentLikes, likeId);
  const comment = await getComment(commentId);
  if (!comment) return { likes: 0, liked: false };

  if (existing) {
    await db.remove(TABLES.commentLikes, likeId);
    const likes = Math.max(0, comment.likes - 1);
    await db.update<Comment>(TABLES.comments, commentId, { likes });
    return { likes, liked: false };
  }
  await db.create(TABLES.commentLikes, likeId, {
    user_id: userId,
    target_id: commentId,
    created_at: new Date().toISOString(),
  });
  const likes = comment.likes + 1;
  await db.update<Comment>(TABLES.comments, commentId, { likes });
  return { likes, liked: true };
}
