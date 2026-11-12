import type { LibraryDashboardRow } from "@/lib/data/library";
import type { LibraryStatus } from "@/lib/types";
import type { TriBiblio } from "@/components/bibliotheque/tri-vue";

export const STATUT_LABELS: Record<LibraryStatus, string> = {
  en_cours: "En cours",
  a_lire: "À lire",
  termine: "Terminé",
  en_pause: "En pause",
  abandonne: "Abandonné",
};

/** Onglets de la bibliothèque : Tout, statuts, Favoris. */
export type OngletBiblio = "tout" | LibraryStatus | "favoris";

export const ONGLETS: Array<{ cle: OngletBiblio; label: string }> = [
  { cle: "tout", label: "Tout" },
  { cle: "en_cours", label: "En cours" },
  { cle: "a_lire", label: "À lire" },
  { cle: "termine", label: "Terminé" },
  { cle: "en_pause", label: "En pause" },
  { cle: "abandonne", label: "Abandonné" },
  { cle: "favoris", label: "★ Favoris" },
];

export function titreDe(row: LibraryDashboardRow): string {
  return row.series?.titre ?? row.entry.series_id;
}

/** Tri : dernière lecture, nouveautés, titre, note. */
export const COMPARATEURS: Record<
  TriBiblio,
  (a: LibraryDashboardRow, b: LibraryDashboardRow) => number
> = {
  // Les séries jamais lues ferment la marche (chaîne vide avant les dates).
  lecture: (a, b) =>
    (b.derniereLecture ?? "").localeCompare(a.derniereLecture ?? "") ||
    b.entry.updated_at.localeCompare(a.entry.updated_at),
  // Nouveautés : dernière parution dans le catalogue, sinon mise à jour.
  nouveautes: (a, b) =>
    (b.derniereSortie ?? b.entry.updated_at).localeCompare(a.derniereSortie ?? a.entry.updated_at),
  titre: (a, b) => titreDe(a).localeCompare(titreDe(b), "fr"),
  note: (a, b) =>
    (b.entry.note ?? -1) - (a.entry.note ?? -1) || titreDe(a).localeCompare(titreDe(b), "fr"),
};
