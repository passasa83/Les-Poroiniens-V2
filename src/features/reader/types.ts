/** Types et bornes partagés par tout le lecteur de scans. */

export type ReaderMode = "vertical" | "single" | "double";
export type ReaderSens = "ltr" | "rtl";
/** Ajustement des pages dans la zone de lecture. */
export type ReaderFit = "auto" | "originale" | "largeur" | "hauteur" | "perso";
/** Thème appliqué au seul lecteur, le reste de la page garde le thème du site. */
export type ReaderTheme = "site" | "clair" | "noir";

export type ReaderPage = { index: number; url: string; largeur?: number; hauteur?: number };

/** Planche affichée : une page, ou deux en double page. */
export type Planche = { start: number; length: number };

export const MODES: readonly ReaderMode[] = ["vertical", "single", "double"];
export const SENS: readonly ReaderSens[] = ["ltr", "rtl"];
/** Ordre du bouton cyclique « Ajustement » de la sidebar. */
export const FITS: readonly ReaderFit[] = ["auto", "originale", "largeur", "hauteur", "perso"];
/** Ordre de la touche `T`. */
export const THEMES: readonly ReaderTheme[] = ["site", "clair", "noir"];

/** Bornes des réglages (ajustement « Personnalisé » : ancien lecteur). */
export const BOUNDS = {
  width: { min: 50, max: 100 },
  px: { min: 400, max: 3000 },
  brightness: { min: 0.6, max: 1.3 },
} as const;

export const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
