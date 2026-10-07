import { NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * on accepte un identifiant **ou** une adresse e-mail. `email` reste
 * accepté pour les clients déjà en place (recettes, anciens formulaires).
 */
const CredentialsSchema = z
  .object({
    identifier: z.string().max(320).optional(),
    email: z.string().max(320).optional(),
    password: z.string().max(256),
    /** « Se souvenir de moi » : false → cookie de session. */
    remember: z.boolean().optional(),
  })
  .transform((value) => ({
    identifier: (value.identifier ?? value.email ?? "").trim(),
    password: value.password,
    remember: value.remember ?? true,
  }))
  .refine((value) => value.identifier.length > 0, { message: "identifier" });

/**
 * POST /api/auth/login — connexion.
 * 10 tentatives / minute / IP, message d'erreur unique : aucune distinction
 * entre un identifiant inconnu et un mot de passe incorrect.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`auth:login:${clientIp(request)}`, {
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "Trop de tentatives. Réessayez dans quelques instants.",
        code: "rate_limited",
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Requête invalide.", code: "bad_request" },
      { status: 400 },
    );
  }

  const parsed = CredentialsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Identifiant ou mot de passe incorrect.", code: "validation" },
      { status: 400 },
    );
  }

  const result = await login(parsed.data.identifier, parsed.data.password, {
    remember: parsed.data.remember,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: "invalid_credentials" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
