"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/kit";
import { Modal } from "@/components/ui/modal";
import {
  SERIES_STATUT_LABELS,
  type ChapterStatus,
  type Classification,
  type Series,
  type SeriesStatus,
  type SeriesType,
} from "@/lib/types";

type SeriesPayload = {
  titre: string;
  titresAlt: string[];
  synopsis: string;
  couverture: string;
  banniere: string;
  statut: SeriesStatus;
  type: SeriesType;
  annee: number | null;
  langue: string;
  classification: Classification;
  genres: string[];
  tags: string[];
  auteurs: string[];
};

/* ── Saisie multi-capsules (titres alternatifs, genres, tags, auteurs) ── */

function ChipsInput({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const item = raw.trim();
    if (!item) return;
    if (!value.some((v) => v.toLowerCase() === item.toLowerCase())) {
      onChange([...value, item]);
    }
    setDraft("");
  };

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(draft);
            }
            if (e.key === "Backspace" && !draft && value.length > 0) {
              onChange(value.slice(0, -1));
            }
          }}
        />
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={() => add(draft)}
          aria-label={`Ajouter « ${label} »`}
        >
          <Plus className="size-4" />
        </button>
      </div>
      {hint && !value.length && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <span key={item} className="chip border-primary/50 text-fg">
              {item}
              <button
                type="button"
                className="ml-1.5 text-muted hover:text-adult"
                onClick={() => onChange(value.filter((v) => v !== item))}
                aria-label={`Retirer ${item}`}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Formulaire de fiche série (création + édition) ───────────────────── */

export function SeriesForm({ mode, series }: { mode: "create" | "edit"; series?: Series }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [titre, setTitre] = useState(series?.titre ?? "");
  const [titresAlt, setTitresAlt] = useState<string[]>(series?.titresAlt ?? []);
  const [synopsis, setSynopsis] = useState(series?.synopsis ?? "");
  const [couverture, setCouverture] = useState(series?.couverture ?? "");
  const [banniere, setBanniere] = useState(series?.banniere ?? "");
  const [statut, setStatut] = useState<SeriesStatus>(series?.statut ?? "en_cours");
  const [type, setType] = useState<SeriesType>(series?.type ?? "manga");
  const [annee, setAnnee] = useState(series?.annee ? String(series.annee) : "");
  const [langue, setLangue] = useState(series?.langue ?? "FR");
  const [classification, setClassification] = useState<Classification>(
    series?.classification ?? "all",
  );
  const [genres, setGenres] = useState<string[]>(series?.genres ?? []);
  const [tags, setTags] = useState<string[]>(series?.tags ?? []);
  const [auteurs, setAuteurs] = useState<string[]>(series?.auteurs ?? []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);

    if (!titre.trim()) {
      setError("Le titre est obligatoire.");
      setBusy(false);
      return;
    }

    const payload: SeriesPayload = {
      titre: titre.trim(),
      titresAlt,
      synopsis,
      couverture: couverture.trim(),
      banniere: banniere.trim(),
      statut,
      type,
      annee: annee.trim() ? Number(annee) : null,
      langue: langue.trim() || "FR",
      classification,
      genres,
      tags,
      auteurs,
    };

    try {
      const res = await fetch(
        mode === "create" ? "/api/admin/series" : `/api/admin/series/${series!.id}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | { error?: string; series?: Series }
        | null;
      if (!res.ok) {
        setError(data?.error ?? "Enregistrement impossible.");
        return;
      }
      if (mode === "create") {
        router.push(`/admin/series/${data?.series?.id ?? ""}`);
        router.refresh();
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <Field label="Titre *" htmlFor="s-titre">
            <Input
              id="s-titre"
              value={titre}
              onChange={(e) => setTitre(e.target.value)}
              required
              maxLength={200}
              placeholder="Titre principal"
            />
          </Field>
        </div>

        <div className="md:col-span-2">
          <ChipsInput
            id="s-alt"
            label="Titres alternatifs"
            hint="Appuyez sur Entrée pour ajouter un titre alternatif (recherche incluses)."
            value={titresAlt}
            onChange={setTitresAlt}
            placeholder="Titre original…"
          />
        </div>

        <div className="md:col-span-2">
          <Field label="Synopsis" htmlFor="s-synopsis">
            <Textarea
              id="s-synopsis"
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              maxLength={8000}
              placeholder="Résumé de la série…"
            />
          </Field>
        </div>

        <Field label="Couverture (URL)" htmlFor="s-couverture" hint="Laisser vide pour la couverture générée.">
          <Input
            id="s-couverture"
            value={couverture}
            onChange={(e) => setCouverture(e.target.value)}
            maxLength={500}
            placeholder="/api/img/cover/mon-slug ou https://…"
          />
        </Field>

        <Field label="Bannière (URL)" htmlFor="s-banniere">
          <Input
            id="s-banniere"
            value={banniere}
            onChange={(e) => setBanniere(e.target.value)}
            maxLength={500}
            placeholder="Optionnel"
          />
        </Field>

        <Field label="Statut" htmlFor="s-statut">
          <Select id="s-statut" value={statut} onChange={(e) => setStatut(e.target.value as SeriesStatus)}>
            {(Object.keys(SERIES_STATUT_LABELS) as SeriesStatus[]).map((key) => (
              <option key={key} value={key}>
                {SERIES_STATUT_LABELS[key]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Type" htmlFor="s-type">
          <Select id="s-type" value={type} onChange={(e) => setType(e.target.value as SeriesType)}>
            <option value="manga">Manga</option>
            <option value="manhwa">Manhwa</option>
            <option value="manhua">Manhua</option>
          </Select>
        </Field>

        <Field label="Année" htmlFor="s-annee">
          <Input
            id="s-annee"
            type="number"
            min={1900}
            max={2100}
            value={annee}
            onChange={(e) => setAnnee(e.target.value)}
            placeholder="2024"
          />
        </Field>

        <Field label="Langue" htmlFor="s-langue">
          <Input
            id="s-langue"
            value={langue}
            onChange={(e) => setLangue(e.target.value)}
            maxLength={10}
            placeholder="FR"
          />
        </Field>

        <div className="md:col-span-2">
          <Field
            label="Classification"
            htmlFor="s-classification"
            hint="Le contenu +18 reste masqué derrière la déclaration d'âge (§11)."
          >
            <Select
              id="s-classification"
              value={classification}
              onChange={(e) => setClassification(e.target.value as Classification)}
            >
              <option value="all">Tout public</option>
              <option value="adult">+18</option>
            </Select>
          </Field>
        </div>

        <ChipsInput
          id="s-genres"
          label="Genres"
          value={genres}
          onChange={setGenres}
          placeholder="Action, Aventure…"
        />
        <ChipsInput id="s-tags" label="Tags" value={tags} onChange={setTags} placeholder="golems, école…" />
        <div className="md:col-span-2">
          <ChipsInput
            id="s-auteurs"
            label="Auteurs"
            hint="Saisie multi-capsules : un auteur / artiste par capsule."
            value={auteurs}
            onChange={setAuteurs}
            placeholder="Nom de l'auteur…"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-xl border border-ok/40 bg-ok/10 px-3 py-2 text-sm text-ok">
          Modifications enregistrées.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? "Enregistrement…" : mode === "create" ? "Créer la série" : "Enregistrer"}
        </Button>
        <button type="button" className="btn-ghost" onClick={() => router.push("/admin/series")}>
          Annuler
        </button>
      </div>
    </form>
  );
}

/* ── Suppression d'une série (confirmation) ────────────────────────────── */

export function DeleteSeriesButton({ id, titre }: { id: string; titre: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.push("/admin/series");
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Supprimer la série
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Supprimer la série ?">
        <p className="text-sm text-muted">
          La fiche <span className="font-semibold text-fg">{titre}</span>, ses chapitres, leurs
          pages et ses recommandations seront supprimés définitivement.
        </p>
        {error && <p className="mt-3 text-sm text-adult">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Annuler
          </button>
          <Button variant="danger" onClick={confirmDelete} disabled={busy}>
            {busy ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

/* ── Actions sur un chapitre (réservées au Gérant) ─────────────────────── */

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ChapterActions({
  chapterId,
  numero,
  statut,
  publishAt,
  canPublish,
}: {
  chapterId: string;
  numero: number;
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
        title="Publication, planification et suppression d'un chapitre sont réservées au Gérant (matrice 4.3)."
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

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Supprimer le chapitre ?">
        <p className="text-sm text-muted">
          Le chapitre {numero} et l&apos;index de ses pages seront supprimés définitivement.
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
