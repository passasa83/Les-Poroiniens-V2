import { NextResponse } from "next/server";
import { z } from "zod";
import { getChapterById } from "@/lib/data/chapters";
import { recordProgress } from "@/lib/data/progress";
import { route } from "@/server/http";

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
export const POST = route(
  {
    auth: "user",
    unauthorized: "authentification requise",
    rateLimit: {
      key: "progress",
      by: "ip+user",
      limit: 120,
      windowMs: 60_000,
      message: "trop de requêtes",
    },
    body: Body,
    invalidBody: "corps invalide",
  },
  async ({ user, body }) => {
    let saved = 0;
    for (const entry of body.entries) {
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
  },
);
