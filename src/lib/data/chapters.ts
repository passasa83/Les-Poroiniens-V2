import "server-only";
import { cached, getDb, invalidate, TABLES } from "@/lib/db";
import { filtresSansDemo, serieDeDemo } from "@/lib/demo-gate";
import { pageUrl } from "@/lib/media";
import { mapSeries } from "@/lib/data/series";
import type { Chapter, ScanPage, Series, SeriesType } from "@/lib/types";

export async function listChapters(
  seriesId: string,
  opts: { publishedOnly?: boolean; limit?: number } = {},
): Promise<Chapter[]> {
  const { items } = await getDb().list<Chapter>(TABLES.chapters, {
    filters: [
      { field: "series_id", op: "eq", value: seriesId },
      ...(opts.publishedOnly
        ? [{ field: "statut", op: "eq" as const, value: "published" }]
        : []),
    ],
    order: { field: "numero", dir: "desc" },
    limit: opts.limit ?? 500,
  });
  return items;
}

export async function getChapter(seriesId: string, numero: number): Promise<Chapter | null> {
  const { items } = await getDb().list<Chapter>(TABLES.chapters, {
    filters: [
      { field: "series_id", op: "eq", value: seriesId },
      { field: "numero", op: "eq", value: numero },
    ],
    limit: 1,
  });
  return items[0] ?? null;
}

export async function getChapterById(id: string): Promise<Chapter | null> {
  return getDb().get<Chapter>(TABLES.chapters, id);
}

