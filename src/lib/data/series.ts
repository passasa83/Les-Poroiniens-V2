import "server-only";
import { cache } from "react";
import { cached, getDb, invalidate, TABLES, type Filter } from "@/lib/db";
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

export type SeriesSort =
  | "popularite"
  | "nouveautes"
  | "alpha"
  | "note"
  | "maj";

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
function filtreArchives(include?: boolean, statut?: SeriesStatus | ""): Filter[] {
  if (include || statut === "archive") return [];
  return [{ field: "statut", op: "neq" as const, value: "archive" }];
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
    /* Genre multiple : « a,b » = série possédant a **et** b. */
    for (const g of (f.genre ?? "").split(",").map((v) => v.trim()).filter(Boolean)) {
      filters.push({ field: "genres", op: "contains" as const, value: g });
    }
    if (f.tag) filters.push({ field: "tags", op: "contains" as const, value: f.tag });
    if (f.statut) filters.push({ field: "statut", op: "eq" as const, value: f.statut });
    if (f.type) filters.push({ field: "type", op: "eq" as const, value: f.type });
    if (f.annee) filters.push({ field: "annee", op: "eq" as const, value: f.annee });
    if (f.langue) filters.push({ field: "langue", op: "eq" as const, value: f.langue });
    /* Onglets de statut exclusifs : une publication unique appartient
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
    filters.push(...filtreArchives(f.includeArchived, f.statut));

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

    /* Tolérance aux fautes : le plein texte Appwrite est strict (mots
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

/* ── Tolérance aux fautes ─────────────────────────────────────── */

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

/* `React cache` : la fiche série appelle `getSeriesBySlug` au moins deux fois
   (`generateMetadata` + page) — sans déduplication, deux aller-retours vers le
   backend pour strictement la même ligne. La clé mémorise un booléen (React
   compare les arguments par `Object.is`, un objet ne dédoublonnerait pas). */
const serieParSlug = cache(
  async (slug: string, includeArchived: boolean): Promise<Series | null> => {
    /* Série de la graine masquée en production : `null` → vrai 404 (page fiche,
       lecteur, proxy) sans requête inutile. */
    if (serieDeDemo(slug)) return null;
    const res = await getDb().list<Series>(TABLES.series, {
      filters: [
        { field: "slug", op: "eq", value: slug },
        ...filtreArchives(includeArchived),
      ],
      limit: 1,
    });
    return res.items[0] ? mapSeries(res.items[0]) : null;
  },
);

export async function getSeriesBySlug(
  slug: string,
  opts: { includeArchived?: boolean } = {},
): Promise<Series | null> {
  return serieParSlug(slug, Boolean(opts.includeArchived));
}

export const getSeriesById = cache(async (id: string): Promise<Series | null> => {
  if (serieDeDemo(id)) return null;
  const row = await getDb().get<Series>(TABLES.series, id);
  return row ? mapSeries(row) : null;
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
      getDb().list<Series>(TABLES.series, {
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
  /* Jusqu'à 1000 lignes téléchargées par `/catalogue`, `/recherche`,
     « séries similaires » et le sitemap : 60 s de cache font disparaître un
     aller-retour lourd de toutes ces pages. Les écritures (saveSeries,
     saveChapter…) appellent déjà `invalidate("series:")`. */
  return cached(`series:tout:${opts.includeArchived ? 1 : 0}`, 60_000, async () => {
    const { items } = await getDb().list<Series>(TABLES.series, {
      filters: [...filtresSansDemo("series"), ...filtreArchives(opts.includeArchived)],
      order: { field: "titre", dir: "asc" },
      limit: 1000,
    });
    return items.map(mapSeries);
  });
}

/** « Séries similaires » : genres puis tags en commun. */
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
  // Cache court (30 s) : deux lectures réseau par affichage, et un repli sur la
  // dernière valeur connue si le VPN vers Appwrite tombe (voir `cached`).
  return cached(`series:recos:${placement}`, 30_000, async () => {
    const { items } = await getDb().list<Recommendation>(TABLES.recommendations, {
      filters: [
        { field: "placement", op: "eq", value: placement },
        { field: "actif", op: "eq", value: true },
      ],
      order: { field: "ordre", dir: "asc" },
      limit: 50,
    });
    if (items.length === 0) return [];

    /* Une série archivée ne doit plus être mise en avant : une seule requête
       pour les ids concernés, puis filtrage en mémoire (≤ 50 recommandations). */
    const archived = await getDb().list<{ id: string }>(TABLES.series, {
      filters: [{ field: "statut", op: "eq", value: "archive" }],
      limit: 1000,
    });
    const archivedIds = new Set(archived.items.map((s) => s.id));

    const now = Date.now();
    return items.filter((r) => {
      /* Recommandation éditoriale sur une série de la graine : masquée en prod. */
      if (serieDeDemo(r.series_id)) return false;
      if (archivedIds.has(r.series_id)) return false;
      if (r.debut && new Date(r.debut).getTime() > now) return false;
      if (r.fin && new Date(r.fin).getTime() < now) return false;
      return true;
    });
  });
}

/** Top séries par vues (utilisé pour la home et le dashboard). */
export async function popularSeries(limit = 10, includeAdult = false): Promise<Series[]> {
  return cached(`series:popular:${limit}:${includeAdult ? 1 : 0}`, 30_000, async () => {
    const { items } = await getDb().list<Series>(TABLES.series, {
      filters: [...filtresSansDemo("series"), ...filtreArchives()],
      order: { field: "vues", dir: "desc" },
      limit,
    });
    const rows = includeAdult ? items : items.filter((s) => s.classification !== "adult");
    return rows.map(mapSeries);
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
  const existing = await db.get<Series>(TABLES.series, id);
  /* Recherche plein texte : les colonnes array ne sont pas indexables,
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
