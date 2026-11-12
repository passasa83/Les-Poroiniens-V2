"use client";

import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button, Card, Field, Input, Select } from "@/components/ui/kit";
import type { Role } from "@/lib/types";

type UserLite = { userId: string; pseudo: string; role: Role };

/** Réinitialisation du mot de passe d'un membre (communiqué hors ligne). */
export function PasswordResetCard({ users }: { users: UserLite[] }) {
  // Réinitialisation de mot de passe
  const [targetUser, setTargetUser] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ tone: "ok" | "adult"; text: string } | null>(
    null,
  );

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
    <Card className="space-y-4 p-5">
      <h2 className="section-title flex items-center gap-2">
        <KeyRound className="size-4 text-primary" /> Réinitialisation d&apos;un mot de passe
      </h2>
      <p className="text-xs text-muted">
        Aucun mail n&apos;est envoyé au lancement : communiquez le nouveau mot de passe hors ligne.
        La valeur n&apos;est ni journalisée ni affichée.
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
            {resetBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
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
  );
}
