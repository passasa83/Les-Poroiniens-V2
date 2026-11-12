import "server-only";
import { listAll, TABLES } from "@/server/db";
import { cached } from "@/server/cache";
import { seriesIndex, seriesParIds, type SeriesIndexEntry } from "@/lib/data/series";
import type { Series, SeriesType } from "@/lib/types";

/**
 * Classement : onglets Jour / Semaine / Mois / Tout temps, filtre par
 * format, liste numérotée avec évolution ▲▼.
 *
 * Métrique de période — la base ne stocke **pas** de compteur de vues daté
 * (les vues sont un cumul, cf. `RankList`) : on mesure donc l'activité réelle
 * de la fenêtre, dans cet ordre de priorité :
 *   1. `vues` des chapitres **parus pendant** la fenêtre (une vue d'un chapitre
 *      sorti dans la fenêtre a nécessairement eu lieu pendant celle-ci) ;
 *   2. `lectures` enregistrées pendant la fenêtre (`reading_history.read_at`) ;
 *   3. `vues` cumulées de la série, puis titre, pour départager de façon
 *      déterministe.
 *
 * Seules les séries ayant eu une activité sur la période sont classées : une
 * série sans activité n'a pas de rang « du jour ». `Tout temps` classe le
 * catalogue entier par vues cumulées.
 */

const DAY = 86_400_000;

export const PERIODES = [
  { cle: "jour", label: "Jour", dureeMs: DAY, fenetre: "les 24 dernières heures" },
  { cle: "semaine", label: "Semaine", dureeMs: 7 * DAY, fenetre: "les 7 derniers jours" },
  { cle: "mois", label: "Mois", dureeMs: 30 * DAY, fenetre: "les 30 derniers jours" },
  { cle: "tout-temps", label: "Tout temps", dureeMs: null, fenetre: "depuis le début du site" },
] as const;

export type PeriodeCle = (typeof PERIODES)[number]["cle"];

/** Onglet rendu quand `?periode=` est absent **ou inconnu** (repli silencieux). */
export const PERIODE_DEFAUT: PeriodeCle = "jour";

export function estPeriode(valeur: unknown): valeur is PeriodeCle {
  return PERIODES.some((p) => p.cle === valeur);
}

export function estTypeSerie(valeur: unknown): valeur is SeriesType {
  return (
    valeur === "manga" || valeur === "manhwa" || valeur === "manhua" || valeur === "light_novel"
  );
}

export interface RangClassement {
  serie: Series;
  rang: number;
  /** Places gagnées depuis la période précédente (positif = ▲) ; `null` = non comparable. */
  evolution: number | null;
  /** Présent maintenant, absent de la période précédente. */
  nouveau: boolean;
  /** Chapitres parus sur la période. */
  sorties: number;
  /** Lectures enregistrées sur la période. */
  lectures: number;
  /** Vues des chapitres parus sur la période (métrique principale). */
  vuesSorties: number;
  /** Vues cumulées de la série (départage + onglet « Tout temps »). */
  vues: number;
}

interface Activite {
  sorties: number;
  sortiesPrec: number;
  lectures: number;
  lecturesPrec: number;
  vuesSorties: number;
  vuesSortiesPrec: number;
}

const vide = (): Activite => ({
  sorties: 0,
  sortiesPrec: 0,
  lectures: 0,
  lecturesPrec: 0,
  vuesSorties: 0,
  vuesSortiesPrec: 0,
});

/** Tri d'une période : vues des sorties, lectures, sorties, vues cumulées, titre. */
function comparer(
  a: { serie: SeriesIndexEntry; act: Activite },
  b: { serie: SeriesIndexEntry; act: Activite },
): number {
  return (
    b.act.vuesSorties - a.act.vuesSorties ||
    b.act.lectures - a.act.lectures ||
    b.act.sorties - a.act.sorties ||
    b.serie.vues - a.serie.vues ||
    a.serie.titre.localeCompare(b.serie.titre, "fr")
  );
}

export async function classement(opts: {
  periode: PeriodeCle;
  type?: SeriesType | "";
  includeAdult?: boolean;
  limite?: number;
}): Promise<RangClassement[]> {
  const type = opts.type ?? "";
  const includeAdult = Boolean(opts.includeAdult);
  const limite = Math.min(Math.max(opts.limite ?? 50, 1), 100);
  const key = `classement:${opts.periode}:${type}:${includeAdult ? "adult" : "safe"}:${limite}`;
  return cached(key, 60_000, () => calculer(opts.periode, type, includeAdult, limite));
}

