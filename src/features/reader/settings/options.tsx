import { Columns2, Rows3, Square } from "lucide-react";
import type { ReactNode } from "react";
import type { ReaderFit, ReaderMode, ReaderTheme } from "../types";

/** Libellés des réglages, partagés par la sidebar et le tiroir. */

export const READER_MODES: Array<{
  key: ReaderMode;
  label: string;
  aria: string;
  icon: ReactNode;
}> = [
  {
    key: "vertical",
    label: "Webtoon",
    aria: "Mode webtoon (défilement vertical)",
    icon: <Rows3 className="size-4" />,
  },
  { key: "single", label: "Page", aria: "Mode page par page", icon: <Square className="size-4" /> },
  {
    key: "double",
    label: "Double",
    aria: "Mode double page",
    icon: <Columns2 className="size-4" />,
  },
];

export const READER_FITS: Array<{ key: ReaderFit; label: string; aide: string }> = [
  { key: "auto", label: "Auto", aide: "Largeur naturelle de la zone de lecture." },
  {
    key: "originale",
    label: "Originale",
    aide: "Taille d'origine des pages, sans contrainte (défilement horizontal).",
  },
  { key: "largeur", label: "Largeur", aide: "Ajuste la largeur des pages (pourcentage)." },
  { key: "hauteur", label: "Hauteur", aide: "Une planche tient dans la hauteur de la fenêtre." },
  {
    key: "perso",
    label: "Personnalisé",
    aide: "Limites de largeur et de hauteur des pages, en pixels.",
  },
];

export const READER_THEMES: Array<{ key: ReaderTheme; label: string }> = [
  { key: "site", label: "Défaut du site" },
  { key: "clair", label: "Clair" },
  { key: "noir", label: "Noir" },
];
