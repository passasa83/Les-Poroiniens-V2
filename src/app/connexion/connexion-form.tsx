"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound, LogIn } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/kit";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/lib/types";

export type DemoAccount = {
  email: string;
  password: string;
  pseudo: string;
  role: Role;
};

type ApiReply = { error?: string };

export function ConnexionForm({
  next,
  demoAccounts,
}: {
  next: string;
  demoAccounts: DemoAccount[];
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as ApiReply;
      if (!res.ok) {
        setError(data.error || "Identifiants invalides.");
        return;
      }
      router.push(next);
      router.refresh();
    } catch {
      setError("Impossible de contacter le serveur. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-black tracking-tight text-fg">Connexion</h1>
        <p className="text-sm text-muted">
          Retrouvez votre bibliothèque, votre historique et vos statistiques de lecture.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
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

        <Field label="Mot de passe" htmlFor="password">
          <div className="relative">
            <input
              id="password"
              name="password"
              type={reveal ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-11"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-fg"
              aria-label={reveal ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        {error && (
          <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          <LogIn className="size-4" />
          {busy ? "Connexion…" : "Se connecter"}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <Link href="/mot-de-passe-oublie" className="link-muted inline-flex items-center gap-1.5">
            <KeyRound className="size-3.5" />
            Mot de passe oublié ?
          </Link>
          <Link href="/inscription" className="link-muted">
            Créer un compte
          </Link>
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
                    setEmail(account.email);
                    setPassword(account.password);
                    setError(null);
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
