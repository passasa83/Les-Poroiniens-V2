import "server-only";
import { randomBytes } from "node:crypto";

/**
 * Connexion Discord (OAuth2, flux « authorization code » géré par le site).
 *
 * Choix du client : pas de fournisseur OAuth déclaré dans la console
 * Appwrite — le site échange lui-même le code contre l'identité Discord,
 * puis ouvre une session Appwrite côté serveur (même mécanique que la
 * connexion e-mail/mot de passe : le jeton du cookie Appwrite est stocké
 * dans `lp_session`). Deux variables suffisent :
 *   - `DISCORD_CLIENT_ID`     : application Discord (portail développeur) ;
 *   - `DISCORD_CLIENT_SECRET` : secret de cette application ;
 * l'URI de redirection inscrite dans Discord est `discordCallbackUrl()`.
 *
 * Aucun secret n'est renvoyé au client : `state` (jeton anti-CSRF) et la
 * destination sont portés par un cookie httpOnly de 10 minutes, consommé
 * au retour du fournisseur.
 */

/** Identité Discord utile au site, déjà assainie côté serveur. */
export type DiscordIdentity = {
  /** Identifiant numérique immuable : clé de rapprochement du compte. */
  id: string;
  /** Pseudo conforme aux règles du site (6 à 20 lettres / chiffres). */
  pseudo: string;
  /** Nom d'affichage Discord (espaces et accents possibles). */
  nom: string;
  /** Adresse e-mail fournie par Discord, ou `null`. */
  email: string | null;
  /** `true` seulement si Discord confirme l'e-mail vérifié du compte. */
  emailVerifie: boolean;
};

/** Cookie de la demande en cours : usage unique, jamais exposé. */
export const OAUTH_COOKIE = "lp_discord";
export const OAUTH_TTL_SECONDS = 600;

export type EtatOAuth = {
  state: string;
  next: string;
  origine: string;
};

const API = "https://discord.com/api/v10";
const AUTHORIZE = "https://discord.com/oauth2/authorize";
const SCOPES = "identify email";

function variable(nom: string): string | null {
  const valeur = process.env[nom]?.trim();
  return valeur ? valeur : null;
}

/** Racine publique du site, sans slash final. */
function racine(): string | null {
  const valeur = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return valeur ? valeur : null;
}

/** URI de redirection : doit être inscrite à l'identique dans Discord. */
export function discordCallbackUrl(): string | null {
  const base = racine();
  return base ? `${base}/api/auth/discord/callback` : null;
}

/**
 * Configuration complète : les deux clés, l'URL publique du site et une
 * base Appwrite pour ouvrir la session. `APPWRITE_API_KEY` reprend le
 * critère de `appwriteMode()` (sans Appwrite, pas de session à ouvrir).
 */
export function discordConfigured(): boolean {
  return Boolean(
    variable("DISCORD_CLIENT_ID") &&
      variable("DISCORD_CLIENT_SECRET") &&
      discordCallbackUrl() &&
      process.env.APPWRITE_API_KEY,
  );
}

