import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { loginWithDiscord } from "@/lib/auth";
import { exchangeDiscordCode, retourErreur, OAUTH_COOKIE, type EtatOAuth } from "@/lib/discord";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Comparaison à temps constant du `state` (anti-CSRF). */
function memeChaine(a: string, b: string): boolean {
  const gauche = Buffer.from(a);
  const droite = Buffer.from(b);
  if (gauche.length === 0 || gauche.length !== droite.length) return false;
  return timingSafeEqual(gauche, droite);
}

/**
 * GET /api/auth/discord/callback — retour du fournisseur Discord.
 *
 * 1. cookie `state` consommé (usage unique, quel que soit le résultat) ;
 * 2. contrôle du `state` à temps constant puis de l'éventuel refus ;
 * 3. échange du code contre l'identité Discord (jetons jamais journalisés) ;
 * 4. session ouverte côté serveur, redirection vers la page voulue.
 *
 * Chaque échec renvoie un code court vers la page d'origine, jamais de
 * détail interne (voir `oauth-errors.ts` pour les messages affichés).
 */
export async function GET(request: Request) {
  const limite = rateLimit(`auth:discord:callback:${clientIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  const url = new URL(request.url);

  const store = await cookies();
  const brut = store.get(OAUTH_COOKIE)?.value ?? null;

  let etat: EtatOAuth | null = null;
  if (brut) {
    try {
      const lu = JSON.parse(brut) as EtatOAuth;
      if (
        typeof lu?.state === "string" &&
        typeof lu?.next === "string" &&
        typeof lu?.origine === "string"
      ) {
        etat = lu;
      }
    } catch {
      etat = null;
    }
  }

  const origine = etat?.origine ?? "/connexion";
  const echec = (code: string) => {
    const reponse = NextResponse.redirect(new URL(retourErreur(origine, code), url.origin), 302);
    // Usage unique : la demande est soldée, réussie ou non.
    reponse.cookies.set(OAUTH_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return reponse;
  };

  if (!limite.ok) return echec("trop");
  if (!etat) return echec("state");

  const state = url.searchParams.get("state");
  if (!state || !memeChaine(state, etat.state)) return echec("state");

  const refus = url.searchParams.get("error");
  if (refus) return echec(refus === "access_denied" ? "refuse" : "echec");

  const code = url.searchParams.get("code");
  if (!code) return echec("echec");

  const identite = await exchangeDiscordCode(code);
  if (!identite) return echec("dispo");

  const resultat = await loginWithDiscord(identite);
  if (!resultat.ok) return echec(resultat.code);

  const destination =
    etat.next.startsWith("/") && !etat.next.startsWith("//") && !etat.next.startsWith("/\\")
      ? etat.next
      : "/compte";
  const reponse = NextResponse.redirect(new URL(destination, url.origin), 302);
  reponse.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return reponse;
}
