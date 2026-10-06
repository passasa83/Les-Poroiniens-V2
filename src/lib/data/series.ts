import "server-only";
import { cached, getDb, invalidate, TABLES, type Filter } from "@/lib/db";
import { filtresSansDemo, serieDeDemo } from "@/lib/demo-gate";
import { resolveCover, storeCover } from "@/lib/media";
import type { Recommendation, Series, SeriesStatus, SeriesType } from "@/lib/types";

/**
 * Lisibilité : la couverture stockée en base est un chemin relatif (`public/`
 * sur le NAS) ou une URL ; on renvoie toujours une URL servable, versionnée
 * par la dernière mise à jour (§7.3). `saveSeries` applique l'opération
 * inverse pour ne jamais réécrire une URL résolue.
 */
export function mapSeries<T extends Series>(row: T): T {
  if (!row) return row;
  return { ...row, couverture: resolveCover(row.couverture, row.updated_at) };
}

export type SeriesSort =
  | "popularite"
  | "nouveautes"
  | "alpha"
  | "note"
  | "maj";

export interface SeriesFilters {
  q?: string;
  /** Genre unique **ou** liste séparée par des virgules (filtre multiple, §6.3) :
   *  chaque valeur devient un critère `genres contains` (ET). */
  genre?: string;
  tag?: string;
  statut?: SeriesStatus | "";
  type?: SeriesType | "";
  annee?: number | "";
  langue?: string;
  classification?: "all" | "adult" | "";
  /** Onglet « One-shot » (§6.3) : œuvre d'une seule publication. */
  oneShot?: boolean;
  /** Onglets exclusifs : écarte les one-shots des listes « En cours »/« Terminés ». */
  excludeOneShot?: boolean;
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
    const filters: Filter[] = [];
    /* Genre multiple (§6.3) : « a,b » = série possédant a **et** b. */
    for (const g of (f.genre ?? "").split(",").map((v) => v.trim()).filter(Boolean)) {
      filters.push({ field: "genres", op: "contains" as const, value: g });
    }
    if (f.tag) filters.push({ field: "tags", op: "contains" as const, value: f.tag });
    if (f.statut) filters.push({ field: "statut", op: "eq" as const, value: f.statut });
    if (f.type) filters.push({ field: "type", op: "eq" as const, value: f.type });
    if (f.annee) filters.push({ field: "annee", op: "eq" as const, value: f.annee });
    if (f.langue) filters.push({ field: "langue", op: "eq" as const, value: f.langue });
    /* Onglets de statut exclusifs (§6.3) : une publication unique appartient
       à l'onglet « One-shot », pas aux listes « En cours »/« Terminés ». */
    if (f.oneShot) {
      filters.push({ field: "nb_chapitres", op: "eq" as const, value: 1 });
    } else if (f.excludeOneShot) {
      filters.push({ field: "nb_chapitres", op: "neq" as const, value: 1 });
    }
    if (!f.includeAdult) {
      filters.push({ field: "classification", op: "eq" as const, value: "all" });
    } else if (f.classification === "adult") {
      filters.push({ field: "classification", op: "eq" as const, value: "adult" });
    }

    /* Jeu de démo masqué en production : l'exclusion est portée **par la
       requête** pour que `total`, la pagination et le repli tolérant aux
       fautes (qui réutilise `filters`) restent exacts. */
    filters.push(...filtresSansDemo("series"));

    const { items, total } = await getDb().list<Series>(TABLES.series, {
      filters,
      search: f.q?.trim() || undefined,
      order: sort,
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    const visible = (rows: Series[]) =>
      (f.includeAdult ? rows : rows.filter((s) => s.classification !== "adult")).map(mapSeries);

    /* Tolérance aux fautes (§6.4) : le plein texte Appwrite est strict (mots
       entiers, accents normalisés). S'il ne renvoie rien, on note en mémoire
       le jeu filtré complet (≤ 1000 lignes) sur les titre/alternatifs/auteurs. */
    if (f.q && total === 0) {
      const pool = await getDb().list<Series>(TABLES.series, {
        filters,
        order: sort,
        limit: 1000,
      });
      const scored = pool.items
        .map((s) => ({ s, score: fuzzyScore(f.q!, s) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.s.populaire - a.s.populaire);
      const slice = scored
        .slice((page - 1) * perPage, (page - 1) * perPage + perPage)
        .map((x) => x.s);
      return {
        items: visible(slice),
        total: scored.length,
        page,
        pageCount: Math.max(1, Math.ceil(scored.length / perPage)),
      };
    }

    return {
      items: visible(items),
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / perPage)),
    };
  });
}

