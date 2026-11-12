import "server-only";
import { cache } from "react";
import { getDb, listAll, TABLES, type Field, type TableFilter } from "@/server/db";
import { cached, invalidate } from "@/server/cache";
import { filtresSansDemo, serieDeDemo } from "@/lib/demo-gate";
import { resolveCover, storeCover } from "@/lib/media";
import type { Recommendation, Series, SeriesStatus, SeriesType } from "@/lib/types";

/**
 * Lisibilité : la couverture et la bannière stockées en base sont des chemins
 * relatifs (`public/` sur le NAS) ou des URLs ; on renvoie toujours des URLs
 * servables, versionnées par la dernière mise à jour. `saveSeries`
 * applique l'opération inverse pour ne jamais réécrire une URL résolue.
 */
export function mapSeries<T extends Series>(row: T): T {
  if (!row) return row;
  return {
    ...row,
    couverture: resolveCover(row.couverture, row.updated_at),
    banniere: row.banniere ? resolveCover(row.banniere, row.updated_at) : row.banniere,
  };
}

export type SeriesSort = "popularite" | "nouveautes" | "alpha" | "note" | "maj";

export interface SeriesFilters {
  q?: string;
  /** Genre unique **ou** liste séparée par des virgules (filtre multiple) :
   *  chaque valeur devient un critère `genres contains` (ET). */
  genre?: string;
  tag?: string;
  statut?: SeriesStatus | "";
  type?: SeriesType | "";
  annee?: number | "";
  langue?: string;
  classification?: "all" | "adult" | "";
  /** Onglet « One-shot » : œuvre d'une seule publication. */
  oneShot?: boolean;
  /** Onglets exclusifs : écarte les one-shots des listes « En cours »/« Terminés ». */
  excludeOneShot?: boolean;
  sort?: SeriesSort;
  page?: number;
  perPage?: number;
  includeAdult?: boolean;
  /** Inclut les séries archivées (back-office uniquement). */
  includeArchived?: boolean;
}

/**
 * Séries archivées exclues du catalogue public : le filtre `neq` porte
 * sur le statut déjà stocké, il n'y a donc rien à backfiller.
 */
function filtreArchives(include?: boolean, statut?: SeriesStatus | ""): TableFilter<"series">[] {
  if (include || statut === "archive") return [];
  return [{ field: "statut", op: "neq" as const, value: "archive" }];
}

