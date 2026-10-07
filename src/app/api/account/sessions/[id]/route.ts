import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revokeSession } from "@/lib/data/sessions";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * DELETE /api/account/sessions/[id] — révoque une session du compte.
 * Identifiant inconnu → 404 ; la session courante referme aussi le cookie de
 * l'appareil. L'identité vient de la session serveur, jamais du client.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`account:session:${user.id}:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const { id } = await params;
  const result = await revokeSession(id);
  if (!result.ok) {
    if (result.code === "inconnue") {
      return NextResponse.json(
        { error: "Session introuvable.", code: "not_found" },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Impossible de révoquer cette session.", code: "error" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, courante: result.courante });
}
