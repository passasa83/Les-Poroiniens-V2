import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { audit, getSettings, setSetting } from "@/lib/data/moderation";
import { imageEnv } from "@/lib/media";

export const runtime = "nodejs";

function jsonError(error: string, code: string, status: number) {
  return Response.json({ error, code }, { status });
}

/** Cles configurables depuis l'espace Gérant (§9.6). */
const settingsInput = z.object({
  site_name: z.string().trim().min(1).max(80).optional(),
  announcement: z.string().max(500).optional(),
  registration_open: z.boolean().optional(),
  maintenance: z.boolean().optional(),
  legal_mentions: z.string().max(30000).optional(),
  legal_confidentialite: z.string().max(30000).optional(),
  social_discord: z.string().trim().max(300).optional(),
  social_x: z.string().trim().max(300).optional(),
  social_youtube: z.string().trim().max(300).optional(),
  /** Une adresse de secours par ligne (§5.4). */
  adresses_secours: z.string().max(1000).optional(),
  /** Slug de la série mise en avant sur /nouveautés (§6.2), vide = dernier chapitre publié. */
  nouveautes_serie: z.string().trim().max(120).optional(),
  /** Bandeau compact de la dernière annonce sur l'accueil (§6.11). */
  annonce_bandeau: z.boolean().optional(),
});

/**
 * État des secrets : **jamais la valeur**, uniquement présent / absent.
 * Les clés ne transitent pas dans la réponse (§9.6 et §14.1).
 */
function secretStatus(): Record<string, { present: boolean; label: string }> {
  return {
    google_drive: {
      present: Boolean(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT),
      label: "Google Drive (compte de service)",
    },
    nas: { present: Boolean(imageEnv().nasApiBase), label: "API du NAS" },
    captcha: {
      present: Boolean(process.env.HCAPTCHA_SECRET || process.env.TURNSTILE_SECRET),
      label: "Captcha (hCaptcha / Turnstile)",
    },
    smtp: {
      present: Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY),
      label: "SMTP / envoi de mails",
    },
    appwrite: { present: Boolean(process.env.APPWRITE_API_KEY), label: "Appwrite" },
  };
}

/** GET /api/owner/settings — paramètres du site + état masqué des secrets (Gérant). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "site_settings")) {
    return jsonError("Configuration réservée au Gérant.", "owner_only", 403);
  }

  const settings = await getSettings();
  const secrets = secretStatus();
  return Response.json({
    settings: {
      site_name: settings.site_name ?? "",
      announcement: settings.announcement ?? "",
      registration_open: settings.registration_open !== "0",
      maintenance: settings.maintenance === "1",
      legal_mentions: settings.legal_mentions ?? "",
      legal_confidentialite: settings.legal_confidentialite ?? "",
      social_discord: settings.social_discord ?? "",
      social_x: settings.social_x ?? "",
      social_youtube: settings.social_youtube ?? "",
      adresses_secours: settings.adresses_secours ?? "",
      nouveautes_serie: settings.nouveautes_serie ?? "",
      annonce_bandeau: settings.annonce_bandeau === "1",
    },
    secrets: Object.fromEntries(
      Object.entries(secrets).map(([key, value]) => [
        key,
        { label: value.label, present: value.present },
      ]),
    ),
  });
}

/** PATCH /api/owner/settings — mise à jour (Gérant) + journal d'audit. */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return jsonError("Authentification requise.", "unauthorized", 401);
  if (!can(user.role, "site_settings")) {
    return jsonError("Configuration réservée au Gérant.", "owner_only", 403);
  }

  const ip = clientIp(request);
  const limit = rateLimit(`owner:settings:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!limit.ok) return jsonError("Trop de requêtes.", "rate_limited", 429);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Corps JSON invalide.", "invalid_body", 400);
  }
  const parsed = settingsInput.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Champs invalides.", "invalid_body", 400);
  }

  const incoming = parsed.data;
  const before = await getSettings();

  const toStore: Record<string, string> = {};
  if (incoming.site_name !== undefined) toStore.site_name = incoming.site_name;
  if (incoming.announcement !== undefined) toStore.announcement = incoming.announcement;
  if (incoming.registration_open !== undefined) {
    toStore.registration_open = incoming.registration_open ? "1" : "0";
  }
  if (incoming.maintenance !== undefined) {
    toStore.maintenance = incoming.maintenance ? "1" : "0";
  }
  if (incoming.legal_mentions !== undefined) toStore.legal_mentions = incoming.legal_mentions;
  if (incoming.legal_confidentialite !== undefined) {
    toStore.legal_confidentialite = incoming.legal_confidentialite;
  }
  if (incoming.social_discord !== undefined) toStore.social_discord = incoming.social_discord;
  if (incoming.social_x !== undefined) toStore.social_x = incoming.social_x;
  if (incoming.social_youtube !== undefined) toStore.social_youtube = incoming.social_youtube;
  if (incoming.adresses_secours !== undefined) {
    toStore.adresses_secours = incoming.adresses_secours;
  }
  if (incoming.nouveautes_serie !== undefined) {
    toStore.nouveautes_serie = incoming.nouveautes_serie;
  }
  if (incoming.annonce_bandeau !== undefined) {
    toStore.annonce_bandeau = incoming.annonce_bandeau ? "1" : "0";
  }

  for (const [cle, valeur] of Object.entries(toStore)) {
    await setSetting(cle, valeur);
  }

  const changed = Object.fromEntries(
    Object.entries(toStore)
      .filter(([cle, valeur]) => (before[cle] ?? "") !== valeur)
      .map(([cle]) => [cle, { avant: before[cle] ?? null, apres: toStore[cle] }]),
  );

  if (Object.keys(changed).length > 0) {
    await audit({
      actorId: user.id,
      actorPseudo: user.pseudo,
      action: "settings.update",
      cible: "settings:site",
      avant: Object.fromEntries(Object.keys(changed).map((k) => [k, before[k] ?? null])),
      apres: Object.fromEntries(Object.keys(changed).map((k) => [k, toStore[k]])),
      ip,
    });
  }

  return Response.json({ ok: true, changed: Object.keys(changed) });
}
