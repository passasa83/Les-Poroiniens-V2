import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile, getProfileByPseudo, updateProfile } from "@/lib/data/users";
import { fail, route } from "@/server/http";

const PatchSchema = z.object({
  pseudo: z.string().max(64).optional(),
  bio: z.string().max(1000).optional(),
  confidentialite: z
    .object({
      bibliothequePublique: z.boolean().optional(),
      statsPubliques: z.boolean().optional(),
    })
    .optional(),
});

/**
 * PATCH /api/account/profile — pseudo, bio, options de confidentialité.
 * L'identité vient de la session serveur ; l'unicité du pseudo est vérifiée
 * avant écriture.
 */
export const PATCH = route(
  {
    auth: "user",
    rateLimit: {
      key: "account:profile",
      by: "ip+user",
      limit: 30,
      windowMs: 60_000,
      message: "Trop de modifications. Réessayez dans un instant.",
    },
    body: PatchSchema,
    invalidBody: "Formulaire invalide.",
  },
  async ({ user, body }) => {
    const patch: Parameters<typeof updateProfile>[1] = {};
    const profile = await getProfile(user.id);

    if (body.pseudo !== undefined) {
      const pseudo = body.pseudo.trim();
      if (pseudo.length < 3 || pseudo.length > 24) {
        fail(400, "Le pseudo doit faire entre 3 et 24 caractères.", "validation");
      }
      const taken = await getProfileByPseudo(pseudo);
      if (taken && taken.user_id !== user.id) {
        fail(400, "Ce pseudo est déjà pris.", "pseudo_taken");
      }
      patch.pseudo = pseudo;
    }

    if (body.bio !== undefined) {
      const bio = body.bio.replace(/\r\n/g, "\n").trim();
      if (bio.length > 280) {
        fail(400, "La bio ne peut pas dépasser 280 caractères.", "validation");
      }
      patch.bio = bio;
    }

    if (body.confidentialite) {
      patch.confidentialite = {
        bibliothequePublique:
          body.confidentialite.bibliothequePublique ??
          profile?.confidentialite?.bibliothequePublique ??
          true,
        statsPubliques:
          body.confidentialite.statsPubliques ?? profile?.confidentialite?.statsPubliques ?? true,
      };
    }

    if (Object.keys(patch).length === 0) {
      fail(400, "Aucune modification reçue.", "validation");
    }

    const updated = await updateProfile(user.id, patch);
    return NextResponse.json({ ok: true, profile: updated });
  },
);
