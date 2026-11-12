"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Select, Textarea } from "@/components/ui/kit";
import { libelleUnitesPluriel } from "@/lib/format";
import {
  SERIES_STATUT_LABELS,
  type Classification,
  type Series,
  type SeriesStatus,
  type SeriesType,
  type Unite,
} from "@/lib/types";
import { ChipsInput } from "./chips-input";

/**
 * Actions d'une fiche série — partagées par les espaces Gérant (CRUD complet)
 * et Admin (consultation). `basePath` pointe vers l'espace appelant : le
 * formulaire annule et redirige toujours dans l'espace d'origine.
 */

export type SeriesPayload = {
  titre: string;
  titresAlt: string[];
  synopsis: string;
  couverture: string;
  banniere: string;
  statut: SeriesStatus;
  type: SeriesType;
  /** Chapitres ou tomes : commande les libellés affichés sur le site. */
  unite: Unite;
  annee: number | null;
  langue: string;
  classification: Classification;
  genres: string[];
  tags: string[];
  auteurs: string[];
};

/* ── Formulaire de fiche série (création + édition) ───────────────────── */

export function SeriesForm({
  mode,
  series,
  basePath = "/gerant/series",
}: {
  mode: "create" | "edit";
  series?: Series;
  basePath?: string;
}) {
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
  const [unite, setUnite] = useState<Unite>(series?.unite ?? "chapitre");
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
      unite,
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
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        series?: Series;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Enregistrement impossible.");
        return;
      }
      if (mode === "create") {
        router.push(`${basePath}/${data?.series?.id ?? ""}`);
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

        <Field
          label="Couverture (URL)"
          htmlFor="s-couverture"
          hint="Laisser vide pour la couverture générée."
        >
          <Input
            id="s-couverture"
            value={couverture}
            onChange={(e) => setCouverture(e.target.value)}
            maxLength={500}
            placeholder="/api/img/cover/mon-slug ou https://…"
          />
        </Field>

        <Field label="Bannière (URL)" htmlFor="s-banniere" hint="Optionnel">
          <Input
            id="s-banniere"
            value={banniere}
            onChange={(e) => setBanniere(e.target.value)}
            maxLength={500}
            placeholder="https://…"
          />
        </Field>

        <Field
          label="Statut"
          htmlFor="s-statut"
          hint={`« Archivée » retire la série du catalogue public sans supprimer ses ${libelleUnitesPluriel(
            unite,
          ).toLowerCase()}.`}
        >
          <Select
            id="s-statut"
            value={statut}
            onChange={(e) => setStatut(e.target.value as SeriesStatus)}
          >
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
            <option value="light_novel">Light Novel</option>
          </Select>
        </Field>

        <Field
          label="Organisation"
          htmlFor="s-unite"
          hint="Décide des libellés : « Tome 3 » ou « Chapitre 3 »."
        >
          <Select id="s-unite" value={unite} onChange={(e) => setUnite(e.target.value as Unite)}>
            <option value="chapitre">Chapitres</option>
            <option value="tome">Tomes</option>
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
            hint="Le contenu +18 reste réservé aux membres connectés ayant validé la déclaration d'âge."
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
        <ChipsInput
          id="s-tags"
          label="Tags"
          value={tags}
          onChange={setTags}
          placeholder="golems, école…"
        />
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
        <button type="button" className="btn-ghost" onClick={() => router.push(basePath)}>
          Annuler
        </button>
      </div>
    </form>
  );
}
