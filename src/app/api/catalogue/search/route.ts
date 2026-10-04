import { getCurrentUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { listSeries } from "@/lib/data/series";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SeriesSearchResult = {
  id: string;
  slug: string;
  titre: string;
  couverture: string;
};

/**
 * GET /api/catalogue/search?q= — recherche publique légère (max 10).
 * Utilisée notamment par les sélecteurs du back-office. Le contenu +18
 * n'est renvoyé qu'aux comptes admin+ (§11.2).
 */
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (!q) return Response.json([]);

  const limit = rateLimit(`catalogue:search:${clientIp(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return Response.json({ error: "Trop de requêtes.", code: "rate_limited" }, { status: 429 });
  }

  const user = await getCurrentUser();
  const includeAdult = atLeast(user?.role, "admin");

  const { items } = await listSeries({
    q,
    perPage: 10,
    page: 1,
    sort: "alpha",
    includeAdult,
  });

  const results: SeriesSearchResult[] = items.slice(0, 10).map((s) => ({
    id: s.id,
    slug: s.slug,
    titre: s.titre,
    couverture: s.couverture,
  }));

  return Response.json(results);
}
