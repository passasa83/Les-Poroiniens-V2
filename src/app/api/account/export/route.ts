import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { computeStats, listHistory, listLibrary } from "@/lib/data/library";
import { getProfile } from "@/lib/data/users";
import { getDb, TABLES } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Comment } from "@/lib/types";

/** GET /api/account/export — export complet des données personnelles (RGPD §15). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`account:export:${user.id}:${clientIp(request)}`, {
    limit: 5,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop d'exports récents. Réessayez dans un instant.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const [profile, bibliotheque, historique, statistiques] = await Promise.all([
    getProfile(user.id),
    listLibrary(user.id),
    listHistory(user.id, 1000),
    computeStats(user.id),
  ]);

  const { items: commentaires } = await getDb().list<Comment>(TABLES.comments, {
    filters: [{ field: "user_id", op: "eq", value: user.id }],
    order: { field: "created_at", dir: "desc" },
    limit: 1000,
  });

  const day = new Date().toISOString().slice(0, 10);
  return NextResponse.json(
    {
      format: "poroiniens/export/v1",
      exporte_le: new Date().toISOString(),
      utilisateur: {
        id: user.id,
        pseudo: user.pseudo,
        email: user.email,
        role: user.role,
        adulte: user.adult_ok,
      },
      profil: profile,
      bibliotheque,
      historique,
      commentaires,
      statistiques,
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="export-poroiniens-${day}.json"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
