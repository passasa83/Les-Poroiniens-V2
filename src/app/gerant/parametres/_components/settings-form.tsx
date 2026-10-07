"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Lock, RefreshCw, Save } from "lucide-react";
import { Badge, Button, Card, Field, Input, Select, Textarea } from "@/components/ui/kit";
import type { Role } from "@/lib/types";

export type SecretStatus = {
  key: string;
  label: string;
  present: boolean;
  hint?: string;
};

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

  // État des secrets rechargé côté client pour vérifier la réponse masquée.
  const [secretList, setSecretList] = useState(secrets);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretsBusy, setSecretsBusy] = useState(false);

  // Réinitialisation de mot de passe
  const [targetUser, setTargetUser] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ tone: "ok" | "adult"; text: string } | null>(
    null,
  );

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

  async function refreshSecrets() {
    setSecretsBusy(true);
    setSecretError(null);
    try {
      const res = await fetch("/api/owner/settings");
      const data = (await res.json().catch(() => null)) as
        | { secrets?: Record<string, { label: string; present: boolean }> }
        | null;
      if (!res.ok || !data?.secrets) {
        setSecretError("Impossible de lire l'état des connexions.");
        return;
      }
      setSecretList((prev) =>
        prev.map((s) => ({
          ...s,
          present: data.secrets?.[s.key]?.present ?? s.present,
        })),
      );
    } catch {
      setSecretError("Erreur réseau : réessayez.");
    } finally {
      setSecretsBusy(false);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const user = users.find((u) => u.userId === targetUser);
    if (!user) {
      setResetMessage({ tone: "adult", text: "Sélectionnez un utilisateur." });
      return;
    }
    if (newPassword.length < 8) {
      setResetMessage({ tone: "adult", text: "Le mot de passe doit faire au moins 8 caractères." });
      return;
    }
    const ok = window.confirm(
      `Réinitialiser le mot de passe de ${user.pseudo} ? Il devra être communiqué hors ligne.`,
    );
    if (!ok) return;

    setResetBusy(true);
    setResetMessage(null);
    try {
      const res = await fetch("/api/owner/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.userId, password: newPassword }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setResetMessage({ tone: "adult", text: data?.error ?? "Réinitialisation impossible." });
        return;
      }
      setResetMessage({
        tone: "ok",
        text: `Mot de passe de ${user.pseudo} réinitialisé (non journalisé).`,
      });
      setNewPassword("");
    } catch {
      setResetMessage({ tone: "adult", text: "Erreur réseau : réessayez." });
    } finally {
      setResetBusy(false);
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
            <Field label="Bannière d'annonce" htmlFor="st-announcement" hint="Laisser vide pour masquer.">
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
            La dernière annonce publiée s&apos;affiche sur l&apos;accueil : en bandeau
            compact si cette case est cochée, sinon en carte avec titre, date et extrait. Décochez
            pour n&apos;afficher que la bannière d&apos;annonce ci-dessus.
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
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title flex items-center gap-2">
            <Lock className="size-4 text-primary" /> Clés et connexions
          </h2>
          <Button type="button" onClick={refreshSecrets} disabled={secretsBusy}>
            {secretsBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Actualiser l&apos;état
          </Button>
        </div>

        <p className="text-xs text-muted">
          Pour des raisons de sécurité, seuls la <span className="text-fg">présence</span> ou
          l&apos;<span className="text-fg">absence</span> de chaque secret sont affichées : les
          valeurs ne sont jamais renvoyées par l&apos;API ni journalisées.
        </p>

        {secretError && <p className="text-sm text-adult">{secretError}</p>}

        <ul className="space-y-3">
          {secretList.map((secret) => (
            <li
              key={secret.key}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0"
            >
              <span className="text-sm text-muted">
                {secret.label}
                {secret.hint && <span className="mt-0.5 block text-xs text-muted/80">{secret.hint}</span>}
              </span>
              <Badge tone={secret.present ? "ok" : "neutral"}>
                {secret.present ? "Présent" : "Absent"}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      {/* ── Utilisateurs ──────────────────────────────────────────────── */}
      <Card className="space-y-4 p-5">
        <h2 className="section-title flex items-center gap-2">
          <KeyRound className="size-4 text-primary" /> Réinitialisation d&apos;un mot de passe
        </h2>
        <p className="text-xs text-muted">
          Aucun mail n&apos;est envoyé au lancement : communiquez le nouveau mot de passe
          hors ligne. La valeur n&apos;est ni journalisée ni affichée.
        </p>

        <form onSubmit={resetPassword} className="grid gap-4 md:grid-cols-3">
          <Field label="Utilisateur" htmlFor="st-user">
            <Select id="st-user" value={targetUser} onChange={(e) => setTargetUser(e.target.value)}>
              <option value="">— Choisir —</option>
              {users.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.pseudo} ({u.role})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nouveau mot de passe" htmlFor="st-password">
            <Input
              id="st-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              autoComplete="new-password"
              placeholder="8 caractères minimum"
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="danger" disabled={resetBusy}>
              {resetBusy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
              Réinitialiser
            </Button>
          </div>
        </form>

        {resetMessage && (
          <p
            className={`rounded-xl border px-3 py-2 text-sm ${
              resetMessage.tone === "ok"
                ? "border-ok/40 bg-ok/10 text-ok"
                : "border-adult/40 bg-adult/10 text-adult"
            }`}
          >
            {resetMessage.text}
          </p>
        )}
      </Card>
    </div>
  );
}
