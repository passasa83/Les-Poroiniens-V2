"use client";

import { FileText, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/kit";
import type { Unite } from "@/lib/types";

/**
 * Édition du texte des chapitres light novel (interface Gérant) :
 * `LnChapterEditor` remplit / écrit le `.txt` d'un chapitre existant,
 * `LnNewChapter` crée le chapitre (ligne `chapters` + fichier sur le NAS).
 * Les deux parlent aux routes `/api/admin/chapters…` (Gérant uniquement).
 */

/** Voile + panneau centré, fermé par Échap ou le clic sur le voile. */
function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-2xl">
        <h3 className="section-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/** Compteur de paragraphes (double retour à la ligne), rappel des règles du lecteur. */
function compterParagraphes(texte: string): number {
  return texte
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .filter((p) => p.trim().length > 0).length;
}

export function LnChapterEditor({
  chapterId,
  numero,
  unite,
}: {
  chapterId: string;
  numero: number;
  unite?: Unite;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [texte, setTexte] = useState("");
  const [chargement, setChargement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = useCallback(() => {
    // Reset dans l'événement (jamais dans l'effet) : état propre à chaque ouverture.
    setOpen(true);
    setError(null);
    setTexte("");
    setChargement(true);
  }, []);

  // Rechargement à chaque ouverture : fermer sans enregistrer ne casse rien.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/chapters/${chapterId}/content`);
        const data = (await res.json().catch(() => null)) as { texte?: string } | null;
        if (cancelled) return;
        if (!res.ok) {
          setError((data as { error?: string } | null)?.error ?? "Chargement impossible.");
          return;
        }
        setTexte(data?.texte ?? "");
      } catch {
        if (!cancelled) setError("Erreur réseau : réessayez.");
      } finally {
        if (!cancelled) setChargement(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, chapterId]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/chapters/${chapterId}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texte }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Enregistrement impossible.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }, [chapterId, texte, router]);

  return (
    <>
      <button
        type="button"
        className="btn-secondary px-2 py-1 text-xs"
        onClick={openDialog}
        title={`Éditer le texte du ${unite === "tome" ? "tome" : "chapitre"} ${numero}`}
      >
        <FileText className="size-3.5" /> Texte
      </button>

      <Dialog
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={`Texte — ${unite === "tome" ? "Tome" : "Chapitre"} ${numero}`}
      >
        {error && (
          <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
            {error}
          </p>
        )}
        <p className="text-xs text-muted">
          Paragraphes séparés par une ligne vide. Enregistré sur le NAS (
          <code className="font-mono">…/Chapitre {numero}.txt</code>) puis lu par le lecteur.
        </p>
        <Textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          disabled={chargement || busy}
          placeholder={chargement ? "Chargement du texte…" : "Texte du chapitre…"}
          aria-label={`Texte du ${unite === "tome" ? "tome" : "chapitre"} ${numero}`}
          className="input min-h-[16rem] w-full resize-y font-mono text-sm"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {texte.length.toLocaleString("fr-FR")} caractères ·{" "}
            {compterParagraphes(texte)} paragraphes
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Fermer
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={busy || chargement}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

export function LnNewChapter({ seriesId, unite }: { seriesId: string; unite?: Unite }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [numero, setNumero] = useState("");
  const [titre, setTitre] = useState("");
  const [texte, setTexte] = useState("");
  const [statut, setStatut] = useState<"draft" | "published">("draft");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const libelle = unite === "tome" ? "tome" : "chapitre";

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setError(null);
  }, [busy]);

  const save = useCallback(async () => {
    const value = Number(numero.replace(",", "."));
    if (!Number.isFinite(value) || value < 1) {
      setError("Numéro invalide (ex. 3 ou 12.5).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/chapters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          series_id: seriesId,
          numero: value,
          ...(titre.trim() ? { titre: titre.trim() } : {}),
          texte,
          statut,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Création impossible.");
        return;
      }
      setOpen(false);
      setNumero("");
      setTitre("");
      setTexte("");
      setStatut("draft");
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }, [numero, titre, texte, statut, seriesId, router]);

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Nouveau {libelle} texte
      </Button>

      <Dialog open={open} onClose={close} title={`Nouveau ${libelle} texte`}>
        {error && (
          <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Numéro" htmlFor="ln-numero" hint="3, 12.5…">
            <Input
              id="ln-numero"
              type="number"
              min={1}
              step="any"
              inputMode="decimal"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              disabled={busy}
            />
          </Field>
          <Field label="Titre (optionnel)" htmlFor="ln-titre">
            <Input
              id="ln-titre"
              type="text"
              maxLength={200}
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              disabled={busy}
              placeholder="Titre du chapitre"
            />
          </Field>
          <Field label="Statut" htmlFor="ln-statut">
            <Select
              id="ln-statut"
              value={statut}
              onChange={(e) => setStatut(e.target.value as "draft" | "published")}
              disabled={busy}
            >
              <option value="draft">Brouillon</option>
              <option value="published">Publié</option>
            </Select>
          </Field>
        </div>

        <Field
          label="Texte"
          htmlFor="ln-texte"
          hint="Paragraphes séparés par une ligne vide — écrit sur le NAS à la création."
        >
          <Textarea
            id="ln-texte"
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            disabled={busy}
            placeholder="Texte du chapitre…"
            className="input min-h-[16rem] w-full resize-y font-mono text-sm"
          />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {texte.length.toLocaleString("fr-FR")} caractères · {compterParagraphes(texte)}{" "}
            paragraphes
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => void save()}
              disabled={busy || texte.trim().length === 0}
            >
              {busy ? "Création…" : "Créer le chapitre"}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
