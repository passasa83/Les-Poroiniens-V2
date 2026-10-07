import type { Unite } from "@/lib/types";

/**
 * Analyse des dossiers d'un dépôt NAS : le numéro d'unité contenu dans un nom
 * de dossier, et la nature de l'unité (chapitre classique ou tome).
 *
 * Le même module sert à l'écran d'import (`/api/owner/nas/scan`) et à
 * l'import lui-même (`/api/owner/import`) : les deux doivent parler de la
 * même unité, sinon la fiche série afficherait « Chapitre 3 » pour un tome.
 */

/** Nature d'un dossier repéré dans le dépôt. */
export type CandidateKind = "chapitre" | "volume" | "dossier";

/**
 * Lecture du numéro dans un nom de dossier :
 * `Chapitre 12`, `ch.12`, `Chapter 3`, `12` → entier ; `Tome 1` est signalé
 * comme volume (structure différente : les planches sont dans le dossier) ;
 * `Chapitre 8.5` est indéterminé (l'API n'accepte que des entiers).
 */
export function detectNumero(nom: string): { numero: number | null; kind: CandidateKind } {
  const clean = nom
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\[[^\]]*\]/g, " ")
    .trim();

  const num = (raw: string): number | null => {
    if (raw.includes(".") || raw.includes(",")) return null; // 8.5 → à saisir
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  const chapitre = clean.match(
    /\b(?:chapitre|chapter|chap|ch|partie|part|episode|ep)\b\s*[-_.:#\s]*(\d{1,4}(?:[.,]\d+)?)/i,
  );
  if (chapitre) return { numero: num(chapitre[1]), kind: "chapitre" };

  const volume = clean.match(/\b(?:tome|volume|vol|tom)\b\s*[-_.:#\s]*(\d{1,4}(?:[.,]\d+)?)/i);
  if (volume) return { numero: num(volume[1]), kind: "volume" };

  // Dossier purement numérique : `012`, `12`
  const seul = clean.match(/^(\d{1,4})$/);
  if (seul) return { numero: num(seul[1]), kind: "dossier" };

  // Le nombre terminal reste une hypothèse : `Scan 12`, `v2 12`…
  const terminal = clean.match(/(\d{1,4})$/);
  if (terminal) return { numero: num(terminal[1]), kind: "dossier" };

  return { numero: null, kind: "dossier" };
}

/** Un dossier « Tome 3 » produit une série organisée en tomes. */
export function uniteDeKind(kind: CandidateKind): Unite {
  return kind === "volume" ? "tome" : "chapitre";
}

/**
 * Structure dominante d'un dossier de série : « tomes » uniquement quand des
 * dossiers de tomes sont présents et aucun chapitre n'est mélangé (les
 * dépôts observés ne mélangent jamais les deux).
 */
export function uniteDominante(kinds: CandidateKind[]): Unite {
  const tomes = kinds.filter((kind) => kind === "volume").length;
  const chapitres = kinds.filter((kind) => kind === "chapitre").length;
  return tomes > 0 && chapitres === 0 ? "tome" : "chapitre";
}

/**
 * Nom de fichier ramené au nom du dossier qu'il couvre :
 * `Tome 1 LQ.jpg` → `tome 1` (extension et suffixe de qualité retirés).
 */
export function stemCouverture(nom: string): string {
  return nom
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s*[-_]?\s*\b(lq|hq|hd|sd|cover|couverture|thumb|vignette|mini)\b\s*$/i, "")
    .trim()
    .toLowerCase();
}
