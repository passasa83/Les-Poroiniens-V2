/** Onglets de la page Mon compte (« Réglages »), partagés serveur/client. */
export const SECTIONS = [
  "profil",
  "preferences",
  "confidentialite",
  "sessions",
  "compte",
] as const;

export type SectionKey = (typeof SECTIONS)[number];

/**
 * Section demandée par `?section=` : toute valeur inconnue retombe sur
 * « profil » (pas d'erreur 400 pour un lien ancien ou un tapage d'URL).
 */
export function resolveSection(value: string | undefined): SectionKey {
  return SECTIONS.includes(value as SectionKey) ? (value as SectionKey) : "profil";
}
