import { adultGateAccepted } from "@/server/auth";
import { atLeast } from "@/lib/roles";
import { listSeries } from "@/lib/data/series";
import type { SeriesStatus, SeriesType } from "@/lib/types";
import { route } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SeriesSearchResult = {
  id: string;
  slug: string;
  titre: string;
  couverture: string;
  type: SeriesType;
  statut: SeriesStatus;
  classification: "all" | "adult";
};

/**
 * GET /api/catalogue/search?q= — recherche publique légère (max 10), alimentée
 * par le champ instantané. Utilisée aussi par les sélecteurs du
 * back-office. Le contenu +18 n'est renvoyé qu'aux comptes admin+ ou après
 * validation du gate adulte.
 */
export const GET = route(
  {
    auth: "optional",
    rateLimit: {
      key: "catalogue:search",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
  },
  async ({ user, searchParams }) => {
    const q = (searchParams.get("q") ?? "").trim();
    if (!q) return Response.json([]);

    const includeAdult = atLeast(user?.role, "admin") || (await adultGateAccepted());

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
      type: s.type,
      statut: s.statut,
      classification: s.classification,
    }));

    return Response.json(results);
  },
);
