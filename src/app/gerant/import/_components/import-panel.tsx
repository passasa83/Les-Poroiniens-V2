"use client";

import { useState } from "react";
import { DriveTab } from "./drive-tab";
import { ImgchestTab } from "./imgchest-tab";
import { LotTab } from "./lot-tab";
import { NasTab } from "./nas-tab";
import { ResultPanel } from "./result-panel";
import type { ImportResult, SeriesLite } from "./types";
import { useImportTarget } from "./use-import-target";
import { useSingleImport } from "./use-single-import";

export type { SeriesLite } from "./types";

type TabKey = "lot" | "nas" | "imgchest" | "drive";

/**
 * Espace d'import du Gérant, découpé par source : un onglet = une source
 * (lot NAS, unité NAS, ImgChest, Drive), chacun avec son état. La série
 * cible et le formulaire « une unité » restent partagés entre onglets.
 *
 * Les onglets inactifs sont masqués, pas démontés : un lot en cours continue
 * (et garde son rapport) quand on consulte un autre onglet.
 */
export function ImportPanel({
  series,
  nasConfigured,
  driveConfigured,
  imgchestList,
  initialSeriesId = "",
}: {
  series: SeriesLite[];
  nasConfigured: boolean;
  driveConfigured: boolean;
  /** Vrai si `IMG_CHEST_USERNAME` est renseignée (liste des albums). */
  imgchestList: boolean;
  /** Série pré-sélectionnée (`/gerant/import?series=…`, lien depuis une fiche). */
  initialSeriesId?: string;
}) {
  const [tab, setTab] = useState<TabKey>("lot");
  const [result, setResult] = useState<ImportResult | null>(null);
  const target = useImportTarget(series, initialSeriesId);
  const single = useSingleImport(target, setResult);

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "lot", label: "Import par lot" },
    { key: "nas", label: `Un ${target.sing}` },
    { key: "imgchest", label: "Depuis ImgChest" },
    { key: "drive", label: "Google Drive (séries)" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Méthode d'import">
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`import-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`import-panel-${t.key}`}
            className={tab === t.key ? "chip-active chip" : "chip"}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((t) => (
        <div
          key={t.key}
          id={`import-panel-${t.key}`}
          role="tabpanel"
          aria-labelledby={`import-tab-${t.key}`}
          hidden={tab !== t.key}
        >
          {t.key === "lot" && <LotTab target={target} nasConfigured={nasConfigured} />}
          {t.key === "nas" && (
            <NasTab target={target} single={single} nasConfigured={nasConfigured} />
          )}
          {t.key === "imgchest" && (
            <ImgchestTab target={target} single={single} imgchestList={imgchestList} />
          )}
          {t.key === "drive" && <DriveTab driveConfigured={driveConfigured} />}
        </div>
      ))}

      {result && (
        <ResultPanel key={result.chapterId} result={result} onChanged={() => setResult(null)} />
      )}
    </div>
  );
}
