"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/kit";
import type { Role } from "@/lib/types";
import { PasswordResetCard } from "./password-reset-card";
import { SecretsCard, type SecretStatus } from "./secrets-card";

export type { SecretStatus } from "./secrets-card";

type SettingsValues = {
  site_name: string;
  announcement: string;
  registration_open: boolean;
  maintenance: boolean;
  legal_mentions: string;
  legal_confidentialite: string;
  social_discord: string;
  social_x: string;
  social_youtube: string;
  adresses_secours: string;
  nouveautes_serie: string;
  annonce_bandeau: boolean;
};

type UserLite = { userId: string; pseudo: string; role: Role };

export function SettingsForm({
  initial,
  secrets,
  users,
}: {
  initial: SettingsValues;
  secrets: SecretStatus[];
  users: UserLite[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<SettingsValues>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof SettingsValues>(key: K, value: SettingsValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/owner/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Enregistrement impossible.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-6">
        <Card className="space-y-4 p-5">
          <h2 className="section-title">Identité et affichage</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nom du site" htmlFor="st-name">
              <Input
                id="st-name"
                value={values.site_name}
                onChange={(e) => set("site_name", e.target.value)}
                maxLength={80}
                required
              />
            </Field>
            <Field
              label="Bannière d'annonce"
              htmlFor="st-announcement"
              hint="Laisser vide pour masquer."
            >
              <Input
                id="st-announcement"
                value={values.announcement}
                onChange={(e) => set("announcement", e.target.value)}
                maxLength={500}
                placeholder="Nouvelle parution chaque vendredi !"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={values.registration_open}
                onChange={(e) => set("registration_open", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Inscriptions ouvertes
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={values.maintenance}
                onChange={(e) => set("maintenance", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Mode maintenance
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={values.annonce_bandeau}
                onChange={(e) => set("annonce_bandeau", e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              Dernière annonce en bandeau sur l&apos;accueil
            </label>
          </div>
          <p className="text-xs text-muted">
            La dernière annonce publiée s&apos;affiche sur l&apos;accueil : en bandeau compact si
            cette case est cochée, sinon en carte avec titre, date et extrait. Décochez pour
            n&apos;afficher que la bannière d&apos;annonce ci-dessus.
          </p>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="section-title">Pages légales</h2>
          <Field label="Mentions légales" htmlFor="st-legal">
            <Textarea
              id="st-legal"
              value={values.legal_mentions}
              onChange={(e) => set("legal_mentions", e.target.value)}
              maxLength={30000}
              placeholder="Identité de l'éditeur, hébergeur, droits…"
            />
          </Field>
          <Field label="Politique de confidentialité" htmlFor="st-privacy">
            <Textarea
              id="st-privacy"
              value={values.legal_confidentialite}
              onChange={(e) => set("legal_confidentialite", e.target.value)}
              maxLength={30000}
              placeholder="Données collectées, conservation, droits RGPD…"
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="section-title">Liens réseaux sociaux</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Discord" htmlFor="st-discord">
              <Input
                id="st-discord"
                value={values.social_discord}
                onChange={(e) => set("social_discord", e.target.value)}
                maxLength={300}
                placeholder="https://discord.gg/…"
              />
            </Field>
            <Field label="X / Twitter" htmlFor="st-x">
              <Input
                id="st-x"
                value={values.social_x}
                onChange={(e) => set("social_x", e.target.value)}
                maxLength={300}
                placeholder="https://x.com/…"
              />
            </Field>
            <Field label="YouTube" htmlFor="st-youtube">
              <Input
                id="st-youtube"
                value={values.social_youtube}
                onChange={(e) => set("social_youtube", e.target.value)}
                maxLength={300}
                placeholder="https://youtube.com/@…"
              />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="section-title">Adresse de secours</h2>
          <Field
            label="Domaines alternatifs"
            htmlFor="st-adresses"
            hint="Une adresse par ligne. Elles sont publiées sur la page « Adresse de secours »."
          >
            <Textarea
              id="st-adresses"
              value={values.adresses_secours}
              onChange={(e) => set("adresses_secours", e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder={"https://secours.poroiniens.fr\nhttps://les-poroiniens.example"}
            />
          </Field>
        </Card>

        <Card className="space-y-4 p-5">
          <h2 className="section-title">Page Nouveautés</h2>
          <Field
            label="Série à la une"
            htmlFor="st-nouveautes"
            hint="Slug de la série mise en avant sur /nouveautés (visible dans son adresse : /serie/…). Vide = le dernier chapitre publié."
          >
            <Input
              id="st-nouveautes"
              value={values.nouveautes_serie}
              onChange={(e) => set("nouveautes_serie", e.target.value)}
              maxLength={120}
              placeholder="nuits-blanches-a-tokyo"
            />
          </Field>
        </Card>

        {error && (
          <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Enregistrer les paramètres
          </Button>
          {saved && <span className="text-sm text-ok">Modifications enregistrées.</span>}
        </div>
      </form>

      {/* ── Clés et connexions ────────────────────────────────────────── */}
      <SecretsCard secrets={secrets} />

      {/* ── Utilisateurs ──────────────────────────────────────────────── */}
      <PasswordResetCard users={users} />
    </div>
  );
}
