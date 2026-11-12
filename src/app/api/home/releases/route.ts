import { adultGateAccepted } from "@/server/auth";
import { listRecentReleases } from "@/lib/data/chapters";
import type { ReleaseDto } from "@/lib/dto";
import type { SeriesType } from "@/lib/types";
import { route, fail } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: SeriesType[] = ["manga", "manhwa", "manhua", "light_novel"];
const PER_PAGE = 12;

/**
 * GET /api/home/releases?type=&page=
 * Onglets et « Charger plus » des « Dernières sorties ».
 */
export const GET = route(
  {
    rateLimit: { key: "home:releases", limit: 60, windowMs: 60_000, message: "Trop de requêtes." },
  },
  async ({ searchParams: sp }) => {
    const type = sp.get("type") ?? "";
    const page = Number(sp.get("page") ?? "1");

    if (type && !TYPES.includes(type as SeriesType)) {
      fail(400, "Format inconnu.", "validation");
    }
    if (!Number.isInteger(page) || page < 1 || page > 100) {
      fail(400, "Page invalide.", "validation");
    }

    const includeAdult = await adultGateAccepted();
    const {
      items,
      total,
      page: current,
      perPage,
    } = await listRecentReleases({
      type: (type || "") as SeriesType | "",
      page,
      perPage: PER_PAGE,
      includeAdult,
    });

    const results: ReleaseDto[] = items.map((ch) => ({
      id: ch.id,
      numero: ch.numero,
      publishAt: ch.publish_at,
      classification: ch.classification,
      series: {
        slug: ch.series.slug,
        titre: ch.series.titre,
        couverture: ch.series.couverture || `/api/img/cover/${ch.series.slug}`,
        type: ch.series.type,
        classification: ch.series.classification,
        unite: ch.series.unite ?? "chapitre",
      },
    }));

    return Response.json({ items: results, total, page: current, perPage });
  },
);
