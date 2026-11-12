import "server-only";
import { getDb, rowId, TABLES } from "@/server/db";
import { upsertLibraryEntry } from "@/lib/data/library";
import type { HistoryEntry } from "@/lib/types";

/**
 * Enregistre la progression d'un chapitre : ligne d'historique (un `upsert`
 * au lieu de « lire puis créer ou modifier ») et, dès qu'une page est lue,
 * reprise de la série en bibliothèque.
 */
export async function recordProgress(input: {
  userId: string;
  chapterId: string;
  seriesId: string;
  page: number;
  completed?: boolean;
}): Promise<void> {
  const entry: HistoryEntry = {
    user_id: input.userId,
    chapter_id: input.chapterId,
    series_id: input.seriesId,
    page: input.page,
    completed: Boolean(input.completed),
    read_at: new Date().toISOString(),
  };
  await getDb().upsert(TABLES.history, rowId(input.userId, input.chapterId), entry);
  if (input.page > 0 || input.completed) {
    await upsertLibraryEntry(input.userId, input.seriesId, {
      last_chapter_id: input.chapterId,
      last_page: input.page,
      statut: "en_cours",
    });
  }
}
