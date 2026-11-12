import type { Planche, ReaderPage } from "../types";

/** Une page est paysage quand sa largeur dépasse sa hauteur. */
export function isLandscape(page: ReaderPage | undefined): boolean {
  return Boolean(page?.largeur && page.hauteur && page.largeur > page.hauteur);
}

/**
 * Double page : planches à afficher, dans l'ordre de lecture. Une page
 * paysage occupe toujours sa planche ; sinon deux pages portrait se
 * suivent (motif de l'ancien site `buildSpreads`) ; `firstSolo` isole la
 * première page (réglage « première page seule »).
 */
export function buildSpreads(pages: ReaderPage[], firstSolo: boolean): Planche[] {
  const planches: Planche[] = [];
  let i = 0;
  if (firstSolo && pages.length > 0) {
    planches.push({ start: 0, length: 1 });
    i = 1;
  }
  while (i < pages.length) {
    if (isLandscape(pages[i])) {
      planches.push({ start: i, length: 1 });
      i += 1;
    } else if (i + 1 < pages.length && !isLandscape(pages[i + 1])) {
      planches.push({ start: i, length: 2 });
      i += 2;
    } else {
      planches.push({ start: i, length: 1 });
      i += 1;
    }
  }
  return planches;
}

/** Index de la planche contenant la page `index` (-1 si aucune). */
export function plancheAt(planches: Planche[], index: number): number {
  return planches.findIndex((p) => index >= p.start && index < p.start + p.length);
}

/** « Page 3 » ou « Page 3-4 » (sélecteur de la sidebar). */
export function plancheLabel(p: Planche): string {
  return p.length > 1 ? `Page ${p.start + 1}-${p.start + p.length}` : `Page ${p.start + 1}`;
}
