"use client";

import clsx from "clsx";
import { Bookmark, Heart, Loader2 } from "lucide-react";
import { useState } from "react";
import type { LibraryStatus } from "@/lib/types";

const STATUTS: Array<{ value: LibraryStatus; label: string }> = [
  { value: "en_cours", label: "En cours" },
  { value: "a_lire", label: "À lire" },
  { value: "termine", label: "Terminé" },
  { value: "en_pause", label: "En pause" },
  { value: "abandonne", label: "Abandonné" },
];

export interface FollowState {
  statut: LibraryStatus | null;
  favori: boolean;
  note: number | null;
}

/**
 * Suivi de la série (bibliothèque) + notation 1-10.
 * Toutes les écritures passent par POST /api/reading/follow (§14.1).
 */
export function FollowButton({
  seriesId,
  initial,
}: {
  seriesId: string;
  initial: FollowState;
}) {
  const [entry, setEntry] = useState<FollowState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const followed = entry.statut !== null;

  async function save(patch: {
    statut?: LibraryStatus | null;
    favori?: boolean;
    note?: number | null;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reading/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seriesId, ...patch }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        entry?: FollowState | null;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Enregistrement impossible, réessayez.");
        return;
      }
      setEntry(data?.entry ?? { ...entry, ...patch });
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {!followed ? (
          <button
            type="button"
            className="btn-primary"
            disabled={busy}
            onClick={() => save({ statut: "en_cours" })}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Bookmark className="size-4" />}
            Suivre / Ajouter à la bibliothèque
          </button>
        ) : (
          <>
            <label className="sr-only" htmlFor={`statut-${seriesId}`}>
              Statut de lecture
            </label>
            <select
              id={`statut-${seriesId}`}
              className="input w-auto"
              value={entry.statut ?? "en_cours"}
              disabled={busy}
              onChange={(e) => save({ statut: e.target.value as LibraryStatus })}
            >
              {STATUTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost text-sm"
              disabled={busy}
              onClick={() => save({ statut: null })}
            >
              Retirer
            </button>
          </>
        )}

        <button
          type="button"
          disabled={busy || !followed}
          aria-pressed={entry.favori}
          title={followed ? "Ajouter aux favoris" : "Suivez la série pour l’ajouter aux favoris"}
          onClick={() => save({ favori: !entry.favori })}
          className={clsx("btn-ghost px-2", entry.favori && "text-adult")}
        >
          <Heart className={clsx("size-4", entry.favori && "fill-current")} />
          <span className="sr-only">Favori</span>
        </button>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Votre note
        </p>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Noter de 1 à 10">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              disabled={busy}
              aria-pressed={entry.note === n}
              onClick={() => save({ note: entry.note === n ? null : n })}
              className={clsx(
                "size-11 rounded-lg border text-xs font-semibold transition-colors",
                entry.note === n
                  ? "border-primary bg-primary/20 text-fg"
                  : "border-line bg-surface2 text-muted hover:border-primary hover:text-fg",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          {entry.note ? `Note actuelle : ${entry.note}/10` : "Pas encore notée."}
        </p>
      </div>

      {error && <p className="text-xs text-adult">{error}</p>}
    </div>
  );
}
