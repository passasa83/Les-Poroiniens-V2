"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check } from "lucide-react";
import { Button, Field, Select } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { libelleUnitesPluriel } from "@/lib/format";
import { SERIES_STATUT_LABELS, type SeriesStatus, type Unite } from "@/lib/types";

/* ── Archivage réversible (suppression douce) ─────────────────────────── */

export const RESTORE_STATUTS: SeriesStatus[] = ["en_cours", "termine", "hiatus", "abandonne"];

export function ArchiveSeriesButton({
  id,
  titre,
  unite,
  archived = false,
  returnTo,
  showLabels = true,
}: {
  id: string;
  titre: string;
  /** Organisation de la série (« ses tomes sont conservés »). */
  unite?: Unite;
  archived?: boolean;
  returnTo?: string;
  showLabels?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restore, setRestore] = useState<SeriesStatus>("en_cours");

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/series/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: archived ? restore : "archive" }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Action impossible.");
        return;
      }
      setOpen(false);
      if (returnTo && archived) router.push(returnTo);
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => setOpen(true)}
        title={
          archived
            ? "Remettre la série dans le catalogue"
            : "Retirer la série du catalogue sans rien supprimer"
        }
      >
        {archived ? (
          <>
            <ArchiveRestore className="size-4" /> {showLabels ? "Déarchiver" : undefined}
          </>
        ) : (
          <>
            <Archive className="size-4" /> {showLabels ? "Archiver" : undefined}
          </>
        )}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={archived ? "Déarchiver la série ?" : "Archiver la série ?"}
      >
        <div className="space-y-3 text-sm text-muted">
          <p>
            {archived ? (
              <>
                <span className="font-semibold text-fg">{titre}</span> redevient visible dans le
                catalogue public et ses pages refontes apparaître dans les listes.
              </>
            ) : (
              <>
                <span className="font-semibold text-fg">{titre}</span> quitte le catalogue public :
                fiche, {libelleUnitesPluriel(unite).toLowerCase()}, favoris et historiques sont
                conservés. Rien n&apos;est supprimé, et l&apos;opération est réversible depuis cette
                même page.
              </>
            )}
          </p>
          {archived && (
            <Field
              label="Statut à la sortie de l'archivage"
              htmlFor="restore-statut"
              hint="L'archivage remplace le statut, il faut donc le resélectionner."
            >
              <Select
                id="restore-statut"
                value={restore}
                onChange={(e) => setRestore(e.target.value as SeriesStatus)}
              >
                {RESTORE_STATUTS.map((key) => (
                  <option key={key} value={key}>
                    {SERIES_STATUT_LABELS[key]}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {error && <p className="text-sm text-adult">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <Button variant="primary" onClick={apply} disabled={busy}>
            {busy ? (
              "Application…"
            ) : archived ? (
              <>
                <Check className="size-4" /> Déarchiver
              </>
            ) : (
              <>
                <Archive className="size-4" /> Archiver
              </>
            )}
          </Button>
        </div>
      </Modal>
    </>
  );
}
