import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ADULT_COOKIE } from "@/server/auth";
import { getProfile, updatePreferences } from "@/lib/data/users";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/types";
import { route } from "@/server/http";

/**
 * PATCH /api/account/preferences.
 * Seuls les champs connus de `preferences` sont fusionnés ; tous les autres
 * champs reçus sont ignorés (le schéma les écarte, `updatePreferences()` les
 * filtre à nouveau). Écriture réservée au propriétaire de la session.
 */
const PreferencesSchema = z.object({
  theme: z.enum(["dark", "light", "system"]).optional(),
  sens_lecture: z.enum(["ltr", "rtl"]).optional(),
  mode_lecture: z.enum(["vertical", "single", "double"]).optional(),
  langue: z.string().max(10).optional(),
  adult_ok: z.boolean().optional(),
  notifications: z.boolean().optional(),
  tagsMasques: z.array(z.string().max(60)).max(80).optional(),
});

/**
 * GET /api/account/preferences — « Réglages ».
 * Renvoie les préférences du compte connecté, complétées par les valeurs par
 * défaut (un compte créé avant l'ajout d'un champ n'a pas de trou dans la
 * réponse). Lecture seule : 401 sans session.
 */
export const GET = route({ auth: "user" }, async ({ user }) => {
  const profile = await getProfile(user.id);
  const preferences: UserPreferences = {
    ...DEFAULT_PREFERENCES,
    ...(profile?.preferences ?? {}),
  };
  return NextResponse.json({ ok: true, preferences });
});

export const PATCH = route(
  {
    auth: "user",
    rateLimit: {
      key: "account:prefs",
      by: "ip+user",
      limit: 60,
      windowMs: 60_000,
      message: "Trop de modifications. Réessayez dans un instant.",
    },
    body: PreferencesSchema,
    invalidBody: "Préférences invalides.",
  },
  async ({ user, body }) => {
    const preferences: UserPreferences = await updatePreferences(user.id, body);
    // Opt-out : le cookie visiteur ne doit pas rouvrir la porte coupée
    // côté compte (voir `updatePreferences`, révocation effective).
    if (body.adult_ok === false) {
      (await cookies()).set(ADULT_COOKIE, "", { path: "/", maxAge: 0 });
    }
    return NextResponse.json({ ok: true, preferences });
  },
);
