import { NextResponse } from "next/server";
import { z } from "zod";
import { register } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

const RegisterSchema = z.object({
  pseudo: z.string().max(64).default(""),
  email: z.string().max(320).default(""),
  password: z.string().max(256).default(""),
  /** Honeypot : champ invisible, rempli uniquement par un robot. */
  website: z.string().max(500).default(""),
  /** Jeton Cloudflare Turnstile (§7.1) — vide si le captcha n'est pas configuré. */
  captcha: z.string().max(4096).default(""),
});

/**
 * POST /api/auth/register — inscription (§7.1 et §14.3).
 * Aucun e-mail n'est vérifié au lancement (pas de fournisseur de mails) :
 * l'anti-bot repose sur le captcha Turnstile (s'il est configuré), le honeypot
 * et la limitation de débit par IP.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const limit = rateLimit(`auth:register:${ip}`, {
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

  // Captcha (§7.1) : sauté avec un avertissement clair si Turnstile n'est pas
  // configuré (repli explicite, jamais un blocage fantôme).
  const captcha = await verifyTurnstile(parsed.data.captcha, ip);
  if (!captcha.ok) {
    return NextResponse.json(
      {
        error:
          captcha.reason === "missing_token"
            ? "La vérification anti-robot est incomplète. Réessayez."
            : "La vérification anti-robot a échoué. Réessayez.",
        code: "captcha",
        field: "captcha",
      },
      { status: 400 },
    );
  }

  const result = await register({
    pseudo: parsed.data.pseudo,
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: "register_failed", ...(result.field ? { field: result.field } : {}) },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
