import { NextResponse } from "next/server";
import { clearHistory } from "@/lib/data/history";
import { getDb, rowId, TABLES } from "@/server/db";
import { fail, route } from "@/server/http";

/**
 * DELETE /api/reading/history — suppression d'une entrée (`?entry={chapter_id}`)
 * ou de tout l'historique. L'appartenance est vérifiée côté serveur :
 * l'identifiant est préfixé par l'identité de session, jamais par le client.
 */
export const DELETE = route(
  {
    auth: "user",
    rateLimit: {
      key: "history",
      by: "ip+user",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de suppressions. Réessayez dans un instant.",
    },
  },
  async ({ request, user }) => {
    const db = getDb();
    const entry = new URL(request.url).searchParams.get("entry");

    if (entry) {
      const row = await db.get(TABLES.history, rowId(user.id, entry));
      if (!row || row.user_id !== user.id) {
        fail(404, "Entrée introuvable.", "not_found");
      }
      await db.remove(TABLES.history, rowId(user.id, entry));
      return NextResponse.json({ ok: true, supprimes: 1 });
    }

    await clearHistory(user.id);
    return NextResponse.json({ ok: true, supprimes: "tous" });
  },
);
