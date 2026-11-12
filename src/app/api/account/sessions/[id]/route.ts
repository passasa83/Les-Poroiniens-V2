import { revokeSession } from "@/lib/data/sessions";
import { fail, route } from "@/server/http";

/**
 * DELETE /api/account/sessions/[id] — révoque une session du compte.
 * Identifiant inconnu → 404 ; la session courante referme aussi le cookie de
 * l'appareil. L'identité vient de la session serveur, jamais du client.
 */
export const DELETE = route(
  {
    auth: "user",
    rateLimit: {
      key: "account:session",
      by: "ip+user",
      limit: 10,
      windowMs: 60_000,
      message: "Trop de tentatives. Réessayez plus tard.",
    },
  },
  async ({ params }) => {
    const result = await revokeSession(params.id);
    if (!result.ok) {
      if (result.code === "inconnue") fail(404, "Session introuvable.", "not_found");
      fail(502, "Impossible de révoquer cette session.", "error");
    }
    return Response.json({ ok: true, courante: result.courante });
  },
);
