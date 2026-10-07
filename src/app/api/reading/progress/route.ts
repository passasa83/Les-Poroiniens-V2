import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getChapterById } from "@/lib/data/chapters";
import { recordProgress } from "@/lib/data/library";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Body = z.object({
  entries: z
    .array(
      z.object({
        chapterId: z.string().min(1).max(64),
        seriesId: z.string().min(1).max(64).optional(),
        page: z.number().int().min(0).max(100_000),
        completed: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(20),
});

/** Envoi par lots de la progression de lecture. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "authentification requise", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`progress:${clientIp(request)}:${user.id}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "trop de requêtes", code: "RATE_LIMIT" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "corps invalide", code: "VALIDATION" }, { status: 400 });
  }

  let saved = 0;
  for (const entry of parsed.data.entries) {
    let seriesId = entry.seriesId;
    if (!seriesId) {
      const chapter = await getChapterById(entry.chapterId);
      if (!chapter) continue;
      seriesId = chapter.series_id;
    }
    await recordProgress({
      userId: user.id,
      chapterId: entry.chapterId,
      seriesId,
      page: entry.page,
      completed: entry.completed,
    });
    saved += 1;
  }

  return NextResponse.json({ ok: true, saved });
}
