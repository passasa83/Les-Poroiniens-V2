import { z } from "zod";
import { audit } from "@/lib/data/moderation";
import { getProfile, setRole } from "@/lib/data/users";
import { getDb, TABLES } from "@/server/db";
import type { Profile, Role } from "@/lib/types";
import { fail, route } from "@/server/http";

export const runtime = "nodejs";

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
export const PATCH = route(
  {
    auth: "manage_users",
    forbidden: "Réservé aux administrateurs.",
    rateLimit: {
      key: "admin:users:patch",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de requêtes.",
    },
    body: patchInput,
    invalidBody: "issue",
  },
  async ({ user, body, ip }) => {
    const { userId, role, banni } = body;
    const isOwner = user.role === "owner";

    if (userId === user.id) {
      fail(403, "Impossible de modifier son propre compte depuis cette page.", "self_modification");
    }

    const target = (await getProfile(userId)) as ProfileRow | null;
    if (!target) fail(404, "Utilisateur introuvable.", "not_found");

    const targetRole = (target.role ?? "membre") as Role;

    if (role !== undefined && role !== targetRole) {
      const promotesToHighRole = role === "admin" || role === "owner";
      const touchesHighRole = targetRole === "admin" || targetRole === "owner";
      if (!isOwner && (promotesToHighRole || touchesHighRole)) {
        fail(
          403,
          "Seul le Gérant peut modifier les rôles Administrateur ou Gérant.",
          "name_admin_reserved",
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
      await getDb().update(TABLES.profiles, userId, { banni });
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
  },
);
