import "server-only";
import { allHistory } from "@/lib/data/history";
import { listLibrary } from "@/lib/data/library";
import { seriesParIds } from "@/lib/data/series";
import type { HistoryEntry, LibraryEntry, Series } from "@/lib/types";

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

const JOUR_MS = 86_400_000;
const jourIso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Jours consécutifs de lecture se terminant aujourd'hui ou hier (UTC) : une
 * série interrompue depuis plusieurs jours vaut 0, et non plus la longueur
 * de la dernière série, aussi ancienne soit-elle.
 */
export function joursConsecutifs(jours: readonly string[], maintenant = Date.now()): number {
  const actifs = new Set(jours);
  let curseur = actifs.has(jourIso(maintenant)) ? maintenant : maintenant - JOUR_MS;
  let serie = 0;
  while (actifs.has(jourIso(curseur))) {
    serie += 1;
    curseur -= JOUR_MS;
  }
  return serie;
}

/** Calcul pur, à partir de l'historique complet et de la bibliothèque. */
export function computeStats(
  history: readonly HistoryEntry[],
  library: readonly LibraryEntry[],
): UserStats {
  const byDay = new Map<string, { pages: number; chapitres: number }>();
  const bySeries = new Map<string, number>();
  let pages = 0;
  for (const h of history) {
    const lues = Math.max(h.page, 0);
    pages += lues;
    const date = h.read_at.slice(0, 10);
    const bucket = byDay.get(date) ?? { pages: 0, chapitres: 0 };
    bucket.pages += lues;
    bucket.chapitres += 1;
    byDay.set(date, bucket);
    bySeries.set(h.series_id, (bySeries.get(h.series_id) ?? 0) + 1);
  }
  const par_jour = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, ...v }));

  let seriePreferee: string | null = null;
  let best = 0;
  for (const [id, count] of bySeries) {
    if (count > best) {
      best = count;
      seriePreferee = id;
    }
  }

  return {
    chapitres_lus: history.length,
    pages_lues: pages,
    minutes_estimes: Math.round(pages * 0.6),
    series_terminees: library.filter((l) => l.statut === "termine").length,
    series_suivies: library.length,
    serie_preferee: seriePreferee,
    jours_consecutifs: joursConsecutifs(par_jour.map((j) => j.date)),
    par_jour,
  };
}

/** Statistiques d'un membre (profil public, export). */
export async function userStats(userId: string): Promise<UserStats> {
  const [history, library] = await Promise.all([allHistory(userId), listLibrary(userId)]);
  return computeStats(history, library);
}

export interface ReadingProfile {
  stats: UserStats;
  /** Genres des séries suivies ou lues, du plus fréquent au moins fréquent. */
  genres: Array<[string, number]>;
  seriePreferee: Series | null;
}

/**
 * Page /statistiques : chiffres, genres et série la plus lue avec une seule
 * lecture de l'historique et de la bibliothèque, et une lecture groupée des
 * séries (au lieu de deux lectures d'historique et d'un `get` par série).
 */
export async function readingProfile(userId: string): Promise<ReadingProfile> {
  const [history, library] = await Promise.all([allHistory(userId), listLibrary(userId)]);
  const stats = computeStats(history, library);
  const series = await seriesParIds([
    ...library.map((l) => l.series_id),
    ...history.map((h) => h.series_id),
  ]);
  const genres = new Map<string, number>();
  for (const serie of series.values()) {
    for (const genre of serie.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  }
  return {
    stats,
    genres: [...genres.entries()].sort((a, b) => b[1] - a[1]),
    seriePreferee: stats.serie_preferee ? (series.get(stats.serie_preferee) ?? null) : null,
  };
}
