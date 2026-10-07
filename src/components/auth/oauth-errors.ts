/**
 * Retours du parcours Discord (module partagé serveur + client, sans
 * dépendance) : le serveur produit un code court dans l'URL de retour,
 * la page ou la modale l'affiche en clair — jamais de détail interne.
 */
export const DISCORD_ECHECS: Record<string, string> = {
  config: "La connexion Discord n'est pas encore activée sur le site.",
  refuse: "Connexion Discord annulée : l'autorisation n'a pas été donnée.",
  state: "La demande de connexion a expiré. Réessayez.",
  dispo: "Discord est injoignable pour le moment. Réessayez dans quelques instants.",
  trop: "Trop de tentatives récentes. Réessayez dans quelques instants.",
  echec: "Connexion Discord impossible pour le moment. Réessayez plus tard.",
};

/** Message affichable pour un code de retour, `null` si absent/inconnu. */
export function messageDiscord(code?: string | null): string | null {
  if (!code) return null;
  return DISCORD_ECHECS[code] ?? DISCORD_ECHECS.echec;
}
