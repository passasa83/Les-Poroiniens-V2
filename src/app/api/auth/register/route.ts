import { NextResponse } from "next/server";
import { z } from "zod";
import { register } from "@/server/auth";
import { verifyTurnstile } from "@/lib/turnstile";
import { fail, route } from "@/server/http";

const RegisterSchema = z.object({
  pseudo: z.string().max(64).default(""),
  email: z.string().max(320).default(""),
  password: z.string().max(256).default(""),
  /** Honeypot : champ invisible, rempli uniquement par un robot. */
  website: z.string().max(500).default(""),
  /** Jeton Cloudflare Turnstile — vide si le captcha n'est pas configuré. */
  captcha: z.string().max(4096).default(""),
});

/**
 * POST /api/auth/register — inscription.
 * Aucun e-mail n'est vérifié au lancement (pas de fournisseur de mails) :
 * l'anti-bot repose sur le captcha Turnstile (s'il est configuré), le honeypot
 * et la limitation de débit par IP.
 */
export const POST = route(
  {
    rateLimit: {
      key: "auth:register",
      limit: 5,
      windowMs: 600_000,
      message: "Trop d'inscriptions récentes depuis cette adresse. Réessayez plus tard.",
    },
    body: RegisterSchema,
    invalidBody: "Formulaire invalide.",
  },
  async ({ body, ip }) => {
    // Honeypot rempli : on ne crée rien et on ne dévoile pas la raison précise.
    if (body.website.trim() !== "") {
      fail(400, "Inscription impossible pour le moment. Réessayez plus tard.", "rejected");
    }

    // Captcha : sauté avec un avertissement clair si Turnstile n'est pas
    // configuré (repli explicite, jamais un blocage fantôme).
    const captcha = await verifyTurnstile(body.captcha, ip);
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
      pseudo: body.pseudo,
      email: body.email,
      password: body.password,
    });
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          code: "register_failed",
          ...(result.field ? { field: result.field } : {}),
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true });
  },
);
