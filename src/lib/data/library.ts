import "server-only";
import { getDb, listAll, parLots, rowId, TABLES } from "@/server/db";
import { exclureSeriesDemo } from "@/lib/demo-gate";
import { chaptersParIds, publishedChaptersOf } from "@/lib/data/chapters";
import { allHistory } from "@/lib/data/history";
import { seriesParIds } from "@/lib/data/series";
import type { HistoryEntry, LibraryEntry, LibraryStatus, Series } from "@/lib/types";

/*
 * Bibliothèque : une ligne par (membre, série), identifiant
 * `rowId(user, série)`. Lectures groupées (séries, chapitres) : plus aucun
 * aller-retour par ligne.
 */

/** Toute la bibliothèque, la plus récemment modifiée d'abord. */
export async function listLibrary(userId: string): Promise<LibraryEntry[]> {
  const items = await listAll(TABLES.library, {
    filters: [{ field: "user_id", op: "eq", value: userId }],
    order: { field: "updated_at", dir: "desc" },
  });
  /* Séries de la graine masquées en production (la fiche l'est aussi). */
  return exclureSeriesDemo(items);
}

export async function getLibraryEntry(
  userId: string,
  seriesId: string,
): Promise<LibraryEntry | null> {
  return getDb().get(TABLES.library, rowId(userId, seriesId));
}

export async function upsertLibraryEntry(
  userId: string,
  seriesId: string,
  patch: Partial<Omit<LibraryEntry, "user_id" | "series_id">>,
): Promise<LibraryEntry> {
  const existing = await getLibraryEntry(userId, seriesId);
  const next: LibraryEntry = {
    statut: "en_cours" as LibraryStatus,
    favori: false,
    note: null,
    last_chapter_id: null,
    last_page: 0,
    ...(existing ?? {}),
    ...patch,
    user_id: userId,
    series_id: seriesId,
    updated_at: new Date().toISOString(),
  };
  const { user_id, series_id, statut, favori, note, last_chapter_id, last_page, updated_at } = next;
  await getDb().upsert(TABLES.library, rowId(userId, seriesId), {
    user_id,
    series_id,
    statut,
    favori,
    note,
    last_chapter_id,
    last_page,
    updated_at,
  });
  return next;
}

export async function removeLibraryEntry(userId: string, seriesId: string): Promise<void> {
  await getDb().remove(TABLES.library, rowId(userId, seriesId));
}

/** Suppression de compte : toutes les lignes, séries de la graine comprises. */
export async function clearLibrary(userId: string): Promise<void> {
  const lignes = await listAll(TABLES.library, {
    filters: [{ field: "user_id", op: "eq", value: userId }],
    select: ["series_id"],
  });
  await parLots(lignes, (l) => getDb().remove(TABLES.library, l.id));
}

export type LibraryWithSeries = LibraryEntry & { series: Series | null };

/** Bibliothèque enrichie des fiches séries (profil, export). */
export async function libraryWithSeries(userId: string): Promise<LibraryWithSeries[]> {
  const entries = await listLibrary(userId);
  const series = await seriesParIds(entries.map((e) => e.series_id));
  return entries.map((entry) => ({ ...entry, series: series.get(entry.series_id) ?? null }));
}

/* ── Tableau de bord de la bibliothèque ───────────────────────────── */

export interface LibraryDashboardRow {
  entry: LibraryEntry;
  series: Series | null;
  /** Chapitres publiés de la série. */
  totalChapitres: number;
  /** Premier numéro publié (cible du bouton « Lire » d'une série commencée à rien). */
  premierNumero: number | null;
  /** Dernier chapitre atteint et page : même reprise que la fiche. */
  reprise: { numero: number; page: number } | null;
  /** Date ISO de la dernière lecture, `null` si la série n'a jamais été ouverte. */
  derniereLecture: string | null;
  /** Publication la plus récente de la série → tri « nouveautés ». */
  derniereSortie: string | null;
  /** Chapitres parus après la dernière lecture → badge « +N non lus ». */
  nonLus: number;
  /** Progression en pourcentage (0 à 100), arrondie à l'unité. */
  progression: number;
}

