import { z } from "zod";
import { appwriteMode } from "@/server/auth";
import { audit } from "@/lib/data/moderation";
import { adminClient, users } from "@/server/appwrite";
import { getDb, TABLES } from "@/server/db";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

const resetInput = z.object({
  userId: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(200),
});

/**
 * POST /api/owner/reset-password — réinitialisation manuelle (Gérant).
 * Aucun mail n'étant envoyé au lancement, l'admin saisit le nouveau
 * mot de passe et le communique hors ligne. Le mot de passe n'est jamais
 * journalisé.
 */
export const POST = route(
  {
    auth: "site_settings",
    forbidden: "Réinitialisation réservée au Gérant.",
    rateLimit: {
      key: "owner:reset-password",
      limit: 5,
      windowMs: 60_000,
      message: "Trop de réinitialisations en une minute.",
    },
    body: resetInput,
    invalidBody: "issue",
  },
  async ({ user, body, ip }) => {
    const { userId, password } = body;
    const db = getDb();

    if (appwriteMode()) {
      try {
        await users(adminClient()).updatePassword({ userId, password });
      } catch (err) {
        const status = (err as { code?: number; status?: number }).code;
        if (status === 404) fail(404, "Utilisateur Appwrite introuvable.", "not_found");
        fail(502, "Impossible de réinitialiser le mot de passe sur Appwrite.", "appwrite_error");
      }
    } else {
      const account = await db.get(TABLES.users, userId);
      if (!account) fail(404, "Compte introuvable.", "not_found");
      await db.update(TABLES.users, userId, { password });
    }

    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "user.password_reset",
      cible: `user:${userId}`,
      avant: null,
      apres: { mot_de_passe: "réinitialisé (valeur non journalisée)" },
      ip,
    });

    return Response.json({ ok: true });
  },
);
