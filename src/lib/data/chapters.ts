import "server-only";
import { getDb, listAll, parLots, TABLES, type TableFilter } from "@/server/db";
import { purgeImageErrors } from "@/lib/data/image-errors";
import { cached, invalidate } from "@/server/cache";
import { filtresSansDemo, serieDeDemo } from "@/lib/demo-gate";
import { demoLnContent } from "@/server/db/demo-content";
import { imageEnv, pageUrl } from "@/lib/media";
import { isSafePath } from "@/lib/nas";
import { seriesParIds } from "@/lib/data/series";
import type { Chapter, ScanPage, Series, SeriesType } from "@/lib/types";

/** Liste des chapitres d'une série : 1 min en cache. */
const CHAPTERS_TTL = 60_000;
/** Index des pages (URLs publiques versionnées) : 5 min en cache. */
const PAGES_TTL = 5 * 60_000;

/**
 * Invalide les listes de chapitres (d'une série, ou de toutes) et l'index des
 * pages d'un chapitre. À appeler après toute écriture de `chapters` / `pages`.
 */
export function invalidateChapters(opts: { seriesId?: string; chapterId?: string } = {}): void {
  invalidate(opts.seriesId ? `chapters:${opts.seriesId}:` : "chapters:");
  invalidate(opts.chapterId ? `pages:${opts.chapterId}:` : "pages:");
  invalidate("chapter-pages:");
}

export async function listChapters(
  seriesId: string,
  opts: { publishedOnly?: boolean; limit?: number } = {},
): Promise<Chapter[]> {
  const limit = opts.limit ?? 500;
  const portee = opts.publishedOnly ? "pub" : "all";
  return cached(`chapters:${seriesId}:${portee}:${limit}`, CHAPTERS_TTL, async () => {
    const { items } = await getDb().list(TABLES.chapters, {
      filters: [
        { field: "series_id", op: "eq", value: seriesId },
        ...(opts.publishedOnly
          ? [{ field: "statut", op: "eq", value: "published" } satisfies TableFilter<"chapters">]
          : []),
      ],
      order: { field: "numero", dir: "desc" },
      limit,
    });
    return items;
  });
}

/** Lecture directe, sans cache (contrôle d'existence du proxy, écritures). */
export async function getChapter(seriesId: string, numero: number): Promise<Chapter | null> {
  const { items } = await getDb().list(TABLES.chapters, {
    filters: [
      { field: "series_id", op: "eq", value: seriesId },
      { field: "numero", op: "eq", value: numero },
    ],
    limit: 1,
  });
  return items[0] ?? null;
}

export async function getChapterById(id: string): Promise<Chapter | null> {
  return getDb().get(TABLES.chapters, id);
}

/** Découpe en lots de 50 identifiants (filtre `in` gardé loin des limites d'URL). */
function lots(ids: readonly string[]): string[][] {
  const uniques = [...new Set(ids)].filter(Boolean);
  const sortie: string[][] = [];
  for (let i = 0; i < uniques.length; i += 50) sortie.push(uniques.slice(i, i + 50));
  return sortie;
}

/** Plusieurs chapitres par identifiant, lots en parallèle (remède aux N+1). */
export async function chaptersParIds(ids: readonly string[]): Promise<Map<string, Chapter>> {
  const resultats = await Promise.all(
    lots(ids).map((lot) =>
      getDb().list(TABLES.chapters, {
        filters: [{ field: "id", op: "in", value: lot }],
        limit: lot.length,
      }),
    ),
  );
  return new Map(resultats.flatMap((r) => r.items).map((c) => [c.id, c]));
}

export type ChapitrePublie = Pick<
  Chapter,
  "id" | "series_id" | "numero" | "publish_at" | "created_at"
>;

/**
 * Chapitres publiés de plusieurs séries, colonnes utiles seulement, groupés
 * par série : une requête par lot de 50 séries au lieu d'une par série.
 */
export async function publishedChaptersOf(
  seriesIds: readonly string[],
): Promise<Map<string, ChapitrePublie[]>> {
  const resultats = await Promise.all(
    lots(seriesIds).map((lot) =>
      listAll(TABLES.chapters, {
        filters: [
          { field: "series_id", op: "in", value: lot },
          { field: "statut", op: "eq", value: "published" },
        ],
        select: ["series_id", "numero", "publish_at", "created_at"],
      }),
    ),
  );
  const parSerie = new Map<string, ChapitrePublie[]>();
  for (const c of resultats.flat()) {
    const liste = parSerie.get(c.series_id) ?? [];
    liste.push(c);
    parSerie.set(c.series_id, liste);
  }
  return parSerie;
}

