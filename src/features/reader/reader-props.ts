import type { Unite } from "@/lib/types";
import type { ReaderMode, ReaderPage, ReaderSens } from "./types";

/** Propriétés du lecteur de scans (page `/serie/[slug]/[n]`). */
export interface ReaderProps {
  pages: ReaderPage[];
  chapterId: string;
  chapterNumero: number;
  /** Titre du chapitre, affiché dans la sidebar. */
  chapterTitre?: string;
  /** Date de publication, affichée dans la sidebar (« il y a 3 j »). */
  chapitreDate?: string | null;
  serieId: string;
  serieSlug: string;
  serieTitre: string;
  /** Organisation de la série : « Tome 3 » au lieu de « Chapitre 3 ». */
  unite?: Unite | null;
  /** Chapitres de la série, pour le sélecteur de chapitre. */
  chapitres: Array<{ numero: number; href: string }>;
  initialMode?: ReaderMode;
  initialSens?: ReaderSens;
  initialPage?: number;
  canProgress?: boolean;
  /** Envoi des préférences au compte (fire-and-forget, débouncé). */
  canSync?: boolean;
  initialLikes?: number;
  prevHref?: string | null;
  nextHref?: string | null;
  /** Sert au préchargement de la première page du chapitre suivant. */
  nextChapterId?: string | null;
  /** Série +18 : le webtoon s'affiche sans espacement (motif de l'ancien site). */
  adult?: boolean;
}
