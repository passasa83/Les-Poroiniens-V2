import "server-only";

/**
 * Cloudflare Turnstile (« protection anti-bot », « compenser
 * l'absence de mails »).
 *
 * Deux variables sont nécessaires au fonctionnement complet :
 *   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` : clé publique, affichée dans le widget ;
 *   - `TURNSTILE_SECRET_KEY` : clé secrète, utilisée uniquement côté serveur.
 *
 * Repli explicite (arbitrage du client) : si l'une ou l'autre est absente, le
 * formulaire reste utilisable, la vérification est **sautée** avec un
 * avertissement clair dans les logs. Aucune clé manquante n'est jamais renvoyée
 * au client, et aucun blocage fantôme n'est possible.
 */

const SITE_KEY_ENV = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";
const SECRET_KEY_ENV = "TURNSTILE_SECRET_KEY";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type TurnstileOutcome =
  | { ok: true; skipped: boolean }
  | { ok: false; reason: "missing_token" | "invalid" };

/** Clé publique à confier au client, ou `null` si non configurée. */
export function turnstileSiteKey(): string | null {
  const value = process.env[SITE_KEY_ENV]?.trim();
  return value ? value : null;
}

function turnstileSecret(): string | null {
  const value = process.env[SECRET_KEY_ENV]?.trim();
  return value ? value : null;
}

/** Configuration complète : les deux clés sont présentes. */
export function turnstileEnabled(): boolean {
  return Boolean(turnstileSiteKey() && turnstileSecret());
}

/* Un seul avertissement par process : le repli reste lisible dans les logs. */
let warned = false;
function warnOnce(message: string) {
  if (warned) return;
  warned = true;
  console.warn(`[turnstile] ${message}`);
}

/**
 * Vérifie le jeton renvoyé par le widget.
 *
 * - Configuration incomplète → vérification sautée (repli documenté, journalisé).
 * - Jeton absent alors que Turnstile est actif → refus.
 * - Service injoignable → repli ouvert avec journal clair (pas de blocage fantôme :
 *   la limitation de débit et le honeypot continuent de protéger l'inscription).
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  remoteIp: string,
): Promise<TurnstileOutcome> {
  const secret = turnstileSecret();
  const siteKey = turnstileSiteKey();

  if (!secret || !siteKey) {
    const missing = !secret ? SECRET_KEY_ENV : SITE_KEY_ENV;
    warnOnce(
      `${missing} absent : vérification anti-robot ignorée (repli explicite, ` +
        `inscription ouverte, limitation de débit et honeypot actifs).`,
    );
    return { ok: true, skipped: true };
  }

  const trimmed = token?.trim();
  if (!trimmed) return { ok: false, reason: "missing_token" };

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: trimmed,
        remoteip: remoteIp,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null;
    if (data?.success) return { ok: true, skipped: false };
    warnOnce("jeton refusé par le service de vérification.");
    return { ok: false, reason: "invalid" };
  } catch (error) {
    warnOnce(
      `service de vérification injoignable (${
        error instanceof Error ? error.message : "erreur réseau"
      }) : vérification sautée.`,
    );
    return { ok: true, skipped: true };
  }
}
