import type { MetadataRoute } from "next";
import { listChapters } from "@/lib/data/chapters";
import { allSeries } from "@/lib/data/series";

// Les fichiers sitemap sont mis en cache par défaut par Next : sans cette
// option, le sitemap continuait de lister des séries supprimées jusqu'au
// prochain build. On le regénère à chaque requête (une requête DB).
export const dynamic = "force-dynamic";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

/** Routes statiques principales (§14.9). */
const STATIC_ROUTES: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/catalogue", changeFrequency: "daily", priority: 0.9 },
  { path: "/recherche", changeFrequency: "weekly", priority: 0.5 },
  { path: "/aide", changeFrequency: "monthly", priority: 0.4 },
  { path: "/legal/mentions", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/confidentialite", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/dmca", changeFrequency: "yearly", priority: 0.3 },
];

function toDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const statics: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: `${siteUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  let series: Awaited<ReturnType<typeof allSeries>> = [];
  try {
    series = await allSeries();
  } catch {
    // Base indisponible : le sitemap reste utilisable avec les routes statiques.
    return statics;
  }

  const publishable = series.filter((s) => s.classification !== "adult" && s.slug);

  // Chapitres publiés (§14.9) : le contenu +18 reste exclu du sitemap.
  let chapters: Array<{ slug: string; numero: number }> = [];
  try {
    chapters = (
      await Promise.all(
        publishable.map(async (s) => {
          const items = await listChapters(s.id, { publishedOnly: true });
          return items.map((c) => ({ slug: s.slug, numero: c.numero }));
        }),
      )
    ).flat();
  } catch {
    // Base indisponible : le sitemap garde les séries déjà chargées.
  }

  return [
    ...statics,
    ...publishable.map((s) => ({
      url: `${siteUrl}/serie/${s.slug}`,
      lastModified: toDate(s.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...chapters.map((c) => ({
      url: `${siteUrl}/serie/${c.slug}/chapitre-${c.numero}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