/** URL d'autorisation vers Discord, avec `state` anti-CSRF. */
export function discordAuthorizeUrl(state: string): string | null {
  const clientId = variable("DISCORD_CLIENT_ID");
  const redirect = discordCallbackUrl();
  if (!clientId || !redirect) return null;
  const url = new URL(AUTHORIZE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("state", state);
  // Consentement explicite à chaque connexion : jamais de jeton silencieux.
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

function sansSymboles(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function tronque(valeur: string, longueur: number): string {
  return Array.from(valeur).slice(0, longueur).join("");
}

/**
 * Pseudo du site à partir d'un compte Discord : mêmes règles que le
 * formulaire d'inscription (6 à 20 caractères, lettres et chiffres seuls),
 * unicité arbitrée ensuite par `loginWithDiscord`.
 */
export function pseudoDiscord(
  globalName: string | null,
  username: string | null,
  id: string,
): string {
  for (const source of [globalName, username]) {
    if (!source) continue;
    const base = tronque(sansSymboles(source).toLowerCase(), 20);
    if ([...base].length >= 6) return base;
  }
  // Source trop courte : on complète avec les chiffres de l'identifiant.
  const base =
    tronque(sansSymboles(globalName || username || "membre").toLowerCase(), 12) || "membre";
  const chiffres = (id.match(/\d+/g) || []).join("").slice(-8) || "0";
  let pseudo = tronque(`${base}${chiffres}`, 20);
  while ([...pseudo].length < 6) pseudo += "0";
  return pseudo;
}

/**
 * Libellé Appwrite posé sur le compte : seul repère qui survive à un
 * changement d'e-mail. Appwrite n'accepte que 1 à 36 caractères
 * alphanumériques — d'où la forme `discord<identifiant>` (17 à 20 chiffres).
 */
export function discordLabel(id: string): string {
  return `discord${id.replace(/[^0-9A-Za-z]/g, "")}`.slice(0, 36);
}

/**
 * Échange le code de retour contre l'identité Discord.
 * Réseau coupé, service injoignable, code refusé : `null` — le voyage
 * retour est court et le site préfère annoncer une indisponibilité
 * plutôt qu'une erreur détaillée.
 */
export async function exchangeDiscordCode(code: string): Promise<DiscordIdentity | null> {
  const clientId = variable("DISCORD_CLIENT_ID");
  const clientSecret = variable("DISCORD_CLIENT_SECRET");
  const redirect = discordCallbackUrl();
  if (!clientId || !clientSecret || !redirect) return null;

  let reponse: Response;
  try {
    reponse = await fetch(`${API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
        scope: SCOPES,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return null; // coupure réseau pendant l'échange
  }
  if (!reponse.ok) return null;

  const corps = (await reponse.json().catch(() => null)) as { access_token?: string } | null;
  const jeton = corps?.access_token;
  if (!jeton) return null;

  let profil: Response;
  try {
    profil = await fetch(`${API}/users/@me`, {
      headers: { Authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch {
    return null;
  }
  if (!profil.ok) return null;

  const utilisateur = (await profil.json().catch(() => null)) as
    | {
        id?: unknown;
        username?: unknown;
        global_name?: unknown;
        email?: unknown;
        verified?: unknown;
      }
    | null;
  if (!utilisateur || typeof utilisateur.id !== "string" || !utilisateur.id) return null;

  const username = typeof utilisateur.username === "string" ? utilisateur.username : null;
  const globalName =
    typeof utilisateur.global_name === "string" ? utilisateur.global_name : null;
  const email =
    typeof utilisateur.email === "string" && utilisateur.email.includes("@")
      ? utilisateur.email.trim().toLowerCase()
      : null;

  return {
    id: utilisateur.id,
    pseudo: pseudoDiscord(globalName, username, utilisateur.id),
    nom: (globalName || username || "").trim().slice(0, 60),
    email,
    emailVerifie: utilisateur.verified === true,
  };
}

/** Jeton aléatoire de la demande en cours (anti-CSRF). */
export function nouvelEtat(): string {
  return randomBytes(24).toString("hex");
}

/**
 * URL de retour en cas d'échec : la page d'origine avec le code d'erreur ;
 * hors `/connexion`, la modale d'authentification est rouverte pour que le
 * message soit vu (l'origine vient de `Referer`, jamais d'une saisie).
 */
export function retourErreur(origine: string, code: string): string {
  const chemin =
    origine.startsWith("/") && !origine.startsWith("//") && !origine.startsWith("/\\")
      ? origine
      : "/connexion";
  const url = new URL(chemin, "https://site-interne.invalid");
  url.searchParams.set("erreur", code);
  if (url.pathname !== "/connexion" && !url.searchParams.has("auth")) {
    url.searchParams.set("auth", "connexion");
  }
  return `${url.pathname}${url.search}`;
}
