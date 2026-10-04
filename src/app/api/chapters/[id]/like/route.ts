import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, rowId, TABLES } from "@/lib/db";
import { getChapterById } from "@/lib/data/chapters";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import type { Chapter } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Like de chapitre (§14.8) : contrainte d'unicité (user_id, chapter_id),
 * le compteur `likes` du chapitre est recalculé par le serveur.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });

  const limit = rateLimit(`like:${clientIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!limit.ok) {
    return NextResponse.json({ error: "too_many_requests", code: "RATE_LIMITED" }, { status: 429 });
  }

  const { id } = await params;
  const chapter = await getChapterById(id);
  if (!chapter) return NextResponse.json({ error: "not_found", code: "NOT_FOUND" }, { status: 404 });
  if (chapter.classification === "adult" && !user.adult_ok) {
    return NextResponse.json({ error: "adult_gate_required", code: "ADULT_GATE" }, { status: 403 });
  }

  const db = getDb();
  const likeId = rowId(user.id, chapter.id);
  const existing = await db.get(TABLES.chapterLikes, likeId);
  if (existing) {
    return NextResponse.json({ liked: true, likes: chapter.likes ?? 0 });
  }

  await db.create(TABLES.chapterLikes, likeId, {
    user_id: user.id,
    chapter_id: chapter.id,
    created_at: new Date().toISOString(),
  });
  const likes = (chapter.likes ?? 0) + 1;
  await db.update<Chapter>(TABLES.chapters, chapter.id, { likes });
  return NextResponse.json({ liked: true, likes }, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized", code: "UNAUTHENTICATED" }, { status: 401 });

  const { id } = await params;
  const chapter = await getChapterById(id);
  if (!chapter) return NextResponse.json({ error: "not_found", code: "NOT_FOUND" }, { status: 404 });

  const db = getDb();
  const likeId = rowId(user.id, chapter.id);
  const existing = await db.get(TABLES.chapterLikes, likeId);
  if (!existing) return NextResponse.json({ liked: false, likes: chapter.likes ?? 0 });

  await db.remove(TABLES.chapterLikes, likeId);
  const likes = Math.max(0, (chapter.likes ?? 0) - 1);
  await db.update<Chapter>(TABLES.chapters, chapter.id, { likes });
  return NextResponse.json({ liked: false, likes });
}

/** Lecture du statut de like (utilisé par le lecteur). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ liked: false, likes: 0 });
  const { id } = await params;
  const chapter = await getChapterById(id);
  if (!chapter) return NextResponse.json({ error: "not_found", code: "NOT_FOUND" }, { status: 404 });
  const existing = await getDb().get(TABLES.chapterLikes, rowId(user.id, id));
  return NextResponse.json({ liked: Boolean(existing), likes: chapter.likes ?? 0 });
}
