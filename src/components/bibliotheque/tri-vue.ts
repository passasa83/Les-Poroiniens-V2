/**
 * Tri et vue de la bibliothèque.
 *
 * Module **partagé** (sans directive `use client`) : les valeurs, les libellés
 * et les garde-fous sont lus par la page serveur `/bibliotheque` autant que par
 * la barre d'outils cliente. Un type ou une fonction exportée depuis un module
 * client ne peut pas être appelée côté serveur (erreur Next 16 au rendu).
 */

/** Tri de la bibliothèque : dernière lecture, nouveautés, titre, note. */
export type TriBiblio = "lecture" | "nouveautes" | "titre" | "note";
/** Vue de la bibliothèque : liste (par défaut) ou grille. */
export type VueBiblio = "liste" | "grille";

export const TRIS_BIBLIO: Array<{ value: TriBiblio; label: string }> = [
  { value: "lecture", label: "Dernière lecture" },
  { value: "nouveautes", label: "Nouveautés" },
  { value: "titre", label: "Titre" },
  { value: "note", label: "Note" },
];

export function isTriBiblio(value: string | undefined): value is TriBiblio {
  return TRIS_BIBLIO.some((tri) => tri.value === value);
}

export function isVueBiblio(value: string | undefined): value is VueBiblio {
  return value === "liste" || value === "grille";
}
