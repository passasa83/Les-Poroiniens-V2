import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/data/moderation";
import { getProfile, setRole } from "@/lib/data/users";
import { getDb, TABLES } from "@/lib/db";
import type { Profile, Role } from "@/lib/types";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

const patchInput = z
  .object({
    userId: z.string().trim().min(1).max(64),
    role: z.enum(["membre", "modo", "admin", "owner"]).optional(),
    banni: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.banni !== undefined, {
    message: "Aucune modification fournie.",
  });

/** Profil avec le champ `banni` stocké en plus du modèle public `Profile`. */
type ProfileRow = Profile & { banni?: boolean };

/**
 * PATCH /api/admin/users — changement de rôle et bannissement (admin+).
 *
 * Matrice 4.3 :
 * - l'admin peut attribuer/retirer `modo` et `membre` ;
 * - nommer ou retirer un `admin` / `owner` est réservé au Gérant ;
 * - personne ne peut se modifier soi-même (pas d'auto-dégradation).
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "manage_users")) {
    return jsonError("Réservé aux administrateurs.", "forbidden", 403);
  }

  const ip = clientIp(request);
  const limit = rateLimit(`admin:users:patch:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }

  const parsed = patchInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }

  const { userId, role, banni } = parsed.data;
  const isOwner = user.role === "owner";

  if (userId === user.id) {
    return jsonError(
      "Impossible de modifier son propre compte depuis cette page.",
      "self_modification",
      403,
    );
  }

  const target = (await getProfile(userId)) as ProfileRow | null;
  if (!target) return jsonError("Utilisateur introuvable.", "not_found", 404);

  const targetRole = (target.role ?? "membre") as Role;

  if (role !== undefined && role !== targetRole) {
    const promotesToHighRole = role === "admin" || role === "owner";
    const touchesHighRole = targetRole === "admin" || targetRole === "owner";
    if (!isOwner && (promotesToHighRole || touchesHighRole)) {
      return jsonError(
        "Seul le Gérant peut modifier les rôles Administrateur ou Gérant.",
        "name_admin_reserved",
        403,
      );
    }
  }

  const before = { role: targetRole, banni: Boolean(target.banni) };

  if (role !== undefined && role !== targetRole) {
    await setRole(userId, role);
  }

  let after = { role: role ?? targetRole, banni: before.banni };
  if (banni !== undefined && banni !== before.banni) {
    // `banni` fait hors de `Profile` : écriture directe sur la collection profiles.
    await getDb().update<ProfileRow>(TABLES.profiles, userId, { banni });
    after = { ...after, banni };
  }

  await audit({
    actorId: user.id,
    actorPseudo: user.pseudo,
    action:
      role !== undefined && role !== targetRole
        ? "user.role"
        : banni === undefined
          ? "user.update"
          : banni
            ? "user.ban"
            : "user.unban",
    cible: `user:${userId}`,
    avant: before,
    apres: after,
    ip,
  });

  const updated = (await getProfile(userId)) as ProfileRow | null;
  return Response.json({
    ok: true,
    profile: updated
      ? {
          user_id: updated.user_id,
          pseudo: updated.pseudo,
          role: updated.role,
          banni: Boolean(updated.banni),
        }
      : null,
  });
}
