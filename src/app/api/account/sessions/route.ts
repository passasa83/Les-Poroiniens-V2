import { listSessions, revokeAllSessions } from "@/lib/data/sessions";
import { route } from "@/server/http";

/**
 * Sessions du compte (« Réglages : … sessions »).
 *
 * GET    — liste les sessions du compte connecté (métadonnées seules).
 * DELETE — révoque toutes les sessions, la session locale comprise : la
 *          réponse referme le cookie et l'appareil est déconnecté.
 */
export const GET = route({ auth: "user" }, async () =>
  Response.json({ ok: true, sessions: await listSessions() }),
);

export const DELETE = route(
  {
    auth: "user",
    rateLimit: {
      key: "account:sessions",
      by: "ip+user",
      limit: 10,
      windowMs: 60_000,
      message: "Trop de tentatives. Réessayez plus tard.",
    },
  },
  async () => {
    await revokeAllSessions();
    return Response.json({ ok: true, deconnecte: true });
  },
);
