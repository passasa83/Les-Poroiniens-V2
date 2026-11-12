import type { FormEvent } from "react";
import { Loader2, Rocket } from "lucide-react";
import { Button, Field, Input, Select } from "@/components/ui/kit";
import { libelleUnite, libelleUniteSingulier, libelleUnitesPluriel } from "@/lib/format";
import type { Classification, Unite } from "@/lib/types";
import type { ImportStatut, SeriesLite } from "./types";

/* ── Formulaire commun ───────────────────────────────────────────────── */

export function ImportForm(props: {
  series: SeriesLite[];
  seriesFilter: string;
  onFilter: (value: string) => void;
  seriesId: string;
  onSeries: (id: string) => void;
  numero: string;
  onNumero: (value: string) => void;
  titre: string;
  onTitre: (value: string) => void;
  /** Organisation de la série cible : « Chapitre » ou « Tome ». */
  unite: Unite;
  classification: Classification;
  onClassification: (value: Classification) => void;
  error: string | null;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  source: "nas" | "imgchest";
  statut: ImportStatut;
  onStatut: (value: ImportStatut) => void;
  publishAt: string;
  onPublishAt: (value: string) => void;
}) {
  /** Sources où seuls des noms / URLs sont indexés (aucun octet transité). */
  const indexed = props.source === "nas" || props.source === "imgchest";
  const sing = libelleUniteSingulier(props.unite).toLowerCase();
  const plur = libelleUnitesPluriel(props.unite).toLowerCase();
  const submitLabel =
    props.statut === "published"
      ? indexed
        ? "Indexer et publier"
        : "Importer et publier"
      : props.statut === "scheduled"
        ? "Programmer la publication"
        : indexed
          ? `Indexer le ${sing} (brouillon)`
          : "Importer en brouillon";

  return (
    <form onSubmit={props.onSubmit} className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
        <Field label="Filtrer les séries" htmlFor={`${props.source}-filter`}>
          <Input
            id={`${props.source}-filter`}
            value={props.seriesFilter}
            onChange={(e) => props.onFilter(e.target.value)}
            placeholder="Titre de la série…"
          />
        </Field>
        <Field label="Série *" htmlFor={`${props.source}-series`}>
          <Select
            id={`${props.source}-series`}
            value={props.seriesId}
            onChange={(e) => props.onSeries(e.target.value)}
          >
            <option value="">— Choisir une série —</option>
            {props.series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.titre}
                {s.classification === "adult" ? " (+18)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label={`Numéro de ${sing} *`} htmlFor={`${props.source}-numero`}>
        <Input
          id={`${props.source}-numero`}
          type="number"
          min={1}
          value={props.numero}
          onChange={(e) => props.onNumero(e.target.value)}
          placeholder="25"
        />
      </Field>

      <Field
        label={`Titre du ${sing}`}
        htmlFor={`${props.source}-titre`}
        hint={`Facultatif (« ${libelleUnite(25, props.unite)} » par défaut).`}
      >
        <Input
          id={`${props.source}-titre`}
          value={props.titre}
          onChange={(e) => props.onTitre(e.target.value)}
          maxLength={200}
        />
      </Field>

      <Field label="Classification" htmlFor={`${props.source}-classification`}>
        <Select
          id={`${props.source}-classification`}
          value={props.classification}
          onChange={(e) => props.onClassification(e.target.value as Classification)}
        >
          <option value="all">Tout public</option>
          <option value="adult">+18</option>
        </Select>
      </Field>

      <Field
        label="Statut à la création"
        htmlFor={`${props.source}-statut`}
        hint={`Les ${plur} programmés sont publiés automatiquement par le cron.`}
      >
        <Select
          id={`${props.source}-statut`}
          value={props.statut}
          onChange={(e) => props.onStatut(e.target.value as ImportStatut)}
        >
          <option value="draft">Brouillon</option>
          <option value="scheduled">Programmé</option>
          <option value="published">Publié immédiatement</option>
        </Select>
      </Field>

      {props.statut === "scheduled" && (
        <Field label="Date et heure de publication" htmlFor={`${props.source}-publish`}>
          <Input
            id={`${props.source}-publish`}
            type="datetime-local"
            value={props.publishAt}
            onChange={(e) => props.onPublishAt(e.target.value)}
          />
        </Field>
      )}

      <div className="flex items-end gap-3">
        <Button type="submit" variant="primary" disabled={props.busy}>
          {props.busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
          {props.busy ? "Import en cours…" : submitLabel}
        </Button>
      </div>

      {props.error && (
        <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult md:col-span-2">
          {props.error}
        </p>
      )}
    </form>
  );
}