/**
 * Supprime un chapitre et ce qui en dépend (index des pages, erreurs
 * d'images). Toutes les pages sont lues, sans plafond, et supprimées 10 par
 * 10 : avant, une boucle séquentielle plafonnée à 5000 lignes laissait des
 * pages orphelines et dépassait le délai d'une fonction pour un gros tome.
 * Renvoie le nombre de pages supprimées. Le compteur de la série et le
 * cache restent à la charge de l'appelant.
 */
export async function deleteChapterCascade(chapterId: string): Promise<number> {
  const db = getDb();
  const pages = await listAll(TABLES.pages, {
    filters: [{ field: "chapter_id", op: "eq", value: chapterId }],
    select: ["chapter_id"],
  });
  await parLots(pages, (page) => db.remove(TABLES.pages, page.id));
  await db.remove(TABLES.chapters, chapterId);
  await purgeImageErrors(chapterId);
  return pages.length;
}

/** Index des pages : lu en base, jamais sur le NAS. */
export async function getPages(chapterId: string): Promise<ScanPage[]> {
  const { items } = await getDb().list(TABLES.pages, {
    filters: [{ field: "chapter_id", op: "eq", value: chapterId }],
    order: { field: "index", dir: "asc" },
    limit: 5000,
  });
  return items;
}

/** URLs de lecture : publiques et versionnées en lecture normale, signées à
 * durée courte pour un brouillon prévisualisé par le Gérant. */
export async function getChapterPageUrls(
  chapterId: string,
  opts: { signed?: boolean } = {},
): Promise<{
  pages: { index: number; url: string; largeur: number; hauteur: number }[];
  total: number;
}> {
  // Les URLs signées (aperçu d'un brouillon) expirent : jamais mises en cache.
  const pages = opts.signed
    ? await getPages(chapterId)
    : await cached(`pages:${chapterId}:`, PAGES_TTL, () => getPages(chapterId));
  return {
    total: pages.length,
    pages: pages.map((p) => ({
      index: p.index,
      url: pageUrl(p, { signed: opts.signed }),
      largeur: p.largeur,
      hauteur: p.hauteur,
    })),
  };
}

export interface ReaderContext {
  series: Series;
  chapter: Chapter;
  chapters: Chapter[];
  prev: Chapter | null;
  next: Chapter | null;
  pages: { index: number; url: string; largeur: number; hauteur: number }[];
  /** Light novel : paragraphes du chapitre (null pour les séries image). */
  contenu: string[] | null;
  /** vrai quand le chapitre n'est pas publié (aperçu Gérant, URLs signées). */
  preview: boolean;
}

