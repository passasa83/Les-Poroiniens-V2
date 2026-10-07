"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, UserPlus } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/kit";
import { AuthHeading, type AuthHeadingLevel } from "./auth-heading";
import { CaptchaField } from "./turnstile-field";
import { OAuthButtons } from "./oauth-buttons";
import type { AuthView } from "./auth-views";

type ApiReply = { error?: string; code?: string; field?: string };

type FieldName = "pseudo" | "email" | "password" | "confirm" | "captcha";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Pseudo public : 6 à 20 caractères, lettres et chiffres seulement. */
const PSEUDO_RE = /^[\p{L}\p{N}]+$/u;

function pseudoError(value: string): string | undefined {
  const length = [...value.trim()].length;
  if (length === 0) return "Choisissez un pseudo.";
  if (length < 6 || length > 20) return "Le pseudo doit faire entre 6 et 20 caractères.";
  if (!PSEUDO_RE.test(value.trim())) return "Le pseudo ne peut contenir ni espace ni symbole.";
  return undefined;
}

type InscriptionFormProps = {
  /** Clé publique Turnstile : `null` → repli explicite (voir CaptchaField). */
  turnstileSiteKey?: string | null;
  heading?: AuthHeadingLevel;
  idPrefix?: string;
  onSwitch?: (view: AuthView) => void;
  onSuccess?: () => void;
  /** Dans la modale, la carte de la modale remplace déjà la carte du formulaire. */
  embedded?: boolean;
  /** Connexion Discord branchée (variables d'environnement présentes). */
  discordEnabled?: boolean;
};

/**
 * Inscription : pseudo public, e-mail, mot de passe, captcha.
 * Aucun e-mail n'est vérifié au lancement : l'anti-bot repose sur le
 * captcha Turnstile (s'il est configuré), le honeypot et la limitation de débit.
 * Le bouton Discord crée aussi le compte, sans formulaire à remplir.
 */
