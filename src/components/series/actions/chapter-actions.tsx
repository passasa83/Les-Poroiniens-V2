"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { libelleUnite, libelleUniteSingulier } from "@/lib/format";
import { type ChapterStatus, type Unite } from "@/lib/types";

/* ── Actions sur un chapitre (réservées au Gérant) ─────────────────────── */

export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ChapterActions({
  chapterId,
  numero,
  unite,
  statut,
  publishAt,
  canPublish,
}: {
  chapterId: string;
  numero: number;
  /** Organisation de la série : « Tome 3 » au lieu de « Chapitre 3 ». */
  unite?: Unite;
  statut: ChapterStatus;
  publishAt: string | null;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState(() => toLocalInput(publishAt));
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!canPublish) {
    return (
      <span
        className="block text-right text-xs text-muted"
        title="Publication, planification et suppression d'une unité de lecture sont réservées au Gérant."
      >
        Réservé au Gérant
      </span>
    );
  }

  async function patch(body: Record<string, unknown>, successMessage?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${chapterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Action impossible.");
        return;
      }
      if (successMessage) setScheduling(false);
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${chapterId}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Suppression impossible.");
        return;
      }
      setConfirmDelete(false);
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {statut === "published" ? (
          <button
            type="button"
            className="btn-secondary px-2 py-1 text-xs"
            disabled={busy}
            onClick={() => patch({ statut: "draft" })}
          >
            Dépublier
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary px-2 py-1 text-xs"
            disabled={busy}
            onClick={() => patch({ statut: "published" })}
          >
            Publier
          </button>
        )}
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          disabled={busy}
          onClick={() => setScheduling((v) => !v)}
        >
          Planifier
        </button>
        <button
          type="button"
          className="btn-danger px-2 py-1 text-xs"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-3" />
        </button>
      </div>

      {scheduling && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <input
            type="datetime-local"
            className="input w-auto text-xs"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="Date et heure de publication"
          />
          <button
            type="button"
            className="btn-primary px-2 py-1 text-xs"
            disabled={busy || !when}
            onClick={() =>
              patch({ statut: "scheduled", publish_at: new Date(when).toISOString() }, "ok")
            }
          >
            <Check className="size-3" /> Valider
          </button>
        </div>
      )}

      {error && <p className="text-right text-xs text-adult">{error}</p>}

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Supprimer ${libelleUniteSingulier(unite).toLowerCase()} ${numero} ?`}
      >
        <p className="text-sm text-muted">
          {libelleUnite(numero, unite)} et l&apos;index de ses pages seront supprimés
          définitivement.
        </p>
        {error && <p className="mt-3 text-sm text-adult">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>
            Annuler
          </button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            {busy ? "Suppression…" : "Supprimer"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
