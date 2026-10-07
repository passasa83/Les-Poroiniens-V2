import { NextResponse } from "next/server";
import { seriesStats } from "@/lib/data/series";

export const runtime = "nodejs";

type Params = { params: Promise<{ slug: string }> };

/** Statistiques publiques d'une série, léger cache CDN. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const stats = await seriesStats(slug);

  if (!stats) {
    return NextResponse.json(
      { error: "série introuvable", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
