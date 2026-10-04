import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getComment, toggleLike } from "@/lib/data/comments";
import { getDb, rowId, TABLES } from "@/lib/db";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function ensureLikeable(request: Request, id: string) {
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: NextResponse.json(
        { error: "Connexion requise pour liker un commentaire.", code: "UNAUTHORIZED" },
        { status: 401 },
      ),
    };
  }

  const limit = rateLimit(`comment-like:${clientIp(request)}:${user.id}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return {
      response: NextResponse.json(
        { error: "trop de requêtes", code: "RATE_LIMIT" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
      ),
    };
  }

  const comment = await getComment(id);
  if (!comment || comment.statut !== "visible") {
    return {
      response: NextResponse.json(
        { error: "commentaire introuvable", code: "NOT_FOUND" },
        { status: 404 },
      ),
    };
  }

  return { user, comment };
}

/** Ajoute le like (toggle idempotent côté lib). */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await ensureLikeable(request, id);
  if ("response" in guard) return guard.response;

  const result = await toggleLike(guard.user.id, id);
  return NextResponse.json(result);
}

/** Retire le like : on repasse par le toggle seulement si le like existe. */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params;
  const guard = await ensureLikeable(request, id);
  if ("response" in guard) return guard.response;

  const likeId = rowId(guard.user.id, id);
  const existing = await getDb().get<{ id: string }>(TABLES.commentLikes, likeId);
  if (!existing) {
    return NextResponse.json({ likes: guard.comment.likes, liked: false });
  }

  const result = await toggleLike(guard.user.id, id);
  return NextResponse.json(result);
}
