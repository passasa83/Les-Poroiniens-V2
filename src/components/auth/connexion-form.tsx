"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LogIn } from "lucide-react";
import { Button, Field } from "@/components/ui/kit";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/lib/types";
import { AuthHeading, type AuthHeadingLevel } from "./auth-heading";
import { OAuthButtons } from "./oauth-buttons";
import type { AuthView } from "./auth-views";

export type DemoAccount = {
  email: string;
  password: string;
  pseudo: string;
  role: Role;
};

type ApiReply = { error?: string; code?: string };

type ConnexionFormProps = {
  /** Redirection après connexion (pages dédiées uniquement). */
  next?: string;
  demoAccounts?: DemoAccount[];
  /** Niveau du titre : `none` quand la modale porte déjà le titre. */
  heading?: AuthHeadingLevel;
  /** Préfixe des identifiants : évite les doublons page + modale. */
  idPrefix?: string;
  /** Présent dans la modale : les liens changent de vue au lieu de naviguer. */
  onSwitch?: (view: AuthView) => void;
  /** Présent dans la modale : ferme la modale au lieu de rediriger. */
  onSuccess?: () => void;
  /** Dans la modale, la carte de la modale remplace déjà la carte du formulaire. */
  embedded?: boolean;
  /** Connexion Discord branchée (variables d'environnement présentes). */
  discordEnabled?: boolean;
  /** Échec du parcours Discord transmis par la page ou la modale. */
  initialError?: string | null;
};

/**
 * Connexion : identifiant **ou** adresse e-mail, mot de passe,
 * « Se souvenir de moi », boutons Discord (actif si configuré) et Google
 * (état « à configurer »). Échec Discord annoncé via `initialError`.
 * Message d'échec unique côté serveur : rien ne révèle l'existence d'un compte.
 */
export function ConnexionForm({
  next = "/compte",
  demoAccounts = [],
  heading = "h1",
  idPrefix = "connexion",
  onSwitch,
  onSuccess,
  embedded = false,
  discordEnabled = false,
  initialError = null,
}: ConnexionFormProps) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const ids = {
    identifier: `${idPrefix}-identifier`,
    password: `${idPrefix}-password`,
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const value = identifier.trim();
    const nextErrors: { identifier?: string; password?: string } = {};
    if (!value) {
      nextErrors.identifier = "Renseignez votre identifiant ou votre adresse e-mail.";
    }
    if (!password) {
      nextErrors.password = "Renseignez votre mot de passe.";
    }
    if (nextErrors.identifier || nextErrors.password) {
      setErrors(nextErrors);
      (nextErrors.identifier ? identifierRef : passwordRef).current?.focus();
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value, password, remember }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiReply;
      if (!res.ok) {
        setFormError(data.error || "Identifiant ou mot de passe incorrect.");
        return;
      }
      if (onSuccess) {
        onSuccess();
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setFormError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <AuthHeading level={heading}>Connexion</AuthHeading>
        <p className="text-sm text-muted">
          Retrouvez votre bibliothèque, votre historique et vos statistiques de lecture.
        </p>
      </div>

      <form
        onSubmit={submit}
        className={embedded ? "space-y-4" : "card space-y-4 p-6"}
        noValidate
      >
        <Field
          label="Identifiant ou adresse e-mail"
          htmlFor={ids.identifier}
          error={errors.identifier}
        >
          <input
            id={ids.identifier}
            name="identifier"
            type="text"
            autoComplete="username"
            required
            maxLength={320}
            placeholder="Pseudo ou vous@exemple.fr"
            value={identifier}
            aria-invalid={Boolean(errors.identifier)}
            aria-describedby={errors.identifier ? `${ids.identifier}-error` : undefined}
            ref={identifierRef}
            onChange={(e) => setIdentifier(e.target.value)}
            className="input"
          />
        </Field>

        <Field label="Mot de passe" htmlFor={ids.password} error={errors.password}>
          <div className="relative">
            <input
              id={ids.password}
              name="password"
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? `${ids.password}-error` : undefined}
              ref={passwordRef}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-11"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-muted hover:text-fg"
              aria-label={reveal ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        <label
          className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted"
          htmlFor={`${idPrefix}-remember`}
        >
          <input
            id={`${idPrefix}-remember`}
            name="remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-[var(--accent-text)]"
          />
          Se souvenir de moi
        </label>

        {/* Région vivante : le refus d'identification est annoncé, jamais discriminant. */}
        <div role="alert" aria-live="assertive" className="space-y-2">
          {formError && (
            <p className="rounded-xl border border-adult/40 bg-adult/5 px-3 py-2 text-sm text-adult">
              {formError}
            </p>
          )}
        </div>

        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          <LogIn className="size-4" />
          {busy ? "Connexion…" : "Se connecter"}
        </Button>

        <OAuthButtons
          className="border-t border-line pt-4"
          discordEnabled={discordEnabled}
          next={next}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          {onSwitch ? (
            <button
              type="button"
              onClick={() => onSwitch("oublie")}
              className="link-muted inline-flex min-h-11 items-center gap-1.5"
            >
              <KeyRound className="size-3.5" />
              Mot de passe oublié ?
            </button>
          ) : (
            <Link href="/mot-de-passe-oublie" className="link-muted inline-flex min-h-11 items-center gap-1.5">
              <KeyRound className="size-3.5" />
              Mot de passe oublié ?
            </Link>
          )}
          {onSwitch ? (
            <button
              type="button"
              onClick={() => onSwitch("inscription")}
              className="link-muted inline-flex min-h-11 items-center font-semibold"
            >
              Créer un compte
            </button>
          ) : (
            <Link href="/inscription" className="link-muted inline-flex min-h-11 items-center font-semibold">
              Créer un compte
            </Link>
          )}
        </div>
      </form>

      {demoAccounts.length > 0 && (
        <section className="rounded-2xl border border-warn/40 bg-warn/10 p-4 text-sm">
          <p className="font-semibold text-warn">Mode démonstration</p>
          <p className="mt-1 text-xs text-warn/80">
            Appwrite n&apos;est pas configuré : cliquez sur un compte pour remplir le formulaire.
          </p>
          <ul className="mt-3 space-y-2">
            {demoAccounts.map((account) => (
              <li key={account.email}>
                <button
                  type="button"
                  onClick={() => {
                    setIdentifier(account.email);
                    setPassword(account.password);
                    setErrors({});
                    setFormError(null);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-warn"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-fg">
                      {account.email}
                    </span>
                    <span className="block truncate text-[11px] text-muted">
                      {account.pseudo} · {account.password}
                    </span>
                  </span>
                  <span className="badge shrink-0 bg-surface2 text-muted">
                    {ROLE_LABELS[account.role]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
