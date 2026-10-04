import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clearHistory } from "@/lib/data/library";
import { getDb, TABLES } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { HistoryEntry } from "@/lib/types";

/**
 * DELETE /api/reading/history — suppression d'une entrée (`?entry={chapter_id}`)
 * ou de tout l'historique (§7.3). L'appartenance est vérifiée côté serveur :
 * l'identifiant est préfixé par l'identité de session, jamais par le client.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`history:${user.id}:${clientIp(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de suppressions. Réessayez dans un instant.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const db = getDb();
  const entry = new URL(request.url).searchParams.get("entry");

  if (entry) {
    const row = await db.get<HistoryEntry>(TABLES.history, `${user.id}-${entry}`);
    if (!row || row.user_id !== user.id) {
      return NextResponse.json(
        { error: "Entrée introuvable.", code: "not_found" },
        { status: 404 },
      );
    }
    await db.remove(TABLES.history, `${user.id}-${entry}`);
    return NextResponse.json({ ok: true, supprimes: 1 });
  }

  await clearHistory(user.id);
  return NextResponse.json({ ok: true, supprimes: "tous" });
}
