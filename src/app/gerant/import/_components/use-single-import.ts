"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Unite } from "@/lib/types";
import { sendJson, type ImportResult, type ImportStatut } from "./types";
import type { ImportTarget } from "./use-import-target";

/** Source propre à l'onglet : pages NAS (liste ou dossier) ou album ImgChest. */
export type SourcePayload =
  | { source: "nas"; pages: string[]; chemin?: string }
  | { source: "imgchest"; imgchest_post: string };

/**
 * Formulaire « une unité » (numéro, titre, statut, date de publication),
 * partagé par les onglets NAS et ImgChest comme avant le découpage. Chaque
 * onglet valide sa source puis appelle `submit` ; le résultat s'affiche
 * sous les onglets.
 */
export function useSingleImport(target: ImportTarget, onResult: (r: ImportResult) => void) {
  const router = useRouter();
  const [numero, setNumero] = useState("");
  const [titre, setTitre] = useState("");
  const [statut, setStatut] = useState<ImportStatut>("draft");
  const [publishAt, setPublishAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Vérifie les champs communs ; renvoie le numéro, ou null (erreur affichée). */
  function validate(): number | null {
    if (!target.seriesId) {
      setError("Sélectionnez une série.");
      return null;
    }
    const value = Number(numero);
    if (!value || value < 1) {
      setError(`Indiquez un numéro de ${target.sing} valide.`);
      return null;
    }
    if (statut === "scheduled") {
      if (!publishAt) {
        setError("Indiquez la date et l'heure de publication.");
        return null;
      }
      if (new Date(publishAt).getTime() <= Date.now()) {
        setError("La date de publication doit être dans le futur.");
        return null;
      }
    }
    return value;
  }

  /** Envoie l'import ; vrai en cas de succès (l'onglet vide alors sa sélection). */
  async function submit(payload: SourcePayload, nbPagesFallback = 0): Promise<boolean> {
    setError(null);
    const value = validate();
    if (value === null) return false;

    setBusy(true);
    try {
      const { res, data } = await sendJson<{
        chapter?: { id: string; numero: number; titre: string };
        /** Unité retenue par le serveur (dossier ou série). */
        unite?: Unite;
        nbPages?: number;
        storage?: "nas" | "demo" | "imgchest";
        warning?: string;
      }>("/api/owner/import", "POST", {
        series_id: target.seriesId,
        numero: value,
        titre: titre.trim(),
        volume: null,
        classification: target.classification,
        pages: [],
        ...payload,
        statut,
        publish_at: statut === "scheduled" ? new Date(publishAt).toISOString() : null,
      });
      if (!res.ok || !data?.chapter) {
        setError(data?.error ?? "Import impossible.");
        return false;
      }
      onResult({
        chapterId: data.chapter.id,
        numero: data.chapter.numero,
        unite: data.unite ?? target.unite,
        titre: data.chapter.titre,
        slug: target.serie?.slug ?? "",
        nbPages: data.nbPages ?? nbPagesFallback,
        seriesTitre: target.serie?.titre ?? "",
        storage: data.storage ?? "demo",
        statut,
        warning: data.warning,
      });
      router.refresh();
      return true;
    } catch {
      setError("Erreur réseau : réessayez.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Props communes de `<ImportForm>` (série, numéro, titre, statut…). */
  function formProps(
    source: "nas" | "imgchest",
    onSubmit: (e: FormEvent<HTMLFormElement>) => void,
  ) {
    return {
      series: target.filteredSeries,
      seriesFilter: target.seriesFilter,
      onFilter: target.setSeriesFilter,
      seriesId: target.seriesId,
      onSeries: target.pickSeries,
      numero,
      onNumero: setNumero,
      titre,
      onTitre: setTitre,
      unite: target.unite,
      classification: target.classification,
      onClassification: target.setClassification,
      error,
      busy,
      onSubmit,
      source,
      statut,
      onStatut: setStatut,
      publishAt,
      onPublishAt: setPublishAt,
    };
  }

  return { submit, setError, formProps };
}

export type SingleImport = ReturnType<typeof useSingleImport>;
