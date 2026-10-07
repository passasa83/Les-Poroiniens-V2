import { NextResponse, type NextRequest } from "next/server";
import { getChapter } from "@/lib/data/chapters";
import { getSeriesBySlug } from "@/lib/data/series";

/**
 * Proxy Next 16 (ex-middleware) : contrôle d'accès rapide sur les routes
 * privées. Les vérifications de rôle fine et +18 restent côté serveur, dans
 * les layouts/pages et les routes API (jamais de confiance au client).
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

/* ── Vrai 404 (§6.12) ────────────────────────────────────────────────────── */

/**
 * Chemin volontairement non routé : Next y rend `app/not-found.tsx` (layout
 * complet, charte du site) **avec un statut HTTP 404 réel**. C'est le seul
 * moyen d'obtenir un 404 non streamé sans toucher au rendu des pages
 * existantes : sous streaming, `notFound()` laisse un statut 200 (cf. README,
 * « 404 streamés ») que l'on compensait jusqu'ici par un simple `noindex`.
 */
const INTROUVABLE = "/__lp_page_introuvable__";

/** `/serie/{slug}` et `/serie/{slug}/chapitre-{n}` (ou `/serie/{slug}/{n}`). */
const SERIE_ROUTE = /^\/serie\/([^/]+)(?:\/([^/]+))?$/;

/** `10`, `8.5`, `chapitre-10`, `chapitre-8.5` → nombre fini strictement
 *  positif (`numero` est un `double` en base). Le proxy doit accepter les
 *  décimaux, sinon leurs URLs basculent en 404 réel (§6.12). */
function parseNumero(segment: string | null): number | null {
  if (segment === null) return null;
  const value = segment.replace(/^chapitre-/i, "");
  const numero = Number(value);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}

/**
 * Cache court des résultats d'existence : le catalogue déclenche une requête
 * par lien prefetché, on ne doit pas multiplier les allers-retours base.
 * Positif 60 s (création rarement suivie d'un lien immédiat), négatif 10 s
 * (une publication récente ne doit pas rester « introuvable » longtemps).
 */
const TTL_POSITIF = 60_000;
const TTL_NEGATIF = 10_000;
const MAX_ENTREES = 500;
const existence = new Map<string, { expires: number; absent: boolean }>();

function enCache(cle: string): boolean | null {
  const hit = existence.get(cle);
  return hit && hit.expires > Date.now() ? hit.absent : null;
}

function metEnCache(cle: string, absent: boolean): void {
  if (existence.size >= MAX_ENTREES) existence.clear();
  existence.set(cle, {
    absent,
    expires: Date.now() + (absent ? TTL_NEGATIF : TTL_POSITIF),
  });
}

/**
 * Contrôle d'existence avant rendu : renvoie `true` uniquement quand la
 * ressource est **absente**. Tout doute (base indisponible, segment illisible)
 * laisse la main au rendu normal : la page ne doit jamais disparaître à cause
 * d'une erreur technique, et `loading.tsx` / la reprise de lecture ne sont pas
 * concernés (la page réelle n'est pas modifiée).
 */
async function ressourceAbsente(pathname: string): Promise<boolean> {
  const match = SERIE_ROUTE.exec(pathname);
  if (!match) return false;

  const slug = decode(match[1]);
  const segment = match[2] === undefined ? null : decode(match[2]);
  if (!slug) return false;

  const numero = parseNumero(segment);
  // Segment non numérique : aucune page de chapitre ne peut correspondre.
  if (segment !== null && numero === null) return true;

  const cle = `${slug}/${numero ?? ""}`;
  const hit = enCache(cle);
  if (hit !== null) return hit;

  try {
    const serie = await getSeriesBySlug(slug);
    const chapitreOk = serie && numero !== null ? await getChapter(serie.id, numero) : null;
    const absent = !serie || (numero !== null && !chapitreOk);
    metEnCache(cle, absent);
    return absent;
  } catch {
    // Fail-open : sans base, on sert la page (qui affichera son propre état).
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.url ? new URL(request.url) : { pathname: "" };
  const needsAuth = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (needsAuth) {
    if (!request.cookies.has("lp_session")) {
      const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(new URL(`/connexion?next=${next}`, request.url));
    }
    return NextResponse.next();
  }

  // §11 : +18 réservé aux membres. Sans cookie de session, l'utilisateur
  // est forcément visiteur → redirection immédiate vers la connexion. (Un
  // redirect() dans la page arriverait trop tard : le layout a déjà streamé
  // l'en-tête en 200.) Avec cookie, la page tranche (session expirée ou
  // membre sans opt-in → modale adaptée, jamais de contenu servi).
  if (pathname.startsWith("/serie/") && !request.cookies.has("lp_session")) {
    const match = SERIE_ROUTE.exec(pathname);
    const slug = match ? decode(match[1]) : "";
    if (slug) {
      try {
        const serie = await getSeriesBySlug(slug);
        if (serie && serie.classification === "adult") {
          const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);
          return NextResponse.redirect(new URL(`/connexion?next=${next}`, request.url));
        }
      } catch {
        // Fail-open : sans base, on sert la page (qui affichera son propre état).
      }
    }
  }

  // §6.12 : série ou chapitre inexistant → 404 réel (voir INTROUVABLE).
  if (pathname.startsWith("/serie/") && (await ressourceAbsente(pathname))) {
    return NextResponse.rewrite(new URL(INTROUVABLE, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|api/img).*)"],
};
