import { NextResponse } from "next/server";
import { seriesStats } from "@/lib/data/series";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

/** Statistiques publiques d'une série, léger cache CDN. */
export const GET = route({}, async ({ params }) => {
  const { slug } = params;
  const stats = await seriesStats(slug);

  if (!stats) {
    fail(404, "série introuvable", "NOT_FOUND");
  }

  return NextResponse.json(stats, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
});
