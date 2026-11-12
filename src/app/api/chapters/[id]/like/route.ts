import { NextResponse } from "next/server";
import { getDb, rowId, TABLES } from "@/server/db";
import { getChapterById, invalidateChapters } from "@/lib/data/chapters";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

/**
 * Like de chapitre : contrainte d'unicité (user_id, chapter_id),
 * le compteur `likes` du chapitre est recalculé par le serveur.
 */
export const POST = route(
  {
    auth: "user",
    unauthorized: "unauthorized",
    rateLimit: { key: "like", limit: 30, windowMs: 60_000, message: "too_many_requests" },
  },
  async ({ params, user }) => {
    const { id } = params;
    const chapter = await getChapterById(id);
    if (!chapter) fail(404, "not_found", "NOT_FOUND");
    if (chapter.classification === "adult" && !user.adult_ok) {
      fail(403, "adult_gate_required", "ADULT_GATE");
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
    await db.update(TABLES.chapters, chapter.id, { likes });
    invalidateChapters({ seriesId: chapter.series_id });
    return NextResponse.json({ liked: true, likes }, { status: 201 });
  },
);

export const DELETE = route(
  { auth: "user", unauthorized: "unauthorized" },
  async ({ params, user }) => {
    const { id } = params;
    const chapter = await getChapterById(id);
    if (!chapter) fail(404, "not_found", "NOT_FOUND");

    const db = getDb();
    const likeId = rowId(user.id, chapter.id);
    const existing = await db.get(TABLES.chapterLikes, likeId);
    if (!existing) return NextResponse.json({ liked: false, likes: chapter.likes ?? 0 });

    await db.remove(TABLES.chapterLikes, likeId);
    const likes = Math.max(0, (chapter.likes ?? 0) - 1);
    await db.update(TABLES.chapters, chapter.id, { likes });
    invalidateChapters({ seriesId: chapter.series_id });
    return NextResponse.json({ liked: false, likes });
  },
);

/** Lecture du statut de like (utilisé par le lecteur). */
export const GET = route({ auth: "optional" }, async ({ params, user }) => {
  if (!user) return NextResponse.json({ liked: false, likes: 0 });
  const { id } = params;
  const chapter = await getChapterById(id);
  if (!chapter) fail(404, "not_found", "NOT_FOUND");
  const existing = await getDb().get(TABLES.chapterLikes, rowId(user.id, id));
  return NextResponse.json({ liked: Boolean(existing), likes: chapter.likes ?? 0 });
});