/** Index des pages : lu en base, jamais sur le NAS. */
export async function getPages(chapterId: string): Promise<ScanPage[]> {
  const { items } = await getDb().list<ScanPage>(TABLES.pages, {
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
  const pages = await getPages(chapterId);
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
  /** vrai quand le chapitre n'est pas publié (aperçu Gérant, URLs signées). */
  preview: boolean;
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
  const chapter = await getChapter(series.id, numero);
  if (!chapter) return null;
  const preview = chapter.statut !== "published";
  if (preview && !opts.allowDraft) return null;

  const chapters = await listChapters(series.id, opts.allowDraft ? {} : { publishedOnly: true });
  const ordered = [...chapters].sort((a, b) => a.numero - b.numero);
  const idx = ordered.findIndex((c) => c.id === chapter.id);
  const { pages } = await getChapterPageUrls(chapter.id, { signed: preview });
  return {
    series,
    chapter,
    chapters: ordered,
    prev: idx > 0 ? ordered[idx - 1] : null,
    next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null,
    pages,
    preview,
  };
}

export async function recentChapters(limit = 12): Promise<Array<Chapter & { series: Series }>> {
  return cached(`recent-chapters:${limit}`, 60_000, async () => {
    const { items } = await getDb().list<Chapter>(TABLES.chapters, {
      filters: [
        { field: "statut", op: "eq", value: "published" },
        /* Chapitres de la graine écartés dans la requête : le bandeau garde
           ses `limit` entrées en production. */
        ...filtresSansDemo("chapters"),
      ],
      order: { field: "publish_at", dir: "desc" },
      limit,
    });
    const out: Array<Chapter & { series: Series }> = [];
    for (const chapter of items) {
      const series = await getDb().get<Series>(TABLES.series, chapter.series_id);
      // Une série archivée ne génère plus aucune sortie publique.
      if (series && series.statut !== "archive") out.push({ ...chapter, series: mapSeries(series) });
    }
    return out;
  });
}

/** Numéro du premier chapitre publié de chaque série (héros de l'accueil). */
export async function firstChapterNumbers(seriesIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (seriesIds.length === 0) return out;

  await Promise.all(
    seriesIds.map(async (id) => {
      const { items } = await getDb().list<Chapter>(TABLES.chapters, {
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
    const filters = [
      { field: "statut", op: "eq" as const, value: "published" },
      { field: "publish_at", op: "gte" as const, value: since },
      ...(!opts.includeAdult
        ? [{ field: "classification", op: "eq" as const, value: "all" }]
        : []),
      ...(opts.type ? [{ field: "series_type", op: "eq" as const, value: opts.type }] : []),
      /* Chapitres de la graine écartés dans la requête : les tranches
         « Dernières 24 h / Hier » ne montrent plus le jeu de démonstration. */
      ...filtresSansDemo("chapters"),
    ];

    const { items } = await getDb().list<Chapter>(TABLES.chapters, {
      filters,
      order: { field: "publish_at", dir: "desc" },
      limit,
    });

    const now = Date.now();
    const out: ReleaseItem[] = [];
    for (const chapter of items) {
      const publishAt = chapter.publish_at ? Date.parse(chapter.publish_at) : NaN;
      if (Number.isNaN(publishAt) || publishAt > now) continue; // planifié / horodatage absurde
      const series = await getDb().get<Series>(TABLES.series, chapter.series_id);
      if (
        series &&
        series.statut !== "archive" &&
        (opts.includeAdult || series.classification !== "adult")
      ) {
        out.push({ ...chapter, series: mapSeries(series) });
      }
    }
    return out;
  });
}

/** Dernier chapitre publié d'une série (carte héros des nouveautés). */
export async function latestPublishedChapter(seriesId: string): Promise<Chapter | null> {
  const { items } = await getDb().list<Chapter>(TABLES.chapters, {
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
    const filters = [
      { field: "statut", op: "eq" as const, value: "published" },
      ...(!opts.includeAdult
        ? [{ field: "classification", op: "eq" as const, value: "all" }]
        : []),
      ...(opts.type ? [{ field: "series_type", op: "eq" as const, value: opts.type }] : []),
      /* Exclusion dans la requête : `total` (« Charger plus ») doit
         correspondre aux lignes réellement servies. */
      ...filtresSansDemo("chapters"),
    ];

    const { items, total } = await getDb().list<Chapter>(TABLES.chapters, {
      filters,
      order: { field: "publish_at", dir: "desc" },
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    const out: ReleaseItem[] = [];
    for (const chapter of items) {
      const series = await getDb().get<Series>(TABLES.series, chapter.series_id);
      // Série archivée : sortie retirée du catalogue public.
      if (series && series.statut !== "archive") out.push({ ...chapter, series: mapSeries(series) });
    }
    return { items: out, total, page, perPage };
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

  const items: ReleaseItem[] = [];
  const parSerie = new Map<string, number>();
  let totalChapters = 0;
  // Assez de chapitres pour remplir les séries (12 × 3 + marge), page par page.
  for (let page = 1; page <= 5; page++) {
    const { items: lot, total } = await listRecentReleases({
      type: opts.type,
      page,
      perPage: 48,
      includeAdult: opts.includeAdult,
    });
    totalChapters = total;
    if (lot.length === 0) break;
    for (const ch of lot) {
      const pris = parSerie.get(ch.series_id) ?? 0;
      if (pris >= perSeries) continue;
      if (!parSerie.has(ch.series_id) && parSerie.size >= maxSeries) continue;
      parSerie.set(ch.series_id, pris + 1);
      items.push(ch);
    }
    if (parSerie.size >= maxSeries) break;
  }
  return { items, seriesCount: parSerie.size, totalChapters };
}

export async function saveChapter(chapter: Partial<Chapter> & { id: string }): Promise<Chapter> {
  const db = getDb();
  const { id, ...data } = chapter;
  const existing = await db.get<Chapter>(TABLES.chapters, id);

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
      const series = seriesId ? await db.get<Series>(TABLES.series, seriesId) : null;
      if (series) data.series_type = series.type;
    }
  }

  const updated = existing
    ? await db.update<Chapter>(TABLES.chapters, id, data as Record<string, unknown>)
    : await db.create<Chapter>(TABLES.chapters, id, {
        created_at: new Date().toISOString(),
        ...(data as Record<string, unknown>),
      });
  invalidate("recent-chapters:");
  invalidate("releases:");
  invalidate("updates:");
  invalidate("series:");

  /* Compteur dénormalisé de la série (« One-shot ») : recalculé au vol —
     et non incrémenté — pour ne jamais dériver d'une écriture ratée. */
  const movedSeries =
    data.series_id !== undefined && data.series_id !== existing?.series_id;
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
  } catch {
    /* un souci de compteur ne doit pas faire échouer une écriture de chapitre. */
  }
}

export async function recordView(chapter: Chapter): Promise<void> {
  await getDb().update(TABLES.chapters, chapter.id, { vues: chapter.vues + 1 });
}
