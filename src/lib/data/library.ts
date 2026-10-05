import "server-only";
import { getDb, rowId, TABLES } from "@/lib/db";
import { getChapterById, listChapters } from "@/lib/data/chapters";
import { mapSeries } from "@/lib/data/series";
import type { HistoryEntry, LibraryEntry, LibraryStatus, Series } from "@/lib/types";

export async function listLibrary(userId: string): Promise<LibraryEntry[]> {
  const { items } = await getDb().list<LibraryEntry>(TABLES.library, {
    filters: [{ field: "user_id", op: "eq", value: userId }],
    order: { field: "updated_at", dir: "desc" },
    limit: 1000,
  });
  return items;
}

export async function getLibraryEntry(
  userId: string,
  seriesId: string,
): Promise<LibraryEntry | null> {
  const { items } = await getDb().list<LibraryEntry>(TABLES.library, {
    filters: [
      { field: "user_id", op: "eq", value: userId },
      { field: "series_id", op: "eq", value: seriesId },
    ],
    limit: 1,
  });
  return items[0] ?? null;
}

export async function upsertLibraryEntry(
  userId: string,
  seriesId: string,
  patch: Partial<Omit<LibraryEntry, "user_id" | "series_id">>,
): Promise<LibraryEntry> {
  const db = getDb();
  const existing = await getLibraryEntry(userId, seriesId);
  const base: LibraryEntry = {
    user_id: userId,
    series_id: seriesId,
    statut: "en_cours" as LibraryStatus,
    favori: false,
    note: null,
    last_chapter_id: null,
    last_page: 0,
    updated_at: new Date().toISOString(),
  };
  const next = {
    ...base,
    ...(existing ?? {}),
    ...patch,
    user_id: userId,
    series_id: seriesId,
    updated_at: new Date().toISOString(),
  };
  const id = rowId(userId, seriesId);
  if (existing) {
    await db.update<LibraryEntry>(TABLES.library, id, next as unknown as Record<string, unknown>);
  } else {
    await db.create<LibraryEntry>(TABLES.library, id, next as unknown as Record<string, unknown>);
  }
  return next;
}

export async function removeLibraryEntry(userId: string, seriesId: string): Promise<void> {
  await getDb().remove(TABLES.library, rowId(userId, seriesId));
}

/* ── Historique de lecture ───────────────────────────────────────────── */

export async function listHistory(userId: string, limit = 100): Promise<HistoryEntry[]> {
  const { items } = await getDb().list<HistoryEntry>(TABLES.history, {
    filters: [{ field: "user_id", op: "eq", value: userId }],
    order: { field: "read_at", dir: "desc" },
    limit,
  });
  return items;
}

export async function recordProgress(input: {
  userId: string;
  chapterId: string;
  seriesId: string;
  page: number;
  completed?: boolean;
}): Promise<void> {
  const db = getDb();
  const id = rowId(input.userId, input.chapterId);
  const entry: HistoryEntry = {
    user_id: input.userId,
    chapter_id: input.chapterId,
    series_id: input.seriesId,
    page: input.page,
    completed: Boolean(input.completed),
    read_at: new Date().toISOString(),
  };
  const existing = await db.get<HistoryEntry>(TABLES.history, id);
  if (existing) {
    await db.update<HistoryEntry>(TABLES.history, id, entry as unknown as Record<string, unknown>);
  } else {
    await db.create<HistoryEntry>(TABLES.history, id, entry as unknown as Record<string, unknown>);
  }
  if (input.page > 0 || input.completed) {
    await upsertLibraryEntry(input.userId, input.seriesId, {
      last_chapter_id: input.chapterId,
      last_page: input.page,
      statut: "en_cours",
    });
  }
}

export async function clearHistory(userId: string): Promise<void> {
  const entries = await listHistory(userId, 1000);
  for (const e of entries) {
    await getDb().remove(TABLES.history, rowId(userId, e.chapter_id));
  }
}

/* ── Statistiques lecteur (§7.4) ─────────────────────────────────────── */

export interface UserStats {
  chapitres_lus: number;
  pages_lues: number;
  minutes_estimes: number;
  series_terminees: number;
  series_suivies: number;
  serie_preferee: string | null;
  jours_consecutifs: number;
  par_jour: Array<{ date: string; pages: number; chapitres: number }>;
}

export async function computeStats(
  userId: string,
): Promise<UserStats> {
  const [history, library] = await Promise.all([
    listHistory(userId, 1000),
    listLibrary(userId),
  ]);
  const chapitres = history.length;
  const pages = history.reduce((sum, h) => sum + Math.max(h.page, 0), 0);

  const byDay = new Map<string, { pages: number; chapitres: number }>();
  for (const h of history) {
    const date = h.read_at.slice(0, 10);
    const bucket = byDay.get(date) ?? { pages: 0, chapitres: 0 };
    bucket.pages += Math.max(h.page, 0);
    bucket.chapitres += 1;
    byDay.set(date, bucket);
  }
  const par_jour = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));

  // série de jours consécutifs
  let jours = 0;
  if (par_jour.length > 0) {
    let cursor = new Date(par_jour[par_jour.length - 1].date);
    for (let i = par_jour.length - 1; i >= 0; i--) {
      const expected = cursor.toISOString().slice(0, 10);
      if (par_jour[i].date !== expected) break;
      jours += 1;
      cursor = new Date(cursor.getTime() - 86_400_000);
    }
  }

  const countBySeries = new Map<string, number>();
  for (const h of history) {
    countBySeries.set(h.series_id, (countBySeries.get(h.series_id) ?? 0) + 1);
  }
  let seriePreferee: string | null = null;
  let best = 0;
  for (const [id, count] of countBySeries) {
    if (count > best) {
      best = count;
      seriePreferee = id;
    }
  }

  return {
    chapitres_lus: chapitres,
    pages_lues: pages,
    minutes_estimes: Math.round(pages * 0.6),
    series_terminees: library.filter((l) => l.statut === "termine").length,
    series_suivies: library.length,
    serie_preferee: seriePreferee,
    jours_consecutifs: jours,
    par_jour,
  };
}

