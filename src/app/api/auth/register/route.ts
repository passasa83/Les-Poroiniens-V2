import { NextResponse } from "next/server";
import { z } from "zod";
import { register } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const RegisterSchema = z.object({
  pseudo: z.string().max(64).default(""),
  email: z.string().max(320).default(""),
  password: z.string().max(256).default(""),
  /** Honeypot : champ invisible, rempli uniquement par un robot. */
  website: z.string().max(500).default(""),
});

/**
 * POST /api/auth/register — inscription (§7.1 et §14.3).
 * Aucun e-mail n'est vérifié au lancement (pas de fournisseur de mails) :
 * l'anti-bot repose sur le honeypot + la limitation de débit par IP.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`auth:register:${clientIp(request)}`, {
    limit: 5,
    windowMs: 600_000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "Trop d'inscriptions récentes depuis cette adresse. Réessayez plus tard.",
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

  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Formulaire invalide.", code: "validation" },
      { status: 400 },
    );
  }

  // Honeypot rempli : on ne crée rien et on ne dévoile pas la raison précise.
  if (parsed.data.website.trim() !== "") {
    return NextResponse.json(
      { error: "Inscription impossible pour le moment. Réessayez plus tard.", code: "rejected" },
      { status: 400 },
    );
  }

  const result = await register({
    pseudo: parsed.data.pseudo,
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: "register_failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
