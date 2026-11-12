"use client";

import { useMemo, useState } from "react";
import { libelleUniteSingulier } from "@/lib/format";
import type { Classification, Unite } from "@/lib/types";
import type { SeriesLite } from "./types";

/**
 * Série cible, partagée par tous les onglets d'import : choisir une série
 * dans un onglet la retient pour les autres. La classification hérite de la
 * série (le +18 ne s'applique jamais à l'inverse).
 */
export function useImportTarget(series: SeriesLite[], initialSeriesId: string) {
  const [seriesFilter, setSeriesFilter] = useState("");
  const [seriesId, setSeriesId] = useState(initialSeriesId);
  const [classification, setClassification] = useState<Classification>(
    () => series.find((s) => s.id === initialSeriesId)?.classification ?? "all",
  );

  const serie = series.find((s) => s.id === seriesId) ?? null;
  /** Organisation de la série cible : pilote les libellés des formulaires. */
  const unite: Unite = serie?.unite ?? "chapitre";

  const filteredSeries = useMemo(() => {
    const needle = seriesFilter.trim().toLowerCase();
    if (!needle) return series;
    return series.filter((s) => s.titre.toLowerCase().includes(needle));
  }, [series, seriesFilter]);

  function pickSeries(id: string) {
    setSeriesId(id);
    const target = series.find((s) => s.id === id);
    if (target) setClassification(target.classification);
  }

  return {
    seriesFilter,
    setSeriesFilter,
    seriesId,
    pickSeries,
    classification,
    setClassification,
    serie,
    unite,
    /** « chapitre » ou « tome », en minuscules. */
    sing: libelleUniteSingulier(unite).toLowerCase(),
    filteredSeries,
  };
}

export type ImportTarget = ReturnType<typeof useImportTarget>;
