/**
 * Vues de la modale d'authentification :
 * « depuis n'importe quelle page (connexion, inscription, mot de passe oublié) ».
 *
 * Module sans composant : partagé par les liens de déclenchement et la modale.
 * `openAuthModal` n'est appelé que depuis un gestionnaire d'événement côté
 * client (la garde `window` protège tout import accidentel côté serveur).
 */
export type AuthView = "connexion" | "inscription" | "oublie";

export const AUTH_VIEWS: readonly AuthView[] = ["connexion", "inscription", "oublie"] as const;

/** Nom de l'événement global qui ouvre la modale. */
export const AUTH_MODAL_EVENT = "lp:open-auth-modal";

export function isAuthView(value: unknown): value is AuthView {
  return typeof value === "string" && (AUTH_VIEWS as readonly string[]).includes(value);
}

/** Ouvre la modale d'authentification depuis n'importe quel composant client. */
export function openAuthModal(view: AuthView = "connexion"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(AUTH_MODAL_EVENT, { detail: view }));
}

/** Libellés des onglets / titres de la modale. */
export const AUTH_VIEW_LABELS: Record<AuthView, string> = {
  connexion: "Connexion",
  inscription: "Inscription",
  oublie: "Mot de passe oublié",
};
