import { NextResponse } from "next/server";
import { z } from "zod";
import { adultGateAccepted } from "@/lib/auth";
import { getChapterById, getChapterPageUrls } from "@/lib/data/chapters";
import { getSeriesById } from "@/lib/data/series";
import { cached } from "@/lib/db";

export const runtime = "nodejs";

const Params = z.object({ id: z.string().min(1).max(64) });

/**
 * Listing des pages d’un chapitre (§14.7) : l’index est lu en base, jamais
 * sur le NAS. URLs signées à durée courte côté serveur + en-tête X-Cache.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = Params.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ error: "identifiant invalide", code: "VALIDATION" }, { status: 400 });
  }

  const chapter = await getChapterById(parsed.data.id);
  if (!chapter || chapter.statut !== "published") {
    return NextResponse.json({ error: "chapitre introuvable", code: "NOT_FOUND" }, { status: 404 });
  }

  const series = await getSeriesById(chapter.series_id);
  if (!series) {
    return NextResponse.json({ error: "série introuvable", code: "NOT_FOUND" }, { status: 404 });
  }

  const isAdult =
    series.classification === "adult" || chapter.classification === "adult";
  if (isAdult && !(await adultGateAccepted())) {
    return NextResponse.json(
      { error: "adult_gate_required", code: "ADULT_GATE" },
      { status: 403 },
    );
  }

  let hit = "HIT";
  const payload = await cached(`chapter-pages:${chapter.id}`, 60_000, async () => {
    hit = "MISS";
    return getChapterPageUrls(chapter.id);
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=60",
      "X-Cache": hit,
    },
  });
}
