import "server-only";
import { cached, getDb, invalidate, TABLES } from "@/lib/db";
import type { Recommendation, Series, SeriesStatus, SeriesType } from "@/lib/types";

export type SeriesSort =
  | "popularite"
  | "nouveautes"
  | "alpha"
  | "note"
  | "maj";

export interface SeriesFilters {
  q?: string;
  genre?: string;
  tag?: string;
  statut?: SeriesStatus | "";
  type?: SeriesType | "";
  annee?: number | "";
  classification?: "all" | "adult" | "";
  sort?: SeriesSort;
  page?: number;
  perPage?: number;
  includeAdult?: boolean;
}

const SORT_MAP: Record<SeriesSort, { field: string; dir: "asc" | "desc" }> = {
  popularite: { field: "populaire", dir: "desc" },
  nouveautes: { field: "created_at", dir: "desc" },
  alpha: { field: "titre", dir: "asc" },
  note: { field: "noteMoy", dir: "desc" },
  maj: { field: "updated_at", dir: "desc" },
};

export async function listSeries(f: SeriesFilters = {}): Promise<{
  items: Series[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const perPage = Math.min(f.perPage ?? 24, 48);
  const page = Math.max(f.page ?? 1, 1);
  const sort = SORT_MAP[f.sort ?? "popularite"];

  const key = `series:${JSON.stringify({ ...f, page, perPage })}`;
  return cached(key, 30_000, async () => {
    const filters = [];
    if (f.genre) filters.push({ field: "genres", op: "contains" as const, value: f.genre });
    if (f.tag) filters.push({ field: "tags", op: "contains" as const, value: f.tag });
    if (f.statut) filters.push({ field: "statut", op: "eq" as const, value: f.statut });
    if (f.type) filters.push({ field: "type", op: "eq" as const, value: f.type });
    if (f.annee) filters.push({ field: "annee", op: "eq" as const, value: f.annee });
    if (!f.includeAdult) {
      filters.push({ field: "classification", op: "eq" as const, value: "all" });
    } else if (f.classification === "adult") {
      filters.push({ field: "classification", op: "eq" as const, value: "adult" });
    }

    const { items, total } = await getDb().list<Series>(TABLES.series, {
      filters,
      search: f.q?.trim() || undefined,
      order: sort,
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    return {
      items: f.includeAdult ? items : items.filter((s) => s.classification !== "adult"),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
  });
}

export async function getSeriesBySlug(slug: string): Promise<Series | null> {
  const res = await getDb().list<Series>(TABLES.series, {
    filters: [{ field: "slug", op: "eq", value: slug }],
    limit: 1,
  });
  return res.items[0] ?? null;
}

export async function getSeriesById(id: string): Promise<Series | null> {
  return getDb().get<Series>(TABLES.series, id);
}

export async function allSeries(): Promise<Series[]> {
  const { items } = await getDb().list<Series>(TABLES.series, {
    order: { field: "titre", dir: "asc" },
    limit: 1000,
  });
  return items;
}

/** « Séries similaires » : genres puis tags en commun (§12.2). */
export async function similarSeries(series: Series, limit = 6): Promise<Series[]> {
  const all = await allSeries();
  return all
    .filter((s) => s.id !== series.id && s.classification === series.classification)
    .map((s) => ({
      s,
      score:
        s.genres.filter((g) => series.genres.includes(g)).length * 3 +
        s.tags.filter((t) => series.tags.includes(t)).length * 2 +
        (s.type === series.type ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

export async function activeRecommendations(
  placement: Recommendation["placement"],
): Promise<Recommendation[]> {
  const { items } = await getDb().list<Recommendation>(TABLES.recommendations, {
    filters: [
      { field: "placement", op: "eq", value: placement },
      { field: "actif", op: "eq", value: true },
    ],
    order: { field: "ordre", dir: "asc" },
    limit: 50,
  });
  const now = Date.now();
  return items.filter((r) => {
    if (r.debut && new Date(r.debut).getTime() > now) return false;
    if (r.fin && new Date(r.fin).getTime() < now) return false;
    return true;
  });
}

/** Top séries par vues (utilisé pour la home et le dashboard). */
export async function popularSeries(limit = 10, includeAdult = false): Promise<Series[]> {
  const { items } = await getDb().list<Series>(TABLES.series, {
    order: { field: "vues", dir: "desc" },
    limit,
  });
  return includeAdult ? items : items.filter((s) => s.classification !== "adult");
}

export async function seriesStats(slug: string): Promise<{
  vues: number;
  noteMoy: number;
  nbVotes: number;
  nb_chapitres: number;
} | null> {
  return cached(`stats:${slug}`, 60_000, async () => {
    const series = await getSeriesBySlug(slug);
    if (!series) return null;
    const { total } = await getDb().list(TABLES.chapters, {
      filters: [
        { field: "series_id", op: "eq", value: series.id },
        { field: "statut", op: "eq", value: "published" },
      ],
      limit: 1,
    });
    return {
      vues: series.vues,
      noteMoy: series.noteMoy,
      nbVotes: series.nbVotes,
      nb_chapitres: total,
    };
  });
}

export async function saveSeries(series: Partial<Series> & { id: string }): Promise<Series> {
  const db = getDb();
  const { id, ...data } = series;
  const existing = await db.get<Series>(TABLES.series, id);
  const updated = existing
    ? await db.update<Series>(TABLES.series, id, {
        ...(data as Record<string, unknown>),
        updated_at: new Date().toISOString(),
      })
    : await db.create<Series>(TABLES.series, id, {
        ...(data as Record<string, unknown>),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
  invalidate("series:");
  invalidate("stats:");
  return updated;
}

export async function deleteSeries(id: string): Promise<void> {
  await getDb().remove(TABLES.series, id);
  invalidate("series:");
}
