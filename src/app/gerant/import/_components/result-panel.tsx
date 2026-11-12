"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Rocket } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/kit";
import { libelleUnite } from "@/lib/format";
import type { ImportResult, ImportStatut } from "./types";

/* ── Publication après import ────────────────────────────────────────── */

export function ResultPanel({
  result,
  onChanged,
}: {
  result: ImportResult;
  onChanged: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState("");
  const [currentStatut, setCurrentStatut] = useState<ImportStatut>(result.statut);
  const [nasError, setNasError] = useState<string | null>(null);

  const statutLabel =
    currentStatut === "published"
      ? "Publié"
      : currentStatut === "scheduled"
        ? "Programmé"
        : "Brouillon";
  const statutTone = currentStatut === "published" ? "ok" : "warn";
  const isPublished = currentStatut === "published";

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    setNasError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${result.chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        nas?: { action?: string; error?: string };
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Action impossible.");
        return;
      }
      if (typeof body.statut === "string") setCurrentStatut(body.statut as ImportStatut);
      if (data?.nas?.error) setNasError(data.nas.error);
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 border-primary/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">
            {libelleUnite(result.numero, result.unite)} créé — {result.nbPages} pages indexées
          </h2>
          <p className="text-sm text-muted">
            {result.seriesTitre} ·{" "}
            {result.storage === "nas"
              ? "index lu sur le NAS (dimensions et hash en base)"
              : "pages de démonstration"}
          </p>
        </div>
        <Badge tone={statutTone}>{statutLabel}</Badge>
      </div>

      {(result.warning || nasError) && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {result.warning ?? nasError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {result.slug && (
          <a
            href={`/serie/${result.slug}/chapitre-${result.numero}`}
            target="_blank"
            rel="noreferrer"
            className="btn-secondary"
          >
            <ExternalLink className="size-4" /> Ouvrir dans le lecteur
          </a>
        )}
        {!isPublished && (
          <Button
            type="button"
            variant="primary"
            disabled={busy}
            onClick={() => patch({ statut: "published" })}
          >
            <Rocket className="size-4" /> Publier maintenant
          </Button>
        )}
        {!isPublished && (
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              className="input w-auto"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              aria-label="Date et heure de publication"
            />
            <Button
              type="button"
              disabled={busy || !when}
              onClick={() =>
                patch({ statut: "scheduled", publish_at: new Date(when).toISOString() })
              }
            >
              Planifier
            </Button>
          </div>
        )}
        <button type="button" className="btn-ghost" onClick={onChanged} disabled={busy}>
          Nouvel import
        </button>
      </div>

      {error && <p className="text-sm text-adult">{error}</p>}
      <p className="text-xs text-muted">
        Publication = déplacement <code className="font-mono">staging/</code> →{" "}
        <code className="font-mono">public/</code> sur le NAS, purge Cloudflare ciblée et entrée au
        journal d&apos;audit (acteur, date, IP).
      </p>
    </Card>
  );
}
