"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { KeyRound, Send } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/kit";

type ApiReply = { error?: string; message?: string };

/**
 * Réinitialisation de mot de passe : manuelle au lancement.
 * Aucun fournisseur de mails n'est branché, la demande est simplement
 * enregistrée et notifiée au Gérant. La réponse est la même quelle que soit
 * l'adresse saisie (pas d'énumération d'e-mails).
 */
export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Adresse e-mail invalide.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiReply;
      if (!res.ok) {
        setError(data.error || "Impossible d'enregistrer votre demande.");
        return;
      }
      setMessage(
        data.message ??
          "Votre demande a bien été enregistrée. Un administrateur traitera la réinitialisation.",
      );
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {message ? (
        <div className="card space-y-4 p-6 text-center">
          <p className="text-sm text-fg">{message}</p>
          <p className="rounded-xl border border-line bg-surface2 p-3 text-xs text-muted">
            Aucun service d&apos;envoi de mails n&apos;est actif : votre demande est notifiée au
            Gérant du site, qui réinitialisera votre mot de passe depuis le back-office. La réponse
            est identique quelle que soit l&apos;adresse saisie, pour éviter toute énumération de
            comptes.
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/connexion" className="btn-primary">
              Retour à la connexion
            </Link>
            <Link href="/" className="btn-ghost">
              Retour à l&apos;accueil
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
          <Field
            label="Adresse e-mail du compte"
            htmlFor="email"
            hint="Indiquez l'adresse utilisée lors de votre inscription."
          >
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={320}
              placeholder="vous@exemple.fr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          {error && (
            <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
              {error}
            </p>
          )}

          <p className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-muted">
            <KeyRound className="mr-1 inline size-3.5" />
            Étant donné qu&apos;aucun e-mail ne peut être envoyé pour l&apos;instant, un mot de passe
            temporaire vous sera communiqué manuellement par un administrateur.
          </p>

          <Button type="submit" variant="primary" disabled={busy} className="w-full">
            <Send className="size-4" />
            {busy ? "Envoi de la demande…" : "Demander une réinitialisation"}
          </Button>

          <p className="text-center text-sm text-muted">
            <Link href="/connexion" className="link-muted">
              Retour à la connexion
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
