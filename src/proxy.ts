import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const { pathname } = request.url ? new URL(request.url) : { pathname: "" };
  const needsAuth = PROTECTED.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!needsAuth) return NextResponse.next();

  if (!request.cookies.has("lp_session")) {
    const next = encodeURIComponent(`${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(new URL(`/connexion?next=${next}`, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|api/img).*)"],
};