export function InscriptionForm({
  turnstileSiteKey = null,
  heading = "h1",
  idPrefix = "inscription",
  onSwitch,
  onSuccess,
  embedded = false,
  discordEnabled = false,
}: InscriptionFormProps) {
  const router = useRouter();
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, doit rester vide
  const [captcha, setCaptcha] = useState("");
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const ids: Record<FieldName, string> = {
    pseudo: `${idPrefix}-pseudo`,
    email: `${idPrefix}-email`,
    password: `${idPrefix}-password`,
    confirm: `${idPrefix}-confirm`,
    captcha: `${idPrefix}-captcha`,
  };

  function focusFirstInvalid(map: Partial<Record<FieldName, string>>) {
    const order: FieldName[] = ["pseudo", "email", "password", "confirm"];
    const target = order.find((name) => map[name]);
    if (!target) return;
    document.getElementById(ids[target])?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Partial<Record<FieldName, string>> = {};
    const pseudoErrorValue = pseudoError(pseudo);
    if (pseudoErrorValue) nextErrors.pseudo = pseudoErrorValue;
    if (!EMAIL_RE.test(email.trim())) nextErrors.email = "Adresse e-mail invalide.";
    if (password.length < 8) {
      nextErrors.password = "Le mot de passe doit faire au moins 8 caractères.";
    }
    if (password !== confirm) {
      nextErrors.confirm = "Les deux mots de passe ne correspondent pas.";
    }

    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      focusFirstInvalid(nextErrors);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pseudo: pseudo.trim(),
          email: email.trim(),
          password,
          website,
          captcha,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiReply;
      if (!res.ok) {
        const field = data.field as FieldName | undefined;
        if (field === "captcha") {
          setErrors({ captcha: data.error || "Vérification anti-robot échouée." });
        } else if (field && field in ids) {
          setErrors({ [field]: data.error } as Partial<Record<FieldName, string>>);
        } else {
          setFormError(data.error || "Inscription impossible pour le moment.");
        }
        return;
      }
      setDone(true);
      if (onSuccess) {
        onSuccess();
        return;
      }
      router.refresh();
    } catch {
      setFormError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <AuthHeading level={heading}>Compte créé</AuthHeading>
        </div>
        <div
          className={
            embedded ? "space-y-4 text-center" : "card space-y-4 p-6 text-center"
          }
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="mx-auto size-9 text-ok" aria-hidden />
          <p className="text-sm text-fg">
            Bienvenue ! Votre compte est actif et vous êtes déjà connecté.
          </p>
          <p className="rounded-xl border border-line bg-surface2 p-3 text-xs text-muted">
            L&apos;adresse e-mail n&apos;est <strong>pas vérifiée</strong> : aucun service
            d&apos;envoi de mails n&apos;est actif au lancement du site (aucun e-mail ne vous sera
            d&apos;ailleurs envoyé).
          </p>
          <div className="flex flex-col gap-2">
            {onSwitch ? (
              <button type="button" onClick={() => onSwitch("connexion")} className="btn-primary">
                Se connecter
              </button>
            ) : (
              <Link href="/connexion" className="btn-primary">
                Se connecter
              </Link>
            )}
            <Link href="/" className="btn-ghost">
              Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <AuthHeading level={heading}>Inscription</AuthHeading>
        <p className="text-sm text-muted">
          Gratuit, sans publicité : bibliothèque, historique et statistiques de lecture.
        </p>
      </div>

      <form
        onSubmit={submit}
        className={embedded ? "space-y-4" : "card space-y-4 p-6"}
        noValidate
      >
        <Field
          label="Pseudo"
          htmlFor={ids.pseudo}
          error={errors.pseudo}
          hint="6 à 20 caractères, sans espace ni symbole. Affiché publiquement (commentaires, profil)."
        >
          <Input
            id={ids.pseudo}
            name="pseudo"
            type="text"
            autoComplete="username"
            required
            minLength={6}
            maxLength={20}
            value={pseudo}
            aria-invalid={Boolean(errors.pseudo)}
            aria-describedby={errors.pseudo ? `${ids.pseudo}-error` : `${ids.pseudo}-hint`}
            onChange={(e) => setPseudo(e.target.value)}
          />
        </Field>

        <Field
          label="Adresse e-mail"
          htmlFor={ids.email}
          error={errors.email}
          hint="Reste privée : jamais affichée publiquement."
        >
          <Input
            id={ids.email}
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            placeholder="vous@exemple.fr"
            value={email}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? `${ids.email}-error` : `${ids.email}-hint`}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field
          label="Mot de passe"
          htmlFor={ids.password}
          error={errors.password}
          hint="8 caractères minimum."
        >
          <Input
            id={ids.password}
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            value={password}
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? `${ids.password}-error` : `${ids.password}-hint`}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Field label="Confirmer le mot de passe" htmlFor={ids.confirm} error={errors.confirm}>
          <Input
            id={ids.confirm}
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            value={confirm}
            aria-invalid={Boolean(errors.confirm)}
            aria-describedby={errors.confirm ? `${ids.confirm}-error` : undefined}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        <CaptchaField
          siteKey={turnstileSiteKey}
          idPrefix={idPrefix}
          error={errors.captcha}
          onTokenChange={setCaptcha}
        />

        {/* Honeypot : hors écran, jamais à remplir par un humain */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px overflow-hidden"
          style={{ top: "auto" }}
        >
          <label htmlFor={`${idPrefix}-website`}>Site web</label>
          <input
            id={`${idPrefix}-website`}
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <div role="alert" aria-live="assertive" className="space-y-2">
          {formError && (
            <p className="rounded-xl border border-adult/40 bg-adult/5 px-3 py-2 text-sm text-adult">
              {formError}
            </p>
          )}
        </div>

        <p className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-muted">
          <strong className="text-fg">Votre adresse e-mail n&apos;est jamais montrée
          publiquement</strong> : elle ne figure ni sur votre profil, ni sous vos commentaires. Et
          comme aucun e-mail n&apos;est envoyé au lancement, rien ne vous parviendra par ce canal.
        </p>

        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          <UserPlus className="size-4" />
          {busy ? "Création du compte…" : "Créer mon compte"}
        </Button>

        <OAuthButtons className="border-t border-line pt-4" discordEnabled={discordEnabled} />

        <p className="text-center text-sm text-muted">
          {onSwitch ? (
            <>
              Déjà inscrit ?{" "}
              <button
                type="button"
                onClick={() => onSwitch("connexion")}
                className="link-muted font-semibold"
              >
                Se connecter
              </button>
            </>
          ) : (
            <>
              Déjà inscrit ?{" "}
              <Link href="/connexion" className="link-muted font-semibold">
                Se connecter
              </Link>
            </>
          )}
        </p>
      </form>
    </div>
  );
}
