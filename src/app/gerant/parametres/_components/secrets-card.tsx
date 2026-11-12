"use client";

import { useState } from "react";
import { Loader2, Lock, RefreshCw } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/kit";

export type SecretStatus = {
  key: string;
  label: string;
  present: boolean;
  hint?: string;
};

/** Présence des clés et connexions (jamais leur valeur), relue à la demande. */
export function SecretsCard({ secrets }: { secrets: SecretStatus[] }) {
  // État des secrets rechargé côté client pour vérifier la réponse masquée.
  const [secretList, setSecretList] = useState(secrets);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [secretsBusy, setSecretsBusy] = useState(false);

  async function refreshSecrets() {
    setSecretsBusy(true);
    setSecretError(null);
    try {
      const res = await fetch("/api/owner/settings");
      const data = (await res.json().catch(() => null)) as {
        secrets?: Record<string, { label: string; present: boolean }>;
      } | null;
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

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="section-title flex items-center gap-2">
          <Lock className="size-4 text-primary" /> Clés et connexions
        </h2>
        <Button type="button" onClick={refreshSecrets} disabled={secretsBusy}>
          {secretsBusy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          Actualiser l&apos;état
        </Button>
      </div>

      <p className="text-xs text-muted">
        Pour des raisons de sécurité, seuls la <span className="text-fg">présence</span> ou l&apos;
        <span className="text-fg">absence</span> de chaque secret sont affichées : les valeurs ne
        sont jamais renvoyées par l&apos;API ni journalisées.
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
              {secret.hint && (
                <span className="mt-0.5 block text-xs text-muted/80">{secret.hint}</span>
              )}
            </span>
            <Badge tone={secret.present ? "ok" : "neutral"}>
              {secret.present ? "Présent" : "Absent"}
            </Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
