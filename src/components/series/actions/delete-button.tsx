"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, Field, Input } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import { libelleUnitesPluriel } from "@/lib/format";
import { type Unite } from "@/lib/types";

/* ── Suppression définitive (irréversible) ────────────────────────────── */

/**
 * Suppression en cascade avec garde-fous : le titre exact doit être retapé,
 * la saisie est normalisée (espaces, casse) pour éviter le piège à faute de
 * frappe. Seul le Gérant y accède — le serveur revérifie le rôle.
 */
export function DeleteSeriesButton({
  id,
  titre,
  unite,
  returnTo = "/gerant/series",
  showLabels = true,
}: {
  id: string;
  titre: string;
  /** Organisation de la série (« ses tomes, leurs planches »). */
  unite?: Unite;
  returnTo?: string;
  showLabels?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const matches = normalize(typed) === normalize(titre) && typed.trim().length > 0;

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/series/${id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Suppression impossible.");
        return;
      }
      setOpen(false);
      router.push(returnTo);
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)} title="Suppression définitive">
        <Trash2 className="size-4" /> {showLabels ? "Supprimer définitivement" : undefined}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Supprimer définitivement la série ?">
        <div className="space-y-3 text-sm text-muted">
          <p>
            La fiche <span className="font-semibold text-fg">{titre}</span>, ses{" "}
            {libelleUnitesPluriel(unite).toLowerCase()}, leurs pages, ses recommandations et les
            erreurs d&apos;images associées seront supprimés définitivement.{" "}
            <span className="font-semibold text-adult">Sans retour possible.</span>
          </p>
          <p className="text-xs">
            Pour un retrait réversible, préférez l&apos;archivage : rien n&apos;est perdu et la
            série redevient visible en un clic.
          </p>
          <Field
            label="Tapez le titre de la série pour confirmer"
            htmlFor="delete-confirm"
            hint="La casse et les accents n'ont pas d'importance."
          >
            <Input
              id="delete-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={titre}
              autoComplete="off"
            />
          </Field>
          {error && <p className="text-sm text-adult">{error}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <Button variant="danger" onClick={confirmDelete} disabled={busy || !matches}>
            {busy ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
