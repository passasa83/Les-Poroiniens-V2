import { NextResponse } from "next/server";
import { z } from "zod";
import { login } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const CredentialsSchema = z.object({
  email: z.string().max(320),
  password: z.string().max(256),
});

/**
 * POST /api/auth/login — connexion (§14.2).
 * 10 tentatives / minute / IP, message d'erreur unique : aucune distinction
 * entre un e-mail inconnu et un mot de passe incorrect.
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
      { error: "Identifiants invalides.", code: "validation" },
      { status: 400 },
    );
  }

  const result = await login(parsed.data.email, parsed.data.password);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: "invalid_credentials" },
      { status: 401 },
    );
  }

  return NextResponse.json({ ok: true });
}