/** Encodage par segment : les chemins NAS portent espaces et accents. */
function encodeRel(rel: string): string {
  return rel
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

/** Découpe d'un fichier texte brut en paragraphes (sauts de lignes doubles). */
export function decouperParagraphes(texte: string): string[] {
  return texte
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Garde-fou : un chapitre texte reste un contenu de lecture, pas un fichier. */
const LN_MAX_CHARS = 2_000_000;

/**
 * Chemin NAS du fichier texte d'un chapitre light novel : `<Série>/Chapitre 3.txt`
 * (mêmes conventions de dossier que les dépôts d'images importés).
 */
export function lnContentPath(series: Series, numero: number): string {
  return `${series.titre}/Chapitre ${numero}.txt`;
}

/**
 * Texte brut d'un chapitre light novel (lecture **et** éditeur du Gérant :
 * la découpe en paragraphes reste réservée à l'affichage).
 * Chemin de démo accepté (`/api/…`) : servi par la graine, sans HTTP.
 */
export async function fetchChapterRawText(chapter: Chapter): Promise<string | null> {
  const chemin = (chapter.contenu_chemin ?? "").trim();
  if (!chemin) return null;
  if (chemin.startsWith("/")) return (demoLnContent(chemin) ?? []).join("\n\n");
  if (!isSafePath(chemin)) return null;

  try {
    const texte = await cached(`ln:${chapter.id}:${chemin}`, 5 * 60_000, async () => {
      const { imgBase } = imageEnv();
      if (!imgBase) return "";
      const res = await fetch(`${imgBase}/${encodeRel(chemin)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return "";
      return (await res.text()).slice(0, LN_MAX_CHARS);
    });
    return texte || null;
  } catch {
    return null;
  }
}

/** Purge du texte en cache après une écriture (éditeur → relecture immédiate). */
export function invalidateChapterContent(chapterId: string): void {
  invalidate(`ln:${chapterId}`);
}

/**
 * Contenu d'un chapitre light novel : le `.txt` du NAS lu **côté serveur**
 * (le navigateur n'atteint jamais le CDN) puis découpé en paragraphes.
 */
export async function getChapterContent(chapter: Chapter): Promise<string[] | null> {
  const texte = await fetchChapterRawText(chapter);
  if (!texte) return null;
  return decouperParagraphes(texte);
}

/**
 * Contexte du lecteur. `allowDraft` est réservé au Gérant : le chapitre
 * s'affiche alors avec des URLs signées à 10 minutes.
 */
export async function getReaderContext(
  series: Series,
  numero: number,
  opts: { allowDraft?: boolean } = {},
): Promise<ReaderContext | null> {
  /* Série de la graine masquée en production : jamais de contexte de lecture
     (la page appelante déclenche `notFound()` → vrai 404). */
  if (serieDeDemo(series.id)) return null;
  /* Une seule liste (en cache) donne le chapitre et ses voisins : sans
     brouillon autorisé, un chapitre non publié en est absent → null. */
  const chapters = await listChapters(series.id, opts.allowDraft ? {} : { publishedOnly: true });
  const ordered = [...chapters].sort((a, b) => a.numero - b.numero);
  const idx = ordered.findIndex((c) => c.numero === numero);
  const chapter = ordered[idx];
  if (!chapter) return null;
  const preview = chapter.statut !== "published";

  const [{ pages }, contenu] = await Promise.all([
    getChapterPageUrls(chapter.id, { signed: preview }),
    series.type === "light_novel" || chapter.contenu_chemin
      ? getChapterContent(chapter)
      : Promise.resolve(null),
  ]);
  return {
    series,
    chapter,
    chapters: ordered,
    prev: idx > 0 ? ordered[idx - 1] : null,
    next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null,
    pages,
    contenu,
    preview,
  };
}

/** Numéro du premier chapitre publié de chaque série (héros de l'accueil). */
export async function firstChapterNumbers(seriesIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (seriesIds.length === 0) return out;

  await Promise.all(
    seriesIds.map(async (id) => {
      const { items } = await getDb().list(TABLES.chapters, {
        filters: [
          { field: "series_id", op: "eq", value: id },
          { field: "statut", op: "eq", value: "published" },
        ],
        order: { field: "numero", dir: "asc" },
        limit: 1,
      });
      if (items[0]) out.set(id, items[0].numero);
    }),
  );
  return out;
}

export interface ReleaseItem extends Chapter {
  series: Series;
}

/**
 * « Nouveautés » : chapitres publiés sur les `days` derniers jours
 * (7 au maximum), du plus récent au plus ancien, avec leur série.
 * Le découpage « Dernières 24 h / Hier / … » est calculé ensuite côté page.
 */
export async function listUpdates(
  opts: {
    days?: number;
    type?: SeriesType | "";
    includeAdult?: boolean;
    limit?: number;
  } = {},
): Promise<ReleaseItem[]> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 7);
  const limit = Math.min(Math.max(opts.limit ?? 300, 1), 400);
  const key = `updates:${days}:${opts.type ?? "all"}:${opts.includeAdult ? "adult" : "safe"}`;

  return cached(key, 60_000, async () => {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const filters: TableFilter<"chapters">[] = [
      { field: "statut", op: "eq", value: "published" },
      { field: "publish_at", op: "gte" as const, value: since },
      ...(!opts.includeAdult
        ? [{ field: "classification" as const, op: "eq" as const, value: "all" }]
        : []),
      ...(opts.type
        ? [{ field: "series_type" as const, op: "eq" as const, value: opts.type }]
        : []),
      /* Chapitres de la graine écartés dans la requête : les tranches
         « Dernières 24 h / Hier » ne montrent plus le jeu de démonstration. */
      ...filtresSansDemo("chapters"),
    ];

    const { items } = await getDb().list(TABLES.chapters, {
      filters,
      order: { field: "publish_at", dir: "desc" },
      limit,
    });

    /* Un seul lot de séries pour les jusqu'à 400 chapitres (au lieu d'un
       aller-retour par chapitre). */
    if (items.length === 0) return [];
    const seriesMap = await seriesParIds(items.map((c) => c.series_id));
    const now = Date.now();
    const out: ReleaseItem[] = [];
    for (const chapter of items) {
      const publishAt = chapter.publish_at ? Date.parse(chapter.publish_at) : NaN;
      if (Number.isNaN(publishAt) || publishAt > now) continue; // planifié / horodatage absurde
      const series = seriesMap.get(chapter.series_id);
      if (
        series &&
        series.statut !== "archive" &&
        (opts.includeAdult || series.classification !== "adult")
      ) {
        out.push({ ...chapter, series });
      }
    }
    return out;
  });
}

/** Dernier chapitre publié d'une série (carte héros des nouveautés). */
export async function latestPublishedChapter(seriesId: string): Promise<Chapter | null> {
  const { items } = await getDb().list(TABLES.chapters, {
    filters: [
      { field: "series_id", op: "eq", value: seriesId },
      { field: "statut", op: "eq", value: "published" },
    ],
    order: { field: "publish_at", dir: "desc" },
    limit: 1,
  });
  return items[0] ?? null;
}

/**
 * Requête commune des sorties : **1 liste + 1 lot de séries = 2 RTT**.
 * L'ancienne version faisait un `get(Series)` par chapitre — 12 à 240
 * aller-retours séquentiels vers le backend distant.
 */
async function queryReleases(
  opts: { type?: SeriesType | ""; includeAdult?: boolean },
  limit: number,
  offset: number,
): Promise<{ items: ReleaseItem[]; total: number }> {
  const filters: TableFilter<"chapters">[] = [
    { field: "statut", op: "eq", value: "published" },
    ...(!opts.includeAdult
      ? [{ field: "classification" as const, op: "eq" as const, value: "all" }]
      : []),
    ...(opts.type ? [{ field: "series_type" as const, op: "eq" as const, value: opts.type }] : []),
    /* Exclusion dans la requête : `total` (« Charger plus ») doit
       correspondre aux lignes réellement servies. */
    ...filtresSansDemo("chapters"),
  ];

  const { items, total } = await getDb().list(TABLES.chapters, {
    filters,
    order: { field: "publish_at", dir: "desc" },
    limit,
    offset,
  });
  if (items.length === 0) return { items: [], total };

  const seriesMap = await seriesParIds(items.map((c) => c.series_id));
  const out: ReleaseItem[] = [];
  for (const chapter of items) {
    const series = seriesMap.get(chapter.series_id);
    // Série archivée : sortie retirée du catalogue public.
    if (series && series.statut !== "archive") out.push({ ...chapter, series });
  }
  return { items: out, total };
}

/**
 * « Dernières sorties » : chapitres publiés les plus récents, avec leur
 * série, filtrables par format (manga / manhwa / manhua) via la colonne
 * dénormalisée `series_type`, paginés côté serveur.
 */
export async function listRecentReleases(
  opts: {
    type?: SeriesType | "";
    page?: number;
    perPage?: number;
    includeAdult?: boolean;
  } = {},
): Promise<{ items: ReleaseItem[]; total: number; page: number; perPage: number }> {
  const perPage = Math.min(Math.max(opts.perPage ?? 12, 1), 48);
  const page = Math.max(opts.page ?? 1, 1);
  const key = `releases:${opts.type ?? "all"}:${page}:${perPage}:${opts.includeAdult ? "adult" : "safe"}`;

  return cached(key, 60_000, async () => {
    const { items, total } = await queryReleases(opts, perPage, (page - 1) * perPage);
    return { items, total, page, perPage };
  });
}

/**
 * « Dernières sorties » groupées par œuvre (décision client) : **une
 * seule carte par série**, contenant ses derniers chapitres (MANGA Plus) —
 * même avec plusieurs sorties du jour. La série apparaît une fois, ordonnée
 * sur son chapitre le plus récent (ordre antéchronologique conservé).
 * `/nouveautes` garde son détail jour par jour (non regroupé).
 */
export async function listRecentReleasesGrouped(
  opts: {
    type?: SeriesType | "";
    /** Séries par page d'accueil (défaut 12). */
    series?: number;
    /** Chapitres conservés par série (défaut 3). */
    perSeries?: number;
    includeAdult?: boolean;
  } = {},
): Promise<{ items: ReleaseItem[]; seriesCount: number; totalChapters: number }> {
  const maxSeries = Math.min(Math.max(opts.series ?? 12, 1), 48);
  const perSeries = Math.min(Math.max(opts.perSeries ?? 3, 1), 10);
  /* Clé sous le préfixe `releases:` : `saveChapter` l'invalide déjà. */
  const key = `releases:groupes:${opts.type ?? "all"}:${maxSeries}:${perSeries}:${opts.includeAdult ? "adult" : "safe"}`;

  return cached(key, 60_000, async () => {
    /* Une seule liste couvrant les 5 anciennes pages de 48 chapitres, puis
       un lot de séries : **2 requêtes** au lieu de 5 listes et ~240 `get`
       séquentiels — le plus gros poste de l'accueil à froid. */
    const limite = Math.min(Math.max(maxSeries * perSeries * 4, 48), 240);
    const { items: lot, total } = await queryReleases(opts, limite, 0);

    const items: ReleaseItem[] = [];
    const parSerie = new Map<string, number>();
    for (const ch of lot) {
      const pris = parSerie.get(ch.series_id) ?? 0;
      if (pris >= perSeries) continue;
      if (!parSerie.has(ch.series_id) && parSerie.size >= maxSeries) continue;
      parSerie.set(ch.series_id, pris + 1);
      items.push(ch);
    }
    return { items, seriesCount: parSerie.size, totalChapters: total };
  });
}

export async function saveChapter(chapter: Partial<Chapter> & { id: string }): Promise<Chapter> {
  const db = getDb();
  const { id, ...data } = chapter;
  const existing = await db.get(TABLES.chapters, id);

  /* Format d'origine dénormalisé (Appwrite n'opère pas de jointure) : renseigné
     à l'écriture, et complété à la volée sur une ligne héritée qui en manque. */
  if (data.series_type === undefined) {
    const reused =
      existing &&
      existing.series_type &&
      (!data.series_id || data.series_id === existing.series_id);
    if (reused) {
      data.series_type = existing.series_type;
    } else {
      const seriesId = data.series_id ?? existing?.series_id;
      const series = seriesId ? await db.get(TABLES.series, seriesId) : null;
      if (series) data.series_type = series.type;
    }
  }

  const updated = existing
    ? await db.update(TABLES.chapters, id, data)
    : await db.create(TABLES.chapters, id, { created_at: new Date().toISOString(), ...data });
  invalidateChapters({ chapterId: id });
  invalidate("recent-chapters:");
  invalidate("releases:");
  invalidate("updates:");
  invalidate("series:");

  /* Compteur dénormalisé de la série (« One-shot ») : recalculé au vol —
     et non incrémenté — pour ne jamais dériver d'une écriture ratée. */
  const movedSeries = data.series_id !== undefined && data.series_id !== existing?.series_id;
  if (!existing || movedSeries) {
    await refreshSeriesChapterCount(updated.series_id);
    if (movedSeries && existing?.series_id) await refreshSeriesChapterCount(existing.series_id);
  }
  return updated;
}

/**
 * Recalcule `series.nb_chapitres` (colonne dénormalisée). Le compteur
 * alimente le filtre « One-shot » : recalcé sur un échantillon limité, il
 * complète à la volée une ligne héritée qui en manque (graines anciennes).
 */
export async function refreshSeriesChapterCount(seriesId?: string | null): Promise<void> {
  if (!seriesId) return;
  try {
    const db = getDb();
    const { total } = await db.list(TABLES.chapters, {
      filters: [{ field: "series_id", op: "eq", value: seriesId }],
      limit: 1,
    });
    await db.update(TABLES.series, seriesId, { nb_chapitres: total });
    invalidate("series:");
    invalidateChapters({ seriesId });
  } catch {
    /* un souci de compteur ne doit pas faire échouer une écriture de chapitre. */
  }
}

/**
 * +1 vue. Le compteur est relu en base (le chapitre affiché peut venir du
 * cache) : à appeler hors du rendu, via `after()`.
 */
export async function recordView(chapter: Chapter): Promise<void> {
  const db = getDb();
  const fresh = await db.get(TABLES.chapters, chapter.id);
  if (fresh) await db.update(TABLES.chapters, chapter.id, { vues: (fresh.vues ?? 0) + 1 });
}