async function calculer(
  periode: PeriodeCle,
  type: SeriesType | "",
  includeAdult: boolean,
  limite: number,
): Promise<RangClassement[]> {
  /* Index léger (toutes les séries publiques, sans plafond) ; seules les
     séries classées sont ensuite chargées en entier. */
  const series = (await seriesIndex())
    .filter((s) => (includeAdult ? true : s.classification !== "adult"))
    .filter((s) => (type ? s.type === type : true));

  const definition = PERIODES.find((p) => p.cle === periode) ?? PERIODES[0];

  /* ── Tout temps : catalogue entier par vues cumulées ─────────────────── */
  if (definition.dureeMs === null) {
    const top = [...series]
      .sort(
        (a, b) =>
          b.vues - a.vues || b.populaire - a.populaire || a.titre.localeCompare(b.titre, "fr"),
      )
      .slice(0, limite);
    const full = await seriesParIds(top.map((s) => s.id));
    return top
      .filter((s) => full.has(s.id))
      .map((s, index) => ({
        serie: full.get(s.id)!,
        rang: index + 1,
        evolution: null,
        nouveau: false,
        sorties: 0,
        lectures: 0,
        vuesSorties: 0,
        vues: s.vues,
      }));
  }

  /* ── Fenêtre courante + fenêtre précédente de même longueur ──────────── */
  const maintenant = Date.now();
  const duree = definition.dureeMs;
  const debutCourant = maintenant - duree;
  const debutPrecedent = maintenant - 2 * duree;
  const isoPrecedent = new Date(debutPrecedent).toISOString();
  const ids = new Set(series.map((s) => s.id));

  /* Toute l'activité des deux fenêtres (au plus 60 jours), colonnes utiles
     seulement : un `limit: 1000` faussait le classement dès 1000 lectures. */
  const [chapitres, lectures] = await Promise.all([
    listAll(TABLES.chapters, {
      filters: [
        { field: "statut", op: "eq", value: "published" },
        { field: "publish_at", op: "gte", value: isoPrecedent },
      ],
      select: ["series_id", "publish_at", "vues"],
    }),
    listAll(TABLES.history, {
      filters: [{ field: "read_at", op: "gte", value: isoPrecedent }],
      select: ["series_id", "read_at"],
    }),
  ]);

  const activite = new Map<string, Activite>();
  const get = (id: string): Activite | null => {
    if (!ids.has(id)) return null;
    let a = activite.get(id);
    if (!a) {
      a = vide();
      activite.set(id, a);
    }
    return a;
  };

  for (const chapitre of chapitres) {
    const temps = Date.parse(chapitre.publish_at ?? "");
    if (Number.isNaN(temps) || temps > maintenant) continue; // publié à l'avenir
    const a = get(chapitre.series_id);
    if (!a) continue;
    const dansCourant = temps >= debutCourant;
    if (dansCourant) {
      a.sorties += 1;
      a.vuesSorties += Math.max(chapitre.vues ?? 0, 0);
    } else {
      a.sortiesPrec += 1;
      a.vuesSortiesPrec += Math.max(chapitre.vues ?? 0, 0);
    }
  }

  for (const lecture of lectures) {
    const temps = Date.parse(lecture.read_at ?? "");
    if (Number.isNaN(temps) || temps > maintenant) continue;
    const a = get(lecture.series_id);
    if (!a) continue;
    if (temps >= debutCourant) a.lectures += 1;
    else a.lecturesPrec += 1;
  }

  const courants = series
    .filter((s) => {
      const a = activite.get(s.id);
      return Boolean(a && (a.sorties > 0 || a.lectures > 0));
    })
    .map((serie) => ({ serie, act: activite.get(serie.id) ?? vide() }))
    .sort(comparer);

  const precedents = series
    .filter((s) => {
      const a = activite.get(s.id);
      return Boolean(a && (a.sortiesPrec > 0 || a.lecturesPrec > 0));
    })
    .map((serie) => ({ serie, act: activite.get(serie.id) ?? vide() }))
    .sort(
      (a, b) =>
        /* même tri, mais sur les compteurs de la fenêtre précédente */
        b.act.vuesSortiesPrec - a.act.vuesSortiesPrec ||
        b.act.lecturesPrec - a.act.lecturesPrec ||
        b.act.sortiesPrec - a.act.sortiesPrec ||
        b.serie.vues - a.serie.vues ||
        a.serie.titre.localeCompare(b.serie.titre, "fr"),
    );

  const rangsPrec = new Map<string, number>();
  precedents.forEach((entry, index) => rangsPrec.set(entry.serie.id, index + 1));
  const comparaisonPossible = rangsPrec.size > 0;

  const retenus = courants.slice(0, limite);
  const full = await seriesParIds(retenus.map((entry) => entry.serie.id));
  return retenus.flatMap((entry, index) => {
    const serie = full.get(entry.serie.id);
    if (!serie) return [];
    const rangPrec = rangsPrec.get(entry.serie.id) ?? null;
    const nouveau = comparaisonPossible && rangPrec === null;
    return {
      serie,
      rang: index + 1,
      evolution: rangPrec === null ? null : rangPrec - (index + 1),
      nouveau,
      sorties: entry.act.sorties,
      lectures: entry.act.lectures,
      vuesSorties: entry.act.vuesSorties,
      vues: entry.serie.vues,
    };
  });
}
