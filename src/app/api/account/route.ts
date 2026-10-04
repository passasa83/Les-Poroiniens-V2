import { NextResponse } from "next/server";
import { adminClient, avatarBucket, storage, users } from "@/lib/appwrite";
import { getCurrentUser, logout } from "@/lib/auth";
import { audit } from "@/lib/data/moderation";
import { clearHistory, listLibrary } from "@/lib/data/library";
import { getProfile } from "@/lib/data/users";
import { dataMode, getDb, rowId, TABLES } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import type { Comment, Notification } from "@/lib/types";

/** Supprime l'éventuel fichier d'avatar Appwrite (RGPD : aucune donnée résiduelle). */
async function deleteAvatarFile(avatar: string | null): Promise<void> {
  if (!avatar || avatar.startsWith("data:")) return;
  try {
    const pathname = new URL(avatar).pathname;
    const match = /\/files\/(.+?)\/preview/.exec(pathname);
    if (!match) return;
    await storage(adminClient()).deleteFile({
      bucketId: avatarBucket(),
      fileId: decodeURIComponent(match[1]),
    });
  } catch {
    /* fichier absent ou déjà supprimé */
  }
}

/**
 * DELETE /api/account — suppression de compte en libre-service (§7.1, RGPD §15).
 * Profil, bibliothèque et historique effacés ; commentaires ramenés au statut
 * « supprimé » (le fil de discussion est conservé, le contenu retiré) ; compte
 * Appwrite supprimé en mode production ; session détruite à la fin.
 */
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`account:delete:${user.id}:${clientIp(request)}`, {
    limit: 5,
    windowMs: 600_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez plus tard.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const db = getDb();
  const profile = await getProfile(user.id);

  // 1. Historique de lecture
  await clearHistory(user.id);

  // 2. Bibliothèque
  for (const entry of await listLibrary(user.id)) {
    await db.remove(TABLES.library, rowId(user.id, entry.series_id));
  }

  // 3. Commentaires : contenu retiré, structure conservée (§8)
  const { items: comments } = await db.list<Comment>(TABLES.comments, {
    filters: [{ field: "user_id", op: "eq", value: user.id }],
    limit: 1000,
  });
  for (const comment of comments) {
    await db.update<Comment>(TABLES.comments, comment.id, { statut: "supprime" });
  }

  // 4. Notifications
  const { items: notifications } = await db.list<Notification>(TABLES.notifications, {
    filters: [{ field: "user_id", op: "eq", value: user.id }],
    limit: 500,
  });
  for (const notification of notifications) {
    await db.remove(TABLES.notifications, notification.id);
  }

  // 5. Journal d'audit, avant toute suppression de profil
  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action: "account_delete",
    cible: user.id,
    ip: clientIp(request),
  });

  // 6. Profil + compte
  if (dataMode() === "appwrite") {
    await deleteAvatarFile(profile?.avatar ?? user.avatar);
    try {
      await users(adminClient()).delete({ userId: user.id });
    } catch {
      /* le compte a pu être supprimé entre-temps */
    }
    await db.remove(TABLES.profiles, user.id);
  } else {
    await db.remove(TABLES.profiles, user.id);
    await db.remove(TABLES.users, user.id);
  }

  // 7. Session détruite
  await logout();

  return NextResponse.json({ ok: true });
}
