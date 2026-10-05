import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listSessions, revokeAllSessions } from "@/lib/data/sessions";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Sessions du compte (§6.8 « Réglages : … sessions »).
 *
 * GET    — liste les sessions du compte connecté (métadonnées seules).
 * DELETE — révoque toutes les sessions, la session locale comprise : la
 *          réponse referme le cookie et l'appareil est déconnecté.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }
  const sessions = await listSessions();
  return NextResponse.json({ ok: true, sessions });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`account:sessions:${user.id}:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  await revokeAllSessions();
  return NextResponse.json({ ok: true, deconnecte: true });
}
