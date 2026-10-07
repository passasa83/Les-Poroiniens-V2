import { NextResponse } from "next/server";
import {
  discordAuthorizeUrl,
  discordConfigured,
  nouvelEtat,
  retourErreur,
  OAUTH_COOKIE,
  OAUTH_TTL_SECONDS,
  type EtatOAuth,
} from "@/lib/discord";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** `next` n'est accepté que s'il pointe vers une page interne du site. */
function safeNext(valeur: string | null): string {
  if (!valeur) return "/compte";
  if (!valeur.startsWith("/") || valeur.startsWith("//") || valeur.startsWith("/\\")) {
    return "/compte";
  }
  return valeur;
}

/**
 * Page d'où le bouton a été cliqué (où l'échec sera annoncé).
 * Le `Referer` est interne seulement : une origine étrangère retombe sur
 * `/connexion`.
 */
function origineDepuis(request: Request, origineSite: string): string {
  const referer = request.headers.get("referer");
  if (!referer) return "/connexion";
  try {
    const url = new URL(referer);
    if (url.origin !== origineSite) return "/connexion";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/connexion";
  }
}

/**
 * GET /api/auth/discord/start — première étape de la connexion Discord.
 *
 * 10 demandes / minute / IP. Pose le cookie `state` (10 min, httpOnly,
 * usage unique) puis renvoie le navigateur vers l'autorisation Discord.
 * Un échec ne donne jamais de page en dur : retour à l'origine avec un
 * code court, affiché par le formulaire ou la modale.
 */
export async function GET(request: Request) {
  const limite = rateLimit(`auth:discord:start:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  const url = new URL(request.url);
  const origine = origineDepuis(request, url.origin);
  const echec = (code: string) =>
    NextResponse.redirect(new URL(retourErreur(origine, code), url.origin), 302);

  if (!limite.ok) return echec("trop");
  if (!discordConfigured()) return echec("config");

  const state = nouvelEtat();
  const destination = discordAuthorizeUrl(state);
  if (!destination) return echec("config");

  const etat: EtatOAuth = {
    state,
    next: safeNext(url.searchParams.get("next")),
    origine,
  };
  const reponse = NextResponse.redirect(destination, 302);
  reponse.cookies.set(OAUTH_COOKIE, JSON.stringify(etat), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_TTL_SECONDS,
  });
  return reponse;
}
