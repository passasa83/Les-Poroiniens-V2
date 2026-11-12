/**
 * Authentification : session (cookie), utilisateur courant, connexion
 * e-mail/pseudo et Discord, porte +18. Serveur uniquement.
 */
export {
  ADULT_COOKIE,
  SESSION_COOKIE,
  appwriteMode,
  clearSessionCookie,
  getCurrentUser,
  setSessionCookie,
} from "./session";
export { login, logout, register, type AuthField, type AuthResult } from "./credentials";
export { loginWithDiscord, type DiscordLoginResult } from "./discord";
export { acceptAdultGate, adultGateAccepted } from "./adult";
export { ensureProfile, newProfile } from "./profile";
