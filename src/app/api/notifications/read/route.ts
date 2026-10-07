import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/data/moderation";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** POST /api/notifications/read — marque toutes les notifications comme lues. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`notifications:${user.id}:${clientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessayez dans un instant.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  await markNotificationsRead(user.id);
  return NextResponse.json({ ok: true });
}
