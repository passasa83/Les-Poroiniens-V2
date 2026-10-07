import { NextResponse } from "next/server";
import { z } from "zod";
import { adultGateAccepted } from "@/lib/auth";
import { getChapterById, getChapterPageUrls, listChapters } from "@/lib/data/chapters";
import { getSeriesById } from "@/lib/data/series";
import { cached } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const Params = z.object({ id: z.string().min(1).max(64) });

/**
 * Listing des pages d'un chapitre : l'index est lu en base, jamais
 * sur le NAS. Renvoie les dimensions connues à l'avance (aucun décalage de
 * mise en page), les chapitres voisins, et met en cache 60 s les chapitres
 * publiés. Les URLs sont publiques et versionnées (`?v=<hash>`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = Params.safeParse({ id });
  if (!parsed.success) {
    return NextResponse.json({ error: "identifiant invalide", code: "VALIDATION" }, { status: 400 });
  }

  const limit = rateLimit(`chapter-pages:${clientIp(request)}`, {
    limit: 120,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json({ error: "trop de requêtes", code: "RATE_LIMITED" }, { status: 429 });
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
    const { pages, total } = await getChapterPageUrls(chapter.id);
    const siblings = await listChapters(series.id, { publishedOnly: true });
    const ordered = [...siblings].sort((a, b) => a.numero - b.numero);
    const position = ordered.findIndex((c) => c.id === chapter.id);
    const pick = (target: number) => {
      const sibling = ordered[target];
      return sibling ? { id: sibling.id, numero: sibling.numero } : null;
    };
    return {
      pages,
      total,
      prev: position > 0 ? pick(position - 1) : null,
      next: position >= 0 && position < ordered.length - 1 ? pick(position + 1) : null,
      serie: { id: series.id, slug: series.slug, titre: series.titre },
    };
  });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "private, max-age=60",
      "X-Cache": hit,
    },
  });
}
