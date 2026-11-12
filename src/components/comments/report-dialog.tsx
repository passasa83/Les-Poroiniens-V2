"use client";

import { Flag, Loader2, X } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";

export function ReportDialog({
  open,
  reasons,
  onClose,
  onSubmit,
}: {
  open: boolean;
  reasons: Array<{ value: string; label: string }>;
  onClose: () => void;
  onSubmit: (raison: string, details: string) => Promise<void>;
}) {
  const [raison, setRaison] = useState(reasons[0]?.value ?? "autre");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(raison, details);
      setDetails("");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Signalement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Signaler ce commentaire">
      <div className="space-y-4 text-sm">
        <div className="space-y-2">
          {reasons.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-muted">
              <input
                type="radio"
                name="report-reason"
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
          <label className="label" htmlFor="report-details">
            Précisions (facultatif)
          </label>
          <textarea
            id="report-details"
            className="input min-h-20 resize-y"
            maxLength={2000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </div>
        {error && <p className="text-xs text-adult">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            <X className="size-4" /> Annuler
          </button>
          <button type="button" className="btn-danger" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}
            Envoyer le signalement
          </button>
        </div>
      </div>
    </Modal>
  );
}
