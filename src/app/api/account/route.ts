import { adminClient, avatarBucket, storage, users } from "@/server/appwrite";
import { logout } from "@/server/auth";
import { audit } from "@/lib/data/moderation";
import { clearHistory } from "@/lib/data/history";
import { clearLibrary } from "@/lib/data/library";
import { deleteNotifications } from "@/lib/data/notifications";
import { getProfile } from "@/lib/data/users";
import { dataMode, getDb, listAll, parLots, TABLES } from "@/server/db";
import { route } from "@/server/http";

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
 * DELETE /api/account — suppression de compte en libre-service (RGPD).
 * Profil, bibliothèque et historique effacés ; commentaires ramenés au statut
 * « supprimé » (le fil de discussion est conservé, le contenu retiré) ; compte
 * Appwrite supprimé en mode production ; session détruite à la fin.
 */
export const DELETE = route(
  {
    auth: "user",
    rateLimit: {
      key: "account:delete",
      by: "ip+user",
      limit: 5,
      windowMs: 600_000,
      message: "Trop de tentatives. Réessayez plus tard.",
    },
  },
  async ({ user, ip }) => {
    const db = getDb();
    const profile = await getProfile(user.id);

    /* 1–4. Historique, bibliothèque, commentaires, notifications : toutes
       les lignes (lues par lots, sans plafond — l'ancien `limit` laissait
       des données au-delà de 1000), écritures 10 par 10. */
    const comments = await listAll(TABLES.comments, {
      filters: [
        { field: "user_id", op: "eq", value: user.id },
        { field: "statut", op: "neq", value: "supprime" },
      ],
      select: ["user_id"],
    });
    await Promise.all([
      clearHistory(user.id),
      clearLibrary(user.id),
      // Commentaires : contenu retiré, structure du fil conservée.
      parLots(comments, (c) => db.update(TABLES.comments, c.id, { statut: "supprime" })),
      deleteNotifications(user.id),
    ]);

    // 5. Journal d'audit, avant toute suppression de profil
    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "account_delete",
      cible: user.id,
      ip,
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

    return Response.json({ ok: true });
  },
);