/**
 * Ligne de la bibliothèque enrichie pour la page : progression, dernier
 * chapitre lu et chapitres non lus.
 *
 * Lecture séquentielle assumée (le lecteur reprend toujours sur le dernier
 * chapitre atteint) : la progression suit le numéro de reprise et les
 * chapitres parus ensuite constituent les non-lus. Aucune écriture.
 *
 * Quatre lectures groupées en tout (bibliothèque + historique, séries,
 * chapitres publiés, chapitres de reprise hors liste) au lieu de deux
 * requêtes par série suivie.
 */
export async function libraryDashboard(userId: string): Promise<LibraryDashboardRow[]> {
  const [entries, history] = await Promise.all([listLibrary(userId), allHistory(userId)]);

  // Dernière lecture par série (historique trié du plus récent au plus ancien).
  const dernieresLectures = new Map<string, HistoryEntry>();
  for (const h of history) {
    if (!dernieresLectures.has(h.series_id)) dernieresLectures.set(h.series_id, h);
  }

  const seriesIds = entries.map((e) => e.series_id);
  const [series, chapitresParSerie] = await Promise.all([
    seriesParIds(seriesIds),
    publishedChaptersOf(seriesIds),
  ]);

  /* Chapitre de reprise absent des chapitres publiés (dépublié depuis) :
     relu en un seul lot, comme l'ancien `getChapterById` de repli. */
  const connus = new Set([...chapitresParSerie.values()].flat().map((c) => c.id));
  const manquants = entries.flatMap((e) =>
    [dernieresLectures.get(e.series_id)?.chapter_id, e.last_chapter_id].filter(
      (id): id is string => Boolean(id) && !connus.has(id!),
    ),
  );
  const horsListe = await chaptersParIds(manquants);

  return entries.map((entry) => {
    const chapters = chapitresParSerie.get(entry.series_id) ?? [];
    const numeroDe = (id: string | null | undefined) => {
      if (!id) return null;
      return chapters.find((c) => c.id === id)?.numero ?? horsListe.get(id)?.numero ?? null;
    };
    const total = chapters.length;
    const premierNumero = total > 0 ? Math.min(...chapters.map((c) => c.numero)) : null;
    const derniereSortie = chapters.reduce<string | null>((latest, c) => {
      const date = c.publish_at ?? c.created_at;
      return latest === null || date > latest ? date : latest;
    }, null);

    // Reprise : historique d'abord, sinon la progression déjà en bibliothèque.
    const lecture = dernieresLectures.get(entry.series_id) ?? null;
    let reprise: { numero: number; page: number } | null = null;
    let derniereLecture: string | null = null;
    const numeroLu = numeroDe(lecture?.chapter_id);
    if (lecture) {
      if (numeroLu !== null) reprise = { numero: numeroLu, page: Math.max(lecture.page, 1) };
      derniereLecture = lecture.read_at;
    }
    const numeroBiblio = numeroDe(entry.last_chapter_id);
    if (!reprise && numeroBiblio !== null) {
      reprise = { numero: numeroBiblio, page: Math.max(entry.last_page, 1) };
      derniereLecture = entry.updated_at;
    }

    // Progression : part des chapitres publiés atteints (numéro ≤ reprise),
    // cohérente avec le badge « +N non lus » qui compte les suivants.
    const atteint = reprise?.numero ?? 0;
    const nonLus = reprise ? chapters.filter((c) => c.numero > atteint).length : total;
    return {
      entry,
      series: series.get(entry.series_id) ?? null,
      totalChapitres: total,
      premierNumero,
      reprise,
      derniereLecture,
      derniereSortie,
      nonLus,
      progression: total > 0 ? Math.round(((total - nonLus) / total) * 100) : 0,
    };
  });
}