/* ── Tolérance aux fautes (§6.4) ─────────────────────────────────────── */

/** Déaccentue et minuscule : « Élite » ≈ « elite ». */
const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function bigrams(value: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < value.length - 1; i++) out.push(value.slice(i, i + 2));
  return out;
}

/** Similarité de Dice sur bigrammes : 1 = identique, 0 = sans rapport. */
function dice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = new Set(bigrams(b));
  if (!A.length || !B.size) return 0;
  let hits = 0;
  for (const g of A) if (B.has(g)) hits++;
  return (2 * hits) / (A.length + B.size);
}

/**
 * Score d'une série pour une requête : 0 = écarte, 1 = correspondance exacte
 * (contiguë). Le score moyen des mots de la requête doit atteindre 0,6.
 */
export function fuzzyScore(query: string, serie: Series): number {
  const needle = stripAccents(query).trim();
  if (needle.length < 2) return 0;
  const fields = [
    stripAccents(serie.titre),
    stripAccents(serie.slug),
    ...(serie.titresAlt ?? []).map(stripAccents),
    ...(serie.auteurs ?? []).map(stripAccents),
  ];
  const haystack = fields.join(" ");
  if (haystack.includes(needle)) return 1;
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const field of fields) {
      best = Math.max(best, dice(token, field));
      for (const word of field.split(/\s+/)) best = Math.max(best, dice(token, word));
    }
    total += best;
  }
  const score = total / tokens.length;
  return score >= 0.6 ? score : 0;
}

export async function getSeriesBySlug(slug: string): Promise<Series | null> {
  /* Série de la graine masquée en production : `null` → vrai 404 (page fiche,
     lecteur, proxy) sans requête inutile. */
  if (serieDeDemo(slug)) return null;
  const res = await getDb().list<Series>(TABLES.series, {
    filters: [{ field: "slug", op: "eq", value: slug }],
    limit: 1,
  });
  return res.items[0] ? mapSeries(res.items[0]) : null;
}

export async function getSeriesById(id: string): Promise<Series | null> {
  if (serieDeDemo(id)) return null;
  const row = await getDb().get<Series>(TABLES.series, id);
  return row ? mapSeries(row) : null;
}

export async function allSeries(): Promise<Series[]> {
  const { items } = await getDb().list<Series>(TABLES.series, {
    filters: filtresSansDemo("series"),
    order: { field: "titre", dir: "asc" },
    limit: 1000,
  });
  return items.map(mapSeries);
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
    /* Recommandation éditoriale sur une série de la graine : masquée en prod. */
    if (serieDeDemo(r.series_id)) return false;
    if (r.debut && new Date(r.debut).getTime() > now) return false;
    if (r.fin && new Date(r.fin).getTime() < now) return false;
    return true;
  });
}

/** Top séries par vues (utilisé pour la home et le dashboard). */
export async function popularSeries(limit = 10, includeAdult = false): Promise<Series[]> {
  const { items } = await getDb().list<Series>(TABLES.series, {
    filters: filtresSansDemo("series"),
    order: { field: "vues", dir: "desc" },
    limit,
  });
  const rows = includeAdult ? items : items.filter((s) => s.classification !== "adult");
  return rows.map(mapSeries);
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
  if (typeof data.couverture === "string") {
    // Jamais de résolution en base : on stocke un chemin relatif (§5.2).
    data.couverture = storeCover(data.couverture);
  }
  const existing = await db.get<Series>(TABLES.series, id);
  /* Recherche plein texte (§6.4) : les colonnes array ne sont pas indexables,
     on alimente la copie concaténée à chaque écriture. */
  const altText = data.titresAlt ?? existing?.titresAlt ?? [];
  const authorText = data.auteurs ?? existing?.auteurs ?? [];
  data.recherche_alt = altText.join(" ");
  data.recherche_auteurs = authorText.join(" ");
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
  return mapSeries(updated);
}

export async function deleteSeries(id: string): Promise<void> {
  await getDb().remove(TABLES.series, id);
  invalidate("series:");
}
