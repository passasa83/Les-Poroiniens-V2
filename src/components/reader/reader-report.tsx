"use client";

import { Flag, Loader2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";

const REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: "page_manquante", label: "Page manquante" },
  { value: "mauvaise_qualite", label: "Mauvaise qualité" },
  { value: "mauvais_ordre", label: "Mauvais ordre" },
  { value: "autre", label: "Autre" },
];

/**
 * Signalement d’un problème de chapitre (« Signaler un problème »).
 * Extrait du lecteur pour être réutilisé par la barre haute et l’écran de fin.
 * `page` permet de pré-remplir le motif quand le signalement vient d’une page
 * en échec de chargement (le parent re-clé le composant quand `page` change).
 */
export function ReportDialog({
  open,
  onClose,
  chapterId,
  chapterNumero,
  page,
}: {
  open: boolean;
  onClose: () => void;
  chapterId: string;
  chapterNumero: number;
  page: number | null;
}) {
  const [raison, setRaison] = useState(
    typeof page === "number" ? "page_manquante" : REPORT_REASONS[0].value,
  );
  const [details, setDetails] = useState(
    typeof page === "number"
      ? `Page ${page + 1} du chapitre ${chapterNumero} : impossible à charger malgré les reprises automatiques.`
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "chapter", targetId: chapterId, raison, details }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 401) {
        setError("Vous devez être connecté pour signaler un problème.");
        return;
      }
      if (!res.ok) {
        setError(data?.error ?? "Signalement impossible, réessayez.");
        return;
      }
      setDetails("");
      onClose();
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Signaler un problème">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Ce problème sera transmis à l’équipe de modération.
        </p>
        <div className="space-y-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex min-h-11 items-center gap-2 text-muted">
              <input
                type="radio"
                name="reader-report-reason"
                value={r.value}
                checked={raison === r.value}
                onChange={() => setRaison(r.value)}
                className="accent-primary"
              />
              {r.label}
            </label>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="reader-report-details">
            Détail (facultatif)
          </label>
          <textarea
            id="reader-report-details"
            className="input min-h-20 resize-y"
            maxLength={2000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Ex. : la page 7 manque, les planches sont inversées…"
          />
        </div>
        {error && <p className="text-xs text-adult">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="btn-danger" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}
            Envoyer
          </button>
        </div>
      </div>
    </Modal>
  );
}
