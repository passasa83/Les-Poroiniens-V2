import { getCurrentUser } from "@/lib/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { allSeries } from "@/lib/data/series";
import { getDb, TABLES } from "@/lib/db";
import { serieDeDemo } from "@/lib/demo-gate";
import type { Recommendation } from "@/lib/types";
import { RecommendationsPanel } from "./_components/recommendations-panel";

export const dynamic = "force-dynamic";

export type SeriesLite = { id: string; titre: string; slug: string; couverture: string };

/** Gestion des recommandations éditoriales (admin+). */
export default async function AdminRecommandationsPage() {
  const user = await getCurrentUser();
  if (!user || !atLeast(user.role, "admin") || !can(user.role, "manage_recommendations")) {
    return <AccessDenied required="admin" />;
  }

  const [recoRes, series] = await Promise.all([
    getDb().list<Recommendation>(TABLES.recommendations, {
      order: { field: "ordre", dir: "asc" },
      limit: 500,
    }),
    allSeries(),
  ]);

  const seriesById: Record<string, SeriesLite> = {};
  for (const s of series) {
    seriesById[s.id] = { id: s.id, titre: s.titre, slug: s.slug, couverture: s.couverture };
  }

  /* Recommandations de la graine (ou visant une série masquée) : écartées du
     panneau — `allSeries` ne contient plus leurs cibles en production. */
  const recommandations = recoRes.items.filter((r) => !serieDeDemo(r.series_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Recommandations</h1>
        <p className="mt-1 text-sm text-muted">
          Sélections manuelles affichées sur la home, les fiches séries et la fin des chapitres.
          Le contenu +18 respecte le gate à l&apos;affichage.
        </p>
      </div>

      <RecommendationsPanel initial={recommandations} seriesById={seriesById} />
    </div>
  );
}
