import { getComment, toggleLike } from "@/lib/data/comments";
import { getDb, rowId, TABLES } from "@/server/db";
import { fail, route, type RateLimitRule } from "@/server/http";

export const runtime = "nodejs";

const OPTIONS = {
  auth: "user",
  unauthorized: "Connexion requise pour liker un commentaire.",
  rateLimit: {
    key: "comment-like",
    by: "ip+user",
    limit: 60,
    windowMs: 60_000,
    message: "trop de requêtes",
  } satisfies RateLimitRule,
} as const;

/** Commentaire visible, sinon 404. */
async function likeable(id: string) {
  const comment = await getComment(id);
  if (!comment || comment.statut !== "visible") {
    fail(404, "commentaire introuvable", "not_found");
  }
  return comment;
}

/** Ajoute le like (toggle idempotent côté lib). */
export const POST = route(OPTIONS, async ({ user, params }) => {
  await likeable(params.id);
  return Response.json(await toggleLike(user.id, params.id));
});

/** Retire le like : on repasse par le toggle seulement si le like existe. */
export const DELETE = route(OPTIONS, async ({ user, params }) => {
  const comment = await likeable(params.id);
  const existing = await getDb().get(TABLES.commentLikes, rowId(user.id, params.id));
  if (!existing) return Response.json({ likes: comment.likes, liked: false });
  return Response.json(await toggleLike(user.id, params.id));
});
