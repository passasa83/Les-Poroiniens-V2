import "server-only";
import { cached, getDb, invalidate, TABLES } from "@/lib/db";
import { pageUrl } from "@/lib/media";
import type { Chapter, ScanPage, Series } from "@/lib/types";

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

/** Index des pages : lu en base, jamais sur le NAS (§14.7). */
export async function getPages(chapterId: string): Promise<ScanPage[]> {
  const { items } = await getDb().list<ScanPage>(TABLES.pages, {
    filters: [{ field: "chapter_id", op: "eq", value: chapterId }],
    order: { field: "index", dir: "asc" },
    limit: 5000,
  });
  return items;
}

/** URLs de lecture (signées en production, locales en démo). */
export async function getChapterPageUrls(chapterId: string): Promise<{
  pages: { index: number; url: string; largeur: number; hauteur: number }[];
  total: number;
}> {
  const pages = await getPages(chapterId);
  return {
    total: pages.length,
    pages: pages.map((p) => ({
      index: p.index,
      url: pageUrl(p),
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
}

export async function getReaderContext(
  series: Series,
  numero: number,
): Promise<ReaderContext | null> {
  const chapter = await getChapter(series.id, numero);
  if (!chapter || chapter.statut !== "published") return null;
  const chapters = await listChapters(series.id, { publishedOnly: true });
  const ordered = [...chapters].sort((a, b) => a.numero - b.numero);
  const idx = ordered.findIndex((c) => c.id === chapter.id);
  const { pages } = await getChapterPageUrls(chapter.id);
  return {
    series,
    chapter,
    chapters: ordered,
    prev: idx > 0 ? ordered[idx - 1] : null,
    next: idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null,
    pages,
  };
}

export async function recentChapters(limit = 12): Promise<Array<Chapter & { series: Series }>> {
  return cached(`recent-chapters:${limit}`, 60_000, async () => {
    const { items } = await getDb().list<Chapter>(TABLES.chapters, {
      filters: [{ field: "statut", op: "eq", value: "published" }],
      order: { field: "publish_at", dir: "desc" },
      limit,
    });
    const out: Array<Chapter & { series: Series }> = [];
    for (const chapter of items) {
      const series = await getDb().get<Series>(TABLES.series, chapter.series_id);
      if (series) out.push({ ...chapter, series });
    }
    return out;
  });
}

export async function saveChapter(chapter: Partial<Chapter> & { id: string }): Promise<Chapter> {
  const db = getDb();
  const { id, ...data } = chapter;
  const existing = await db.get<Chapter>(TABLES.chapters, id);
  const updated = existing
    ? await db.update<Chapter>(TABLES.chapters, id, data as Record<string, unknown>)
    : await db.create<Chapter>(TABLES.chapters, id, {
        created_at: new Date().toISOString(),
        ...(data as Record<string, unknown>),
      });
  invalidate("recent-chapters:");
  invalidate("series:");
  return updated;
}

export async function recordView(chapter: Chapter): Promise<void> {
  await getDb().update(TABLES.chapters, chapter.id, { vues: chapter.vues + 1 });
}