/** Bibliothèque enrichie des fiches séries (page /bibliotheque). */
export async function libraryWithSeries(
  userId: string,
): Promise<Array<LibraryEntry & { series: Series | null }>> {
  const entries = await listLibrary(userId);
  const out: Array<LibraryEntry & { series: Series | null }> = [];
  for (const entry of entries) {
    const row = await getDb().get<Series>(TABLES.series, entry.series_id);
    out.push({ ...entry, series: row ? mapSeries(row) : null });
  }
  return out;
}

/* ── Tableau de bord de la bibliothèque (§6.7) ───────────────────────────── */

export interface LibraryDashboardRow {
  entry: LibraryEntry;
  series: Series | null;
  /** Chapitres publiés de la série. */
  totalChapitres: number;
  /** Premier numéro publié (cible du bouton « Lire » d'une série commencée à rien). */
  premierNumero: number | null;
  /** Dernier chapitre atteint et page : même reprise que la fiche (§6.5). */
  reprise: { numero: number; page: number } | null;
  /** Date ISO de la dernière lecture, `null` si la série n'a jamais été ouverte. */
  derniereLecture: string | null;
  /** Publication la plus récente de la série → tri « nouveautés » (§6.7). */
  derniereSortie: string | null;
  /** Chapitres parus après la dernière lecture → badge « +N non lus ». */
  nonLus: number;
  /** Progression en pourcentage (0 à 100), arrondie à l'unité. */
  progression: number;
}

/**
 * Ligne de la bibliothèque enrichie pour la page §6.7 : progression, dernier
 * chapitre lu et chapitres non lus.
 *
 * Lecture séquentielle assumée (le lecteur reprend toujours sur le dernier
 * chapitre atteint) : la progression suit le numéro de reprise et les
 * chapitres parus ensuite constituent les non-lus. Aucune écriture.
 */
export async function libraryDashboard(userId: string): Promise<LibraryDashboardRow[]> {
  const [entries, history] = await Promise.all([listLibrary(userId), listHistory(userId, 1000)]);

  // Dernière lecture par série (le plus récent `read_at` l'emporte).
  const dernieresLectures = new Map<string, HistoryEntry>();
  for (const h of history) {
    const courante = dernieresLectures.get(h.series_id);
    if (!courante || h.read_at > courante.read_at) dernieresLectures.set(h.series_id, h);
  }

  const rows: LibraryDashboardRow[] = [];
  for (const entry of entries) {
    const [row, chapters] = await Promise.all([
      getDb().get<Series>(TABLES.series, entry.series_id),
      listChapters(entry.series_id, { publishedOnly: true }),
    ]);
    const series = row ? mapSeries(row) : null;
    const byId = new Map(chapters.map((c) => [c.id, c]));
    const numeros = chapters.map((c) => c.numero);
    const total = chapters.length;
    const premierNumero = total > 0 ? Math.min(...numeros) : null;
    // Dernière parution (§6.7 « nouveautés ») : publication la plus récente.
    const derniereSortie = chapters.reduce<string | null>((latest, c) => {
      const date = c.publish_at ?? c.created_at;
      return latest === null || date > latest ? date : latest;
    }, null);

    // Reprise : historique d'abord, sinon la progression déjà en biblio.
    const lecture = dernieresLectures.get(entry.series_id) ?? null;
    let reprise: { numero: number; page: number } | null = null;
    let derniereLecture: string | null = null;
    if (lecture) {
      const chapitre = byId.get(lecture.chapter_id) ?? (await getChapterById(lecture.chapter_id));
      if (chapitre) reprise = { numero: chapitre.numero, page: Math.max(lecture.page, 1) };
      derniereLecture = lecture.read_at;
    }
    if (!reprise && entry.last_chapter_id) {
      const chapitre = byId.get(entry.last_chapter_id) ?? (await getChapterById(entry.last_chapter_id));
      if (chapitre) {
        reprise = { numero: chapitre.numero, page: Math.max(entry.last_page, 1) };
        derniereLecture = entry.updated_at;
      }
    }

    const atteint = reprise?.numero ?? 0;
    // Progression : part des chapitres publiés atteints (numéro ≤ reprise),
    // cohérente avec le badge « +N non lus » qui compte les suivants.
    const nonLus = reprise ? chapters.filter((c) => c.numero > atteint).length : total;
    rows.push({
      entry,
      series,
      totalChapitres: total,
      premierNumero,
      reprise,
      derniereLecture,
      derniereSortie,
      nonLus,
      progression: total > 0 ? Math.round(((total - nonLus) / total) * 100) : 0,
    });
  }
  return rows;
}
