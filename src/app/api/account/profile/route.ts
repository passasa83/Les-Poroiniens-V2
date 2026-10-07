import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getProfile, getProfileByPseudo, updateProfile } from "@/lib/data/users";
import { clientIp, rateLimit } from "@/lib/rate-limit";

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
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`account:profile:${user.id}:${clientIp(request)}`, {
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Trop de modifications. Réessayez dans un instant.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide.", code: "bad_request" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Formulaire invalide.", code: "validation" }, { status: 400 });
  }

  const patch: Parameters<typeof updateProfile>[1] = {};
  const profile = await getProfile(user.id);

  if (parsed.data.pseudo !== undefined) {
    const pseudo = parsed.data.pseudo.trim();
    if (pseudo.length < 3 || pseudo.length > 24) {
      return NextResponse.json(
        { error: "Le pseudo doit faire entre 3 et 24 caractères.", code: "validation" },
        { status: 400 },
      );
    }
    const taken = await getProfileByPseudo(pseudo);
    if (taken && taken.user_id !== user.id) {
      return NextResponse.json(
        { error: "Ce pseudo est déjà pris.", code: "pseudo_taken" },
        { status: 400 },
      );
    }
    patch.pseudo = pseudo;
  }

  if (parsed.data.bio !== undefined) {
    const bio = parsed.data.bio.replace(/\r\n/g, "\n").trim();
    if (bio.length > 280) {
      return NextResponse.json(
        { error: "La bio ne peut pas dépasser 280 caractères.", code: "validation" },
        { status: 400 },
      );
    }
    patch.bio = bio;
  }

  if (parsed.data.confidentialite) {
    patch.confidentialite = {
      bibliothequePublique:
        parsed.data.confidentialite.bibliothequePublique ??
        profile?.confidentialite?.bibliothequePublique ??
        true,
      statsPubliques:
        parsed.data.confidentialite.statsPubliques ?? profile?.confidentialite?.statsPubliques ?? true,
    };
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Aucune modification reçue.", code: "validation" },
      { status: 400 },
    );
  }

  const updated = await updateProfile(user.id, patch);
  return NextResponse.json({ ok: true, profile: updated });
}
