import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { getDb, TABLES } from "@/lib/db";
import { getSettings } from "@/lib/data/moderation";
import { imageEnv } from "@/lib/media";
import type { Profile, Role } from "@/lib/types";
import { SettingsForm, type SecretStatus } from "./_components/settings-form";

export const dynamic = "force-dynamic";

/** Paramètres du site et connexions (§9.6) — Gérant exclusif. */
export default async function GerantParametresPage() {
  const user = await getCurrentUser();
  if (!can(user?.role, "site_settings")) {
    return (
      <AccessDenied
        required="owner"
        hint="La configuration du site et les secrets sont réservés au Gérant."
      />
    );
  }

  const [settings, profileRes] = await Promise.all([
    getSettings(),
    getDb().list<Profile>(TABLES.profiles, {
      order: { field: "pseudo", dir: "asc" },
      limit: 500,
    }),
  ]);

  // État des secrets : uniquement la présence, jamais la valeur.
  const secrets: SecretStatus[] = [
    {
      key: "google_drive",
      label: "Google Drive (compte de service)",
      present: Boolean(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT),
      hint: "Ressources de séries uniquement (couvertures, métadonnées).",
    },
    {
      key: "nas",
      label: "API du NAS",
      present: Boolean(imageEnv().nasApiBase),
      hint: "Stockage et listing des pages de scans.",
    },
    {
      key: "captcha",
      label: "Captcha (hCaptcha / Turnstile)",
      present: Boolean(process.env.HCAPTCHA_SECRET || process.env.TURNSTILE_SECRET),
      hint: "Protection anti-bot à l'inscription.",
    },
    {
      key: "smtp",
      label: "SMTP / envoi de mails",
      present: Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY),
      hint: "Désactivé au lancement (§14.3).",
    },
    {
      key: "appwrite",
      label: "Appwrite",
      present: Boolean(process.env.APPWRITE_API_KEY),
      hint: "Base de données, auth et stockage.",
    },
  ];

  const initial = {
    site_name: settings.site_name ?? "Les Poroiniens",
    announcement: settings.announcement ?? "",
    registration_open: settings.registration_open !== "0",
    maintenance: settings.maintenance === "1",
    legal_mentions: settings.legal_mentions ?? "",
    legal_confidentialite: settings.legal_confidentialite ?? "",
    social_discord: settings.social_discord ?? "",
    social_x: settings.social_x ?? "",
    social_youtube: settings.social_youtube ?? "",
  };

  const users = profileRes.items.map((p) => ({
    userId: p.user_id,
    pseudo: p.pseudo,
    role: (p.role ?? "membre") as Role,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-title">Paramètres du site</h1>
        <p className="mt-1 text-sm text-muted">
          Identité, bannière, inscriptions, pages légales, réseaux et connexions (§9.6). Chaque
          modification est tracée au journal d&apos;audit.
        </p>
      </div>

      <SettingsForm initial={initial} secrets={secrets} users={users} />
    </div>
  );
}
