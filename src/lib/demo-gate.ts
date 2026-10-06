import "server-only";
import { TABLES, type Filter } from "@/lib/db";
import { getDemoStore } from "@/lib/db/seed";

/**
 * Masquage du jeu de démonstration en production.
 *
 * La base Appwrite `poroiniens` est partagée dev/prod : la graine
 * `/api/cron/seed` y a écrit 10 séries de démo (Les Poroiniens, Aurore de
 * Cendres, …), leurs chapitres et planches SVG `/api/img/page/…`, des
 * annonces, des recommandations et des lignes de bibliothèque. Ces lignes
 * étaient visibles sur Vercel : décision du client = les masquer dès que
 * `VERCEL_ENV === "production"`, et ne changer **rien** en local (les
 * recettes s'appuient sur `/serie/les-poroiniens`).
 *
 * Le jeu d'ids est **dérivé de la graine** (`getDemoStore`) : une série, une
 * annonce ou une table ajoutée à `seed.ts` est couverte sans refonte de ce
 * module. Il n'est bâti qu'une fois, et **uniquement** quand le masquage est
 * actif — en local ce module ne construit jamais le store (le driver démo, s'il
 * sert, le bâtit de son côté).
 */

const VIDE: ReadonlySet<string> = new Set<string>();

/** Vrai uniquement sur le déploiement de production Vercel. */
export function demoMasque(): boolean {
  return process.env.VERCEL_ENV === "production";
}

interface JeuDemo {
  /** Ids des lignes de la graine, par table (toute table de `seed.ts`). */
  idsParTable: Map<string, Set<string>>;
  /** Union des ids de toutes les tables : teste une cible de signalement. */
  tousLesIds: Set<string>;
  /** Ids des séries de démonstration. */
  series: Set<string>;
  /** Slugs des séries de démonstration (les slugs de la graine sont stables). */
  slugs: Set<string>;
}

let jeu: JeuDemo | null = null;

/** Construction mémoïsée du jeu d'ids, réalisée uniquement en production. */
function jeuDemo(): JeuDemo | null {
  if (!demoMasque()) return null;
  if (jeu) return jeu;

  const idsParTable = new Map<string, Set<string>>();
  const tousLesIds = new Set<string>();
  const series = new Set<string>();
  const slugs = new Set<string>();

  for (const [table, rows] of Object.entries(getDemoStore())) {
    const ids = new Set<string>();
    for (const row of rows.values()) {
      const id = String(row.id ?? "");
      if (!id) continue;
      ids.add(id);
      tousLesIds.add(id);
      if (table === TABLES.series) {
        series.add(id);
        if (typeof row.slug === "string" && row.slug) slugs.add(row.slug);
      }
    }
    idsParTable.set(table, ids);
  }

  jeu = { idsParTable, tousLesIds, series, slugs };
  return jeu;
}

/** Ids des lignes de la graine pour une table (ensemble vide hors production). */
export function demoIds(table: string): ReadonlySet<string> {
  return jeuDemo()?.idsParTable.get(table) ?? VIDE;
}

/** Vrai si `idOuSlug` désigne une série de la graine (id **ou** slug). */
export function serieDeDemo(idOuSlug: string): boolean {
  const j = jeuDemo();
  if (!j) return false;
  return j.series.has(idOuSlug) || j.slugs.has(idOuSlug);
}

/** Vrai si `id` désigne n'importe quelle ligne de la graine (cibles, signalements…). */
export function idDeDemo(id: string): boolean {
  return jeuDemo()?.tousLesIds.has(id) ?? false;
}

/**
 * Retire les lignes de la graine d'une liste ; la liste est renvoyée
 * **inchangée** quand le masquage est inactif (local non modifié).
 */
export function exclureDemo<T extends { id: string }>(rows: T[]): T[] {
  const j = jeuDemo();
  if (!j) return rows;
  return rows.filter((row) => !j.tousLesIds.has(row.id));
}

/**
 * Retire les lignes rattachées à une série de la graine (bibliothèque,
 * historique de lecture) : leurs fiches sont masquées, ces lignes ne peuvent
 * donc plus être rendues (carte orpheline, identifiant brut à l'écran).
 */
export function exclureSeriesDemo<T extends { series_id: string }>(rows: T[]): T[] {
  const j = jeuDemo();
  if (!j) return rows;
  return rows.filter((row) => !j.series.has(row.series_id));
}

/**
 * Filtres `neq` à épingler à une requête de listage quand `total` et la
 * pagination doivent rester exacts : l'exclusion ne peut pas se faire après
 * coup sans fausser le compte.
 *
 * Appwrite refuse `notEqual` multi-valeurs (« NotEqual queries require
 * exactly one value ») mais combine plusieurs requêtes en ET : un filtre
 * `slug neq <démo>` par série de la graine écarte le jeu de démonstration,
 * `total` compris (vérifié en base, 345 → 335 séries, 456 → 296 chapitres).
 */
export function filtresSansDemo(table: "series" | "chapters"): Filter[] {
  const j = jeuDemo();
  if (!j) return [];
  return table === "series"
    ? [...j.slugs].map((slug): Filter => ({ field: "slug", op: "neq", value: slug }))
    : [...j.series].map((id): Filter => ({ field: "series_id", op: "neq", value: id }));
}
