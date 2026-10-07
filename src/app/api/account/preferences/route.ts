import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ADULT_COOKIE, getCurrentUser } from "@/lib/auth";
import { getProfile, updatePreferences } from "@/lib/data/users";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { DEFAULT_PREFERENCES, type UserPreferences } from "@/lib/types";

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
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }
  const profile = await getProfile(user.id);
  const preferences: UserPreferences = {
    ...DEFAULT_PREFERENCES,
    ...(profile?.preferences ?? {}),
  };
  return NextResponse.json({ ok: true, preferences });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "Authentification requise.", code: "unauthorized" },
      { status: 401 },
    );
  }

  const limit = rateLimit(`account:prefs:${user.id}:${clientIp(request)}`, {
    limit: 60,
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

  const parsed = PreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Préférences invalides.", code: "validation" }, { status: 400 });
  }

  const preferences: UserPreferences = await updatePreferences(user.id, parsed.data);
  // Opt-out : le cookie visiteur ne doit pas rouvrir la porte coupée
  // côté compte (voir `updatePreferences`, révocation effective).
  if (parsed.data.adult_ok === false) {
    (await cookies()).set(ADULT_COOKIE, "", { path: "/", maxAge: 0 });
  }
  return NextResponse.json({ ok: true, preferences });
}
