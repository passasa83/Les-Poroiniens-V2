import "server-only";
import { getDb, listAll, TABLES } from "@/server/db";
import { exclureDemo, filtresSansDemo } from "@/lib/demo-gate";
import { listImportJobs, listReports } from "@/lib/data/moderation";
import { seriesIndex, seriesParIds, type SeriesIndexEntry } from "@/lib/data/series";
import type { Chapter, ImportJob, Report, Series } from "@/lib/types";

const JOUR = 86_400_000;

/** Fenêtres des indicateurs du tableau de bord (la plus longue borne les lectures). */
export const FENETRES = [
  { label: "Jour", ms: JOUR },
  { label: "Semaine", ms: 7 * JOUR },
  { label: "Mois", ms: 30 * JOUR },
] as const;

export type Triplet = [number, number, number];

/** Nombre de dates (ISO) tombant dans chaque fenêtre. */
function parFenetre(dates: readonly (string | null | undefined)[]): Triplet {
  const maintenant = Date.now();
  return FENETRES.map(({ ms }) => {
    const depuis = maintenant - ms;
    return dates.filter((d) => {
      const t = d ? Date.parse(d) : NaN;
      return Number.isFinite(t) && t >= depuis;
    }).length;
  }) as Triplet;
}

export interface AdminDashboard {
  seriesActives: number;
  seriesArchivees: number;
  utilisateurs: number;
  vuesTotales: number;
  topSeries: SeriesIndexEntry[];
  seriesAjoutees: Triplet;
  chapitresPublies: Triplet;
  brouillons: number;
  planifies: number;
  commentaires: Triplet;
  inscriptions: Triplet;
  signalementsOuverts: Report[];
  jobsEnErreur: ImportJob[];
  derniersChapitres: Array<{ chapter: Chapter; serie: Series | null }>;
}

/**
 * Indicateurs du tableau de bord admin. Avant : 4 tables lues en entier
 * (`limit: 5000`, faux au-delà) pour compter en mémoire. Maintenant :
 * totaux par `total` (une ligne lue), activité limitée aux 30 derniers
 * jours et réduite à la colonne de date, top et sommes sur l'index léger.
 */
export async function adminDashboard(): Promise<AdminDashboard> {
  const depuis = new Date(Date.now() - FENETRES[2].ms).toISOString();
  const sansDemoSeries = filtresSansDemo("series");
  const sansDemoChapitres = filtresSansDemo("chapters");
  const db = getDb();

  const [
    index,
    archivees,
    profils,
    seriesRecentes,
    publies,
    brouillons,
    planifies,
    recents,
    commentaires,
    inscriptions,
    ouverts,
    jobs,
  ] = await Promise.all([
    seriesIndex(),
    db.list(TABLES.series, {
      filters: [...sansDemoSeries, { field: "statut", op: "eq", value: "archive" }],
      select: ["statut"],
      limit: 1,
    }),
    db.list(TABLES.profiles, { select: ["user_id"], limit: 1 }),
    listAll(TABLES.series, {
      filters: [
        ...sansDemoSeries,
        { field: "statut", op: "neq", value: "archive" },
        { field: "created_at", op: "gte", value: depuis },
      ],
      select: ["created_at"],
    }),
    listAll(TABLES.chapters, {
      filters: [
        ...sansDemoChapitres,
        { field: "statut", op: "eq", value: "published" },
        { field: "publish_at", op: "gte", value: depuis },
      ],
      select: ["publish_at"],
    }),
    db.list(TABLES.chapters, {
      filters: [...sansDemoChapitres, { field: "statut", op: "eq", value: "draft" }],
      select: ["statut"],
      limit: 1,
    }),
    db.list(TABLES.chapters, {
      filters: [...sansDemoChapitres, { field: "statut", op: "eq", value: "scheduled" }],
      select: ["statut"],
      limit: 1,
    }),
    db.list(TABLES.chapters, {
      filters: sansDemoChapitres,
      order: { field: "created_at", dir: "desc" },
      limit: 8,
    }),
    listAll(TABLES.comments, {
      filters: [{ field: "created_at", op: "gte", value: depuis }],
      select: ["created_at"],
    }),
    listAll(TABLES.profiles, {
      filters: [{ field: "date_inscription", op: "gte", value: depuis }],
      select: ["date_inscription"],
    }),
    listReports("ouvert"),
    listImportJobs(50),
  ]);

  const series = await seriesParIds(recents.items.map((c) => c.series_id));

  return {
    seriesActives: index.length,
    seriesArchivees: archivees.total,
    utilisateurs: profils.total,
    vuesTotales: index.reduce((somme, s) => somme + (Number(s.vues) || 0), 0),
    topSeries: [...index].sort((a, b) => b.vues - a.vues).slice(0, 5),
    seriesAjoutees: parFenetre(seriesRecentes.map((s) => s.created_at)),
    chapitresPublies: parFenetre(publies.map((c) => c.publish_at)),
    brouillons: brouillons.total,
    planifies: planifies.total,
    commentaires: parFenetre(exclureDemo(commentaires).map((c) => c.created_at)),
    inscriptions: parFenetre(inscriptions.map((p) => p.date_inscription)),
    signalementsOuverts: ouverts,
    jobsEnErreur: jobs.filter((j) => j.statut === "erreur"),
    derniersChapitres: recents.items.map((chapter) => ({
      chapter,
      serie: series.get(chapter.series_id) ?? null,
    })),
  };
}
