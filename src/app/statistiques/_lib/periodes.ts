/* Données des graphiques de /statistiques : périodes, points, régularité. */

/* ── Périodes des graphiques (« graphiques semaine / mois / année ») ─ */

export type Periode = "semaine" | "mois" | "annee";

export const PERIODES: Array<{ cle: Periode; label: string; detail: string }> = [
  { cle: "semaine", label: "Semaine", detail: "7 derniers jours" },
  { cle: "mois", label: "Mois", detail: "30 derniers jours" },
  { cle: "annee", label: "Année", detail: "12 derniers mois" },
];

const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 4 octobre 2026 » — calculé depuis la chaîne ISO, jamais via le fuseau. */
export function dateLongue(cle: string): string {
  const jour = Number(cle.slice(8, 10));
  const mois = MOIS_FR[Number(cle.slice(5, 7)) - 1] ?? "";
  return `${jour} ${mois} ${cle.slice(0, 4)}`;
}

/** « octobre 2026 » pour les agrégats mensuels. */
function moisLong(cle: string): string {
  const mois = MOIS_FR[Number(cle.slice(5, 7)) - 1] ?? "";
  return `${mois} ${cle.slice(0, 4)}`;
}

export type Point = {
  /** Clé unique : `AAAA-MM-JJ` (jours) ou `AAAA-MM` (mois). */
  cle: string;
  /** Libellé court sous l'axe : « 05/10 » ou « 10/26 ». */
  libelle: string;
  /** Intitulé complet : survol, tableau de valeurs, lecteur d'écran. */
  intitule: string;
  pages: number;
  chapitres: number;
};

export type ParJour = Array<{ date: string; pages: number; chapitres: number }>;

/** `n` jours consécutis se terminant aujourd'hui, trous compris. */
export function pointsJours(parJour: ParJour, n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const cle = new Date(Date.now() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const trouve = parJour.find((d) => d.date === cle);
    return {
      cle,
      libelle: `${cle.slice(8, 10)}/${cle.slice(5, 7)}`,
      intitule: dateLongue(cle),
      pages: trouve?.pages ?? 0,
      chapitres: trouve?.chapitres ?? 0,
    };
  });
}

/** 12 mois consécutifs se terminant sur le mois en cours. */
export function pointsMois(parJour: ParJour): Point[] {
  const maintenant = new Date();
  const annee = maintenant.getUTCFullYear();
  const mois = maintenant.getUTCMonth();
  return Array.from({ length: 12 }, (_, i) => {
    const cle = new Date(Date.UTC(annee, mois - (11 - i), 1)).toISOString().slice(0, 7);
    let pages = 0;
    let chapitres = 0;
    for (const jour of parJour) {
      if (jour.date.slice(0, 7) !== cle) continue;
      pages += jour.pages;
      chapitres += jour.chapitres;
    }
    return {
      cle,
      libelle: `${cle.slice(5, 7)}/${cle.slice(2, 4)}`,
      intitule: moisLong(cle),
      pages,
      chapitres,
    };
  });
}

/* ── Formatage ─────────────────────────────────────────────────────────── */

/** Virgule décimale française sans dépendre du fuseau du navigateur. */
export function decimal(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/* ── Régularité (« … régularité ») ─────────────────────────────────── */

export type Regularite = {
  /** Jours avec au moins une page, sur les 30 derniers jours. */
  joursActifs30: number;
  /** Jours avec au moins une page, sur les 12 derniers mois. */
  joursActifs12Mois: number;
  /** Plus longue série ininterrompue de jours de lecture. */
  meilleureSerie: number;
  derniereLecture: string | null;
  /** 30 derniers jours, pour la grille visuelle (détail en texte à côté). */
  grille: Array<{ date: string; actif: boolean }>;
};

export function computeRegularite(parJour: ParJour): Regularite {
  const limite30 = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const limiteAn = new Date(Date.now() - 364 * 86_400_000).toISOString().slice(0, 10);
  const actifs = new Set(parJour.map((j) => j.date));

  let joursActifs30 = 0;
  let joursActifs12Mois = 0;
  for (const date of actifs) {
    if (date >= limite30) joursActifs30 += 1;
    if (date >= limiteAn) joursActifs12Mois += 1;
  }

  // Meilleure série de jours consécutifs : `par_jour` est trié par date.
  let meilleureSerie = 0;
  let courante = 0;
  let precedent: string | null = null;
  for (const jour of parJour) {
    const ecart =
      precedent === null
        ? Number.NaN
        : Date.parse(`${jour.date}T00:00:00Z`) - Date.parse(`${precedent}T00:00:00Z`);
    courante = ecart === 86_400_000 ? courante + 1 : 1;
    if (courante > meilleureSerie) meilleureSerie = courante;
    precedent = jour.date;
  }

  const grille = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, actif: actifs.has(date) };
  });

  return {
    joursActifs30,
    joursActifs12Mois,
    meilleureSerie,
    derniereLecture: parJour.length > 0 ? parJour[parJour.length - 1].date : null,
    grille,
  };
}
