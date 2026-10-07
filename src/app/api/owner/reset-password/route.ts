import { z } from "zod";
import { appwriteMode, getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/data/moderation";
import { adminClient, users } from "@/lib/appwrite";
import { getDb, TABLES } from "@/lib/db";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

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
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "site_settings")) {
    return jsonError("Réinitialisation réservée au Gérant.", "owner_only", 403);
  }

  const ip = clientIp(request);
  const limit = rateLimit(`owner:reset-password:${ip}`, { limit: 5, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop de réinitialisations en une minute.", "rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }
  const parsed = resetInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      parsed.error.issues[0]?.message ?? "Champs invalides.",
      "invalid_body",
      400,
    );
  }

  const { userId, password } = parsed.data;
  const db = getDb();

  if (appwriteMode()) {
    try {
      await users(adminClient()).updatePassword({ userId, password });
    } catch (err) {
      const status = (err as { code?: number; status?: number }).code;
      if (status === 404) return jsonError("Utilisateur Appwrite introuvable.", "not_found", 404);
      return jsonError(
        "Impossible de réinitialiser le mot de passe sur Appwrite.",
        "appwrite_error",
        502,
      );
    }
  } else {
    const account = await db.get<Record<string, unknown>>(TABLES.users, userId);
    if (!account) return jsonError("Compte introuvable.", "not_found", 404);
    await db.update<Record<string, unknown>>(TABLES.users, userId, { password });
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
}
