import "server-only";
import { getDb, listAll, parLots, TABLES } from "@/server/db";
import { cached, invalidate } from "@/server/cache";
import { newId } from "@/lib/ids";
import type { Notification } from "@/lib/types";

/** Notifications affichées (cloche de l'en-tête et page /notifications). */
const AFFICHEES = 50;

/**
 * Dernières notifications d'un membre. La cloche de l'en-tête est rendue à
 * chaque page : 30 s de cache valent un aller-retour de moins par
 * navigation ; `notify` et `markNotificationsRead` invalident la clé.
 */
export async function listNotifications(userId: string): Promise<Notification[]> {
  return cached(`notifications:${userId}`, 30_000, async () => {
    const { items } = await getDb().list(TABLES.notifications, {
      filters: [{ field: "user_id", op: "eq", value: userId }],
      order: { field: "created_at", dir: "desc" },
      limit: AFFICHEES,
    });
    return items;
  });
}

export async function notify(
  userId: string,
  type: Notification["type"],
  payload: Record<string, unknown>,
): Promise<void> {
  const n: Notification = {
    id: newId("n"),
    user_id: userId,
    type,
    payload,
    lu: false,
    created_at: new Date().toISOString(),
  };
  await getDb().create(TABLES.notifications, n.id, n);
  invalidate(`notifications:${userId}`);
}

/**
 * Marque lues **toutes** les notifications non lues (pas seulement les 50
 * affichées : sinon le compteur ne retombait jamais à zéro), lues en base
 * et non dans le cache, qui pourrait ignorer une notification récente.
 */
export async function markNotificationsRead(userId: string): Promise<void> {
  const nonLues = await listAll(TABLES.notifications, {
    filters: [
      { field: "user_id", op: "eq", value: userId },
      { field: "lu", op: "eq", value: false },
    ],
    select: ["user_id"],
  });
  await parLots(nonLues, (n) => getDb().update(TABLES.notifications, n.id, { lu: true }));
  invalidate(`notifications:${userId}`);
}

/** Suppression de compte : toutes les notifications du membre. */
export async function deleteNotifications(userId: string): Promise<void> {
  const toutes = await listAll(TABLES.notifications, {
    filters: [{ field: "user_id", op: "eq", value: userId }],
    select: ["user_id"],
  });
  await parLots(toutes, (n) => getDb().remove(TABLES.notifications, n.id));
  invalidate(`notifications:${userId}`);
}
