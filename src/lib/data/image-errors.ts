import "server-only";
import { getDb, invalidate, rowId, TABLES } from "@/lib/db";

/** Journée UTC courante (décalée pour le relevé sur deux jours glissants). */
function today(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

type ImageErrorRow = {
  id: string;
  day: string;
  chapter_id: string;
  page_index: number;
  count: number;
  updated_at: string;
};

/**
 * Télémétrie d'erreur d'images (§9.1) : le lecteur remonte les pages qui
 * n'ont pas pu être chargées après reprise, agrégées par jour, chapitre et
 * page. Aucune donnée personnelle n'est collectée.
 */
export async function recordImageErrors(
  chapterId: string,
  pageIndexes: number[],
): Promise<number> {
  if (!chapterId || pageIndexes.length === 0) return 0;
  const db = getDb();
  const day = today();
  let recorded = 0;

  for (const pageIndex of pageIndexes.slice(0, 20)) {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex > 5000) continue;
    // `rowId` accepte uniquement `a-zA-Z0-9._-` : on joint les parties par "-"
    // (et il hache automatiquement au-delà de 36 caractères).
    const id = rowId(day, chapterId, pageIndex);
    try {
      const existing = await db.get<ImageErrorRow>(TABLES.imageErrors, id);
      if (existing) {
        await db.update(TABLES.imageErrors, id, {
          count: (existing.count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        });
      } else {
        await db.create(TABLES.imageErrors, id, {
          id,
          day,
          chapter_id: chapterId,
          page_index: pageIndex,
          count: 1,
          updated_at: new Date().toISOString(),
        });
      }
      recorded++;
    } catch {
      // Base indisponible : la télémétrie n'est jamais bloquante.
    }
  }
  invalidate("image-errors:");
  return recorded;
}

/**
 * Nettoyage des compteurs d'erreurs lors de la suppression d'un chapitre :
 * sans cela, les alertes du cron de santé continueraient de compter des pages
 * qui n'existent plus (meilleur effort, jamais bloquant).
 */
export async function purgeImageErrors(chapterId: string): Promise<void> {
  const db = getDb();
  try {
    const { items } = await db.list<ImageErrorRow>(TABLES.imageErrors, {
      filters: [{ field: "chapter_id", op: "eq", value: chapterId }],
      limit: 500,
    });
    for (const row of items) {
      try {
        await db.remove(TABLES.imageErrors, row.id);
      } catch {
        // ligne déjà absente
      }
    }
    invalidate("image-errors:");
  } catch {
    // la base est indisponible : la suppression du chapitre doit passer
  }
}

/** Volume des deux derniers jours (le fuseau UTC peut découper la journée). */
export async function countRecentImageErrors(): Promise<{ total: number; byChapter: number }> {
  const db = getDb();
  const { items } = await db.list<ImageErrorRow>(TABLES.imageErrors, {
    filters: [{ field: "day", op: "in", value: [today(), today(-1)] }],
    limit: 1000,
  });
  let total = 0;
  const chapters = new Set<string>();
  for (const row of items) {
    total += row.count ?? 0;
    if (row.count) chapters.add(row.chapter_id);
  }
  return { total, byChapter: chapters.size };
}
