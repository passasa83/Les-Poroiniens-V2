import { NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/server/auth";
import { route } from "@/server/http";

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
export const POST = route(
  {
    rateLimit: {
      key: "auth:login",
      limit: 10,
      windowMs: 60_000,
      message: "Trop de tentatives. Réessayez dans quelques instants.",
    },
    body: CredentialsSchema,
    invalidBody: "Identifiant ou mot de passe incorrect.",
  },
  async ({ body }) => {
    const result = await login(body.identifier, body.password, {
      remember: body.remember,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: "invalid_credentials" },
        { status: 401 },
      );
    }

    return NextResponse.json({ ok: true });
  },
);
