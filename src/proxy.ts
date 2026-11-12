import { NextResponse, type NextRequest } from "next/server";
import { getChapter } from "@/lib/data/chapters";
import { findSeriesBySlug } from "@/lib/data/series";

/**
 * Proxy Next 16 (ex-middleware).
 *
 * 1. Routes privées : redirection vers la connexion sans cookie de session.
 *    Rôles fins et +18 restent vérifiés côté serveur (pages, routes API).
 * 2. `/serie/*` chargé **en page complète** : vrai 404 pour une série ou un
 *    chapitre absent, et connexion exigée pour une série +18 sans session.
 *    Ces deux réponses doivent partir avant le streaming (après lui, le statut
 *    reste 200 — cf. doc Next « Status codes »).
 *
 * Les navigations client et les prefetch (en-têtes `rsc` /
 * `next-router-prefetch`) ne touchent jamais la base : la page y traite
 * elle-même l'absence (`notFound()`) et le +18 (porte floutée, aucun contenu
 * servi). Le catalogue prefetchait jusqu'ici une requête Appwrite par lien.
 */
const PROTECTED = [
  "/compte",
  "/bibliotheque",
  "/historique",
  "/statistiques",
  "/notifications",
  "/moderation",
  "/admin",
  "/gerant",
];

const SESSION_COOKIE = "lp_session";

/**
 * Chemin volontairement non routé : Next y rend `app/not-found.tsx` (layout
 * complet, charte du site) avec un statut HTTP 404 réel.
 */
const INTROUVABLE = "/__lp_page_introuvable__";

/** `/serie/{slug}` et `/serie/{slug}/chapitre-{n}` (ou `/serie/{slug}/{n}`). */
const SERIE_ROUTE = /^\/serie\/([^/]+)(?:\/([^/]+))?$/;

/** `10`, `8.5`, `chapitre-10`, `chapitre-8.5` → nombre fini strictement positif. */
function parseNumero(segment: string): number | null {
  const numero = Number(segment.replace(/^chapitre-/i, ""));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

/** Requête de navigation client ou de prefetch (charge utile RSC, pas un document). */
function isRouterRequest(request: NextRequest): boolean {
  return request.headers.has("rsc") || request.headers.has("next-router-prefetch");
}

/* ── Contrôle d'une page /serie/* ─────────────────────────────────────── */

type Verdict = { absent: boolean; adult: boolean };

/**
 * Cache court par instance : positif 60 s, négatif 10 s (une publication
 * récente ne doit pas rester « introuvable » longtemps).
 */
const TTL_POSITIF = 60_000;
const TTL_NEGATIF = 10_000;
const MAX_ENTREES = 500;
const verdicts = new Map<string, { expires: number; verdict: Verdict }>();

function verdictEnCache(cle: string): Verdict | null {
  const hit = verdicts.get(cle);
  return hit && hit.expires > Date.now() ? hit.verdict : null;
}

function mettreEnCache(cle: string, verdict: Verdict): void {
  if (verdicts.size >= MAX_ENTREES) verdicts.clear();
  verdicts.set(cle, {
    verdict,
    expires: Date.now() + (verdict.absent ? TTL_NEGATIF : TTL_POSITIF),
  });
}

/**
 * Verdict pour une URL de série, `null` en cas de doute (base indisponible,
 * URL hors motif) : la page s'affiche alors normalement — elle ne doit jamais
 * disparaître à cause d'une erreur technique.
 */
async function verdictSerie(pathname: string): Promise<Verdict | null> {
  const match = SERIE_ROUTE.exec(pathname);
  if (!match) return null;
  const slug = decode(match[1]);
  if (!slug) return null;
  const segment = match[2] === undefined ? null : decode(match[2]);
  const numero = segment === null ? null : parseNumero(segment);
  // Segment non numérique : aucune page de chapitre ne peut correspondre.
  if (segment !== null && numero === null) return { absent: true, adult: false };

  const cle = `${slug}/${numero ?? ""}`;
  const hit = verdictEnCache(cle);
  if (hit) return hit;

  try {
    const serie = await findSeriesBySlug(slug);
    const chapitre = serie && numero !== null ? await getChapter(serie.id, numero) : null;
    const verdict: Verdict = {
      absent: !serie || (numero !== null && !chapitre),
      adult: serie?.classification === "adult",
    };
    mettreEnCache(cle, verdict);
    return verdict;
  } catch {
    return null;
  }
}

function versConnexion(request: NextRequest, pathname: string): NextResponse {
  const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(new URL(`/connexion?next=${next}`, request.url));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const connecte = request.cookies.has(SESSION_COOKIE);

  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return connecte ? NextResponse.next() : versConnexion(request, pathname);
  }

  if (!pathname.startsWith("/serie/") || isRouterRequest(request)) return NextResponse.next();

  const verdict = await verdictSerie(pathname);
  if (!verdict) return NextResponse.next();
  if (verdict.absent) return NextResponse.rewrite(new URL(INTROUVABLE, request.url));
  // +18 réservé aux membres : sans session, l'utilisateur est forcément visiteur.
  if (verdict.adult && !connecte) return versConnexion(request, pathname);
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|api/img).*)"],
};
