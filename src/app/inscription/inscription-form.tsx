"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, UserPlus } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/kit";

type ApiReply = { error?: string };

/**
 * Inscription (§7.1) : l'e-mail n'est PAS vérifié au lancement, aucun fournisseur
 * de mails n'étant branché (§14.3). L'anti-bot repose sur un honeypot
 * (`website`, invisible pour les humains) doublé d'une limitation de débit
 * côté API.
 */
export function InscriptionForm() {
  const router = useRouter();
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, doit rester vide
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (pseudo.trim().length < 3 || pseudo.trim().length > 24) {
      setError("Le pseudo doit faire entre 3 et 24 caractères.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Adresse e-mail invalide.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pseudo: pseudo.trim(), email: email.trim(), password, website }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiReply;
      if (!res.ok) {
        setError(data.error || "Inscription impossible pour le moment.");
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-black tracking-tight text-fg">Compte créé</h1>
        </div>
        <div className="card space-y-4 p-6 text-center">
          <CheckCircle2 className="mx-auto size-9 text-ok" />
          <p className="text-sm text-fg">
            Bienvenue ! Votre compte est actif et vous êtes déjà connecté.
          </p>
          <p className="rounded-xl border border-line bg-surface2 p-3 text-xs text-muted">
            L&apos;adresse e-mail n&apos;est <strong>pas vérifiée</strong> : aucun service
            d&apos;envoi de mails n&apos;est actif au lancement du site (aucun e-mail ne vous sera
            d&apos;ailleurs envoyé).
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/compte" className="btn-primary">
              Accéder à mon compte
            </Link>
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
        <h1 className="text-2xl font-black tracking-tight text-fg">Inscription</h1>
        <p className="text-sm text-muted">
          Gratuit, sans publicité : bibliothèque, historique et statistiques de lecture.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
        <Field
          label="Pseudo"
          htmlFor="pseudo"
          hint="3 à 24 caractères, visible sur vos commentaires et votre profil."
        >
          <Input
            id="pseudo"
            name="pseudo"
            type="text"
            autoComplete="username"
            required
            minLength={3}
            maxLength={24}
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
          />
        </Field>

        <Field label="Adresse e-mail" htmlFor="email">
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

        <Field label="Mot de passe" htmlFor="password" hint="8 caractères minimum.">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        <Field label="Confirmer le mot de passe" htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        {/* Honeypot : hors écran, jamais à remplir par un humain */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] h-px w-px overflow-hidden"
          style={{ top: "auto" }}
        >
          <label htmlFor="website">Site web</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
            {error}
          </p>
        )}

        <p className="rounded-xl border border-line bg-surface2 px-3 py-2 text-xs text-muted">
          Aucun e-mail de vérification n&apos;est envoyé : le service d&apos;envoi de mails est
          désactivé au lancement. Vous pourrez toutefois modifier votre mot de passe via une demande
          manuelle.
        </p>

        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          <UserPlus className="size-4" />
          {busy ? "Création du compte…" : "Créer mon compte"}
        </Button>

        <p className="text-center text-sm text-muted">
          Déjà inscrit ?{" "}
          <Link href="/connexion" className="link-muted font-semibold">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  );
}