const SORT_MAP: Record<SeriesSort, { field: Field<"series">; dir: "asc" | "desc" }> = {
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
    const filters = catalogueFilters(f);
    const { items, total } = await getDb().list(TABLES.series, {
      filters,
      search: f.q?.trim() || undefined,
      order: sort,
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    const visible = (rows: Series[]) =>
      (f.includeAdult ? rows : rows.filter((s) => s.classification !== "adult")).map(mapSeries);

    /* Tolérance aux fautes : le plein texte Appwrite est strict (mots
       entiers, accents normalisés). S'il ne renvoie rien, on note l'index
       léger des séries (en cache, colonnes utiles seulement), puis on ne
       charge en entier que les séries de la page. */
    if (f.q && total === 0) {
      const index = await seriesIndex({ includeArchived: f.includeArchived });
      const scored = index
        .filter((entry) => matchesFilters(entry, f))
        .map((entry) => ({ entry, score: fuzzyScore(f.q!, entry) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || b.entry.populaire - a.entry.populaire);
      const ids = scored
        .slice((page - 1) * perPage, (page - 1) * perPage + perPage)
        .map((x) => x.entry.id);
      const rows = await seriesParIds(ids);
      return {
        items: visible(ids.flatMap((id) => rows.get(id) ?? [])),
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

/** Critères du catalogue, traduits en filtres de requête. */
function catalogueFilters(f: SeriesFilters): TableFilter<"series">[] {
  const filters: TableFilter<"series">[] = [];
  /* Genre multiple : « a,b » = série possédant a **et** b. */
  for (const g of splitGenres(f.genre)) {
    filters.push({ field: "genres", op: "contains", value: g });
  }
  if (f.tag) filters.push({ field: "tags", op: "contains", value: f.tag });
  if (f.statut) filters.push({ field: "statut", op: "eq", value: f.statut });
  if (f.type) filters.push({ field: "type", op: "eq", value: f.type });
  if (f.annee) filters.push({ field: "annee", op: "eq", value: f.annee });
  if (f.langue) filters.push({ field: "langue", op: "eq", value: f.langue });
  /* Onglets de statut exclusifs : une publication unique appartient
     à l'onglet « One-shot », pas aux listes « En cours »/« Terminés ». */
  if (f.oneShot) {
    filters.push({ field: "nb_chapitres", op: "eq", value: 1 });
  } else if (f.excludeOneShot) {
    filters.push({ field: "nb_chapitres", op: "neq", value: 1 });
  }
  if (!f.includeAdult) {
    filters.push({ field: "classification", op: "eq", value: "all" });
  } else if (f.classification === "adult") {
    filters.push({ field: "classification", op: "eq", value: "adult" });
  }
  filters.push(...filtreArchives(f.includeArchived, f.statut));
  /* Jeu de démo masqué en production : l'exclusion est portée **par la
     requête** pour que `total` et la pagination restent exacts. */
  filters.push(...filtresSansDemo("series"));
  return filters;
}

const splitGenres = (genre?: string) =>
  (genre ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

/** Mêmes critères que `catalogueFilters`, appliqués à l'index en mémoire. */
function matchesFilters(s: SeriesIndexEntry, f: SeriesFilters): boolean {
  if (!splitGenres(f.genre).every((g) => s.genres.includes(g))) return false;
  if (f.tag && !s.tags.includes(f.tag)) return false;
  if (f.statut && s.statut !== f.statut) return false;
  if (f.type && s.type !== f.type) return false;
  if (f.annee && s.annee !== f.annee) return false;
  if (f.langue && s.langue !== f.langue) return false;
  if (f.oneShot && s.nb_chapitres !== 1) return false;
  if (!f.oneShot && f.excludeOneShot && s.nb_chapitres === 1) return false;
  if (!f.includeAdult && s.classification !== "all") return false;
  if (f.includeAdult && f.classification === "adult" && s.classification !== "adult") {
    return false;
  }
  return true;
}

/* ── Index léger des séries ───────────────────────────────────── */

/** Colonnes suffisantes pour filtrer, noter, suggérer et lister (sitemap). */
const INDEX_FIELDS = [
  "slug",
  "titre",
  "titresAlt",
  "auteurs",
  "genres",
  "tags",
  "type",
  "statut",
  "classification",
  "annee",
  "langue",
  "nb_chapitres",
  "populaire",
  "vues",
  "updated_at",
] as const satisfies readonly Field<"series">[];

export type SeriesIndexEntry = Pick<Series, "id" | (typeof INDEX_FIELDS)[number]>;

/**
 * Toutes les séries publiques, colonnes d'index seulement (pas de synopsis
 * ni de champs de recherche), lues par lots : remplace les `limit: 1000`
 * qui tronquaient le catalogue au-delà de 1000 séries. 5 min de cache,
 * vidé par toute écriture `series:`.
 */
export async function seriesIndex(
  opts: { includeArchived?: boolean } = {},
): Promise<SeriesIndexEntry[]> {
  return cached(`series:index:${opts.includeArchived ? 1 : 0}`, 5 * 60_000, async () => {
    const rows = await listAll(TABLES.series, {
      filters: [...filtresSansDemo("series"), ...filtreArchives(opts.includeArchived)],
      order: { field: "titre", dir: "asc" },
      select: INDEX_FIELDS,
    });
    return rows.map((row) => {
      const entry = { id: row.id } as Record<string, unknown>;
      for (const field of INDEX_FIELDS) entry[field] = row[field];
      const e = entry as SeriesIndexEntry;
      e.titresAlt ??= [];
      e.auteurs ??= [];
      e.genres ??= [];
      e.tags ??= [];
      return e;
    });
  });
}

/** Valeurs proposées par les filtres du catalogue et de la recherche. */
export async function catalogueFacets(): Promise<{
  genres: string[];
  years: number[];
  langues: string[];
}> {
  const index = await seriesIndex();
  const byName = (a: string, b: string) => a.localeCompare(b, "fr");
  return {
    genres: [...new Set(index.flatMap((s) => s.genres))].sort(byName),
    years: [
      ...new Set(index.map((s) => s.annee).filter((y): y is number => typeof y === "number")),
    ].sort((a, b) => b - a),
    langues: [...new Set(index.map((s) => s.langue).filter(Boolean))].sort(byName),
  };
}

/* ── Tolérance aux fautes ─────────────────────────────────────── */

/** Déaccentue et minuscule : « Élite » ≈ « elite ». */
const stripAccents = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

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
export function fuzzyScore(
  query: string,
  serie: Pick<Series, "titre" | "slug" | "titresAlt" | "auteurs">,
): number {
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

/* `React cache` : la fiche série appelle `getSeriesBySlug` au moins deux fois
   (`generateMetadata` + page) — sans déduplication, deux aller-retours vers le
   backend pour strictement la même ligne. La clé mémorise un booléen (React
   compare les arguments par `Object.is`, un objet ne dédoublonnerait pas). */
const serieParSlug = cache(
  async (slug: string, includeArchived: boolean): Promise<Series | null> => {
    /* Série de la graine masquée en production : `null` → vrai 404 (page fiche,
       lecteur, proxy) sans requête inutile. */
    if (serieDeDemo(slug)) return null;
    return cached(`series:slug:${slug}:${includeArchived ? 1 : 0}`, SERIES_TTL, () =>
      findSeriesBySlug(slug, { includeArchived }),
    );
  },
);

/** Fiche d'une série : 1 min en cache (invalidée par toute écriture `series:`). */
const SERIES_TTL = 60_000;

/** Lecture directe, sans cache : contrôle d'existence du proxy. */
export async function findSeriesBySlug(
  slug: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Series | null> {
  if (serieDeDemo(slug)) return null;
  const res = await getDb().list(TABLES.series, {
    filters: [{ field: "slug", op: "eq", value: slug }, ...filtreArchives(opts.includeArchived)],
    limit: 1,
  });
  return res.items[0] ? mapSeries(res.items[0]) : null;
}

export async function getSeriesBySlug(
  slug: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Series | null> {
  return serieParSlug(slug, Boolean(opts.includeArchived));
}

export const getSeriesById = cache(async (id: string): Promise<Series | null> => {
  if (serieDeDemo(id)) return null;
  return cached(`series:id:${id}`, SERIES_TTL, async () => {
    const row = await getDb().get(TABLES.series, id);
    return row ? mapSeries(row) : null;
  });
});

/**
 * Plusieurs séries en **une seule** requête (lots de 50 ids pour rester loin
 * des limites de longueur d'URL, lots volés en parallèle → un seul RTT).
 *
 * C'est le remède aux N+1 « un `get` par ligne » : sorties récentes,
 * nouveautés et accueil faisaient 12 à 240 aller-retours séquentiels vers un
 * backend distant — d'où des chargements de plusieurs dizaines de secondes.
 */
export async function seriesParIds(ids: readonly string[]): Promise<Map<string, Series>> {
  const uniques = [...new Set(ids)].filter((id) => id && !serieDeDemo(id));
  const sortie = new Map<string, Series>();
  if (uniques.length === 0) return sortie;

  const lots: string[][] = [];
  for (let i = 0; i < uniques.length; i += 50) lots.push(uniques.slice(i, i + 50));
  const resultats = await Promise.all(
    lots.map((lot) =>
      getDb().list(TABLES.series, {
        filters: [{ field: "id", op: "in", value: lot }],
        limit: lot.length,
      }),
    ),
  );
  for (const resultat of resultats) {
    for (const row of resultat.items) sortie.set(row.id, mapSeries(row));
  }
  return sortie;
}

export async function allSeries(opts: { includeArchived?: boolean } = {}): Promise<Series[]> {
  /* Lignes complètes : réservé au back-office (sélecteurs de série). Les
     pages publiques passent par `seriesIndex` (colonnes utiles seulement). */
  return cached(`series:tout:${opts.includeArchived ? 1 : 0}`, 60_000, async () => {
    const rows = await listAll(TABLES.series, {
      filters: [...filtresSansDemo("series"), ...filtreArchives(opts.includeArchived)],
      order: { field: "titre", dir: "asc" },
    });
    return rows.map(mapSeries);
  });
}

/** « Séries similaires » : genres puis tags en commun. */
export async function similarSeries(series: Series, limit = 6): Promise<Series[]> {
  const index = await seriesIndex();
  const ids = index
    .filter((s) => s.id !== series.id && s.classification === series.classification)
    .map((s) => ({
      id: s.id,
      score:
        s.genres.filter((g) => series.genres.includes(g)).length * 3 +
        s.tags.filter((t) => series.tags.includes(t)).length * 2 +
        (s.type === series.type ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.id);
  const rows = await seriesParIds(ids);
  return ids.flatMap((id) => rows.get(id) ?? []);
}

export async function activeRecommendations(
  placement: Recommendation["placement"],
): Promise<Recommendation[]> {
  // Cache court (30 s) : deux lectures réseau par affichage, et un repli sur la
  // dernière valeur connue si le VPN vers Appwrite tombe (voir `cached`).
  return cached(`series:recos:${placement}`, 30_000, async () => {
    const { items } = await getDb().list(TABLES.recommendations, {
      filters: [
        { field: "placement", op: "eq", value: placement },
        { field: "actif", op: "eq", value: true },
      ],
      order: { field: "ordre", dir: "asc" },
      limit: 50,
    });
    if (items.length === 0) return [];

    /* Une série archivée (ou supprimée) ne doit plus être mise en avant :
       une requête sur les seules séries ciblées (≤ 50). */
    const targets = await getDb().list(TABLES.series, {
      filters: [{ field: "id", op: "in", value: [...new Set(items.map((r) => r.series_id))] }],
      select: ["statut"],
      limit: items.length,
    });
    const archivedIds = new Set(
      targets.items.filter((s) => s.statut === "archive").map((s) => s.id),
    );
    const existing = new Set(targets.items.map((s) => s.id));

    const now = Date.now();
    return items.filter((r) => {
      /* Recommandation éditoriale sur une série de la graine : masquée en prod. */
      if (serieDeDemo(r.series_id)) return false;
      if (archivedIds.has(r.series_id) || !existing.has(r.series_id)) return false;
      if (r.debut && new Date(r.debut).getTime() > now) return false;
      if (r.fin && new Date(r.fin).getTime() < now) return false;
      return true;
    });
  });
}

/** Top séries par vues (utilisé pour la home et le dashboard). */
export async function popularSeries(limit = 10, includeAdult = false): Promise<Series[]> {
  return cached(`series:popular:${limit}:${includeAdult ? 1 : 0}`, 30_000, async () => {
    // Filtre +18 dans la requête : filtré après coup, un visiteur recevait
    // moins de `limit` séries quand le top comptait des séries adultes.
    const { items } = await getDb().list(TABLES.series, {
      filters: [
        ...filtresSansDemo("series"),
        ...filtreArchives(),
        ...(includeAdult ? [] : [{ field: "classification", op: "eq", value: "all" } as const]),
      ],
      order: { field: "vues", dir: "desc" },
      limit,
    });
    return items.map(mapSeries);
  });
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
    // Jamais de résolution en base : on stocke un chemin relatif.
    data.couverture = storeCover(data.couverture);
  }
  if (typeof data.banniere === "string" && data.banniere) {
    data.banniere = storeCover(data.banniere);
  }
  const existing = await db.get(TABLES.series, id);
  /* Recherche plein texte : les colonnes array ne sont pas indexables,
     on alimente la copie concaténée à chaque écriture. */
  const altText = data.titresAlt ?? existing?.titresAlt ?? [];
  const authorText = data.auteurs ?? existing?.auteurs ?? [];
  data.recherche_alt = altText.join(" ");
  data.recherche_auteurs = authorText.join(" ");
  const updated = existing
    ? await db.update(TABLES.series, id, {
        ...(data as Record<string, unknown>),
        updated_at: new Date().toISOString(),
      })
    : await db.create(TABLES.series, id, {
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
