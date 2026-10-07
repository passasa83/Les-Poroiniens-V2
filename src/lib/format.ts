/** Formatage des temps relatifs (« il y a 6 h »), côté serveur et client. */
import type { Unite } from "@/lib/types";

/**
 * Libellés d'unité de lecture : une série en tomes affiche « Tome 3 » là où
 * une série classique affiche « Chapitre 3 ». Une valeur absente (lignes créées
 * avant la colonne `series.unite`) vaut toujours « chapitre ».
 */
function motUnite(unite?: Unite | null): string {
  return unite === "tome" ? "Tome" : "Chapitre";
}

/** « Chapitre » / « Tome » — singulier, sans numéro. */
export function libelleUniteSingulier(unite?: Unite | null): string {
  return motUnite(unite);
}

/** « Chapitre 12 » / « Tome 12 » — titres, en-têtes, métadonnées SEO. */
export function libelleUnite(
  numero: number | string | null | undefined,
  unite?: Unite | null,
): string {
  return `${motUnite(unite)} ${numero ?? ""}`.trim();
}

/** « Ch. 12 » / « Tome 12 » — colonne étroite des listes de chapitres. */
export function libelleCourt(
  numero: number | string | null | undefined,
  unite?: Unite | null,
): string {
  return unite === "tome" ? `Tome ${numero ?? ""}`.trim() : `Ch. ${numero ?? ""}`.trim();
}

/** « Chapitre précédent » / « Tome suivant » — navigation du lecteur. */
export function libelleVoisin(sens: "précédent" | "suivant", unite?: Unite | null): string {
  return `${motUnite(unite)} ${sens}`;
}

/** « Chapitres » / « Tomes » — titres de section et étiquettes de tuile. */
export function libelleUnitesPluriel(unite?: Unite | null): string {
  return `${motUnite(unite)}s`;
}

/** « 3 chapitres » / « 8 tomes » — compteurs (singulier à l'unité). */
export function compteUnites(nb: number, unite?: Unite | null): string {
  const mot = motUnite(unite).toLowerCase();
  return `${nb} ${mot}${nb === 1 ? "" : "s"}`;
}

/** « Chapitre 8 » / « Tome 8 » / « Ch. 8 » écrit comme titre par défaut. */
const TITRE_PAR_DEFAUT = /^(chapitre|tome|ch\.?)\s*[\d.,]+$/i;

/**
 * Titre affiché d'une unité : un titre par défaut est réécrit avec
 * l'organisation **courante** de la série, un titre saisi par le Gérant est
 * affiché tel quel. Une série basculée en tomes n'affiche donc plus
 * « Chapitre 8 » à côté de « Tome 8 » — sans toucher aux données.
 */
export function titreUnite(
  numero: number | string | null | undefined,
  titre: string | null | undefined,
  unite?: Unite | null,
): string {
  const brut = (titre ?? "").trim();
  if (TITRE_PAR_DEFAUT.test(brut)) return libelleUnite(numero, unite);
  return brut || libelleUnite(numero, unite);
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} j`;

  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(days / 365);
  return `il y a ${years} an${years > 1 ? "s" : ""}`;
}

/** Date courte : relatif sous 7 jours, date complète au-delà. */
export function dateOrRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const days = (Date.now() - date.getTime()) / 86_400_000;
  return days >= 0 && days < 7 ? relativeTime(iso) || "" : date.toLocaleDateString("fr-FR");
}

/** Durée en minutes → « 45 min », « 2 h 30 » (temps de lecture estimé). */
export function duree(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "0 min";
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** Synthèse d'un texte long pour les aperçus (synopsis du héros). */
export function plainText(raw: string | null | undefined, max = 180): string {
  const clean = (raw ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
