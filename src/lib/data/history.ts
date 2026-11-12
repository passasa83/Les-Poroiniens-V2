import "server-only";
import { getDb, listAll, parLots, rowId, TABLES, type TableFilter } from "@/server/db";
import { exclureSeriesDemo } from "@/lib/demo-gate";
import type { HistoryEntry } from "@/lib/types";

/*
 * Historique de lecture : une ligne par (membre, chapitre), identifiant
 * `rowId(user, chapitre)`. Les lectures d'une série de la graine sont
 * masquées en production, comme la fiche : historique, statistiques et
 * « Continuer la lecture » restent cohérents avec ce qui est affiché.
 */

function filtres(userId: string, seriesId?: string): TableFilter<"reading_history">[] {
  return [
    { field: "user_id", op: "eq", value: userId },
    ...(seriesId ? [{ field: "series_id", op: "eq", value: seriesId } as const] : []),
  ];
}

/** Lectures les plus récentes (page /historique, accueil, nouveautés). */
export async function recentHistory(userId: string, limit: number): Promise<HistoryEntry[]> {
  const { items } = await getDb().list(TABLES.history, {
    filters: filtres(userId),
    order: { field: "read_at", dir: "desc" },
    limit,
  });
  return exclureSeriesDemo(items);
}

/**
 * Tout l'historique (statistiques, export, bibliothèque), du plus récent au
 * plus ancien, lu par lots : l'ancien `limit: 1000` faussait les chiffres
 * des gros lecteurs. `seriesId` restreint à une série (fiche).
 */
export async function allHistory(userId: string, seriesId?: string): Promise<HistoryEntry[]> {
  const items = await listAll(TABLES.history, {
    filters: filtres(userId, seriesId),
    order: { field: "read_at", dir: "desc" },
  });
  return exclureSeriesDemo(items);
}

/** Lecture d'un chapitre précis (page de reprise du lecteur) : un `get`. */
export async function getHistoryEntry(
  userId: string,
  chapterId: string,
): Promise<HistoryEntry | null> {
  return getDb().get(TABLES.history, rowId(userId, chapterId));
}

export async function clearHistory(userId: string): Promise<void> {
  const lignes = await listAll(TABLES.history, {
    filters: filtres(userId),
    select: ["chapter_id"],
  });
  await parLots(lignes, (l) => getDb().remove(TABLES.history, l.id));
}
