"use client";

import { ChevronDown } from "lucide-react";
import { useReaderSettings } from "../settings/context";
import { READER_FITS, READER_MODES } from "../settings/options";
import { Bloc, Segment } from "./sidebar-blocks";

/**
 * Réglages d'affichage de la sidebar : mode, sens, décalage double page,
 * ajustement de l'image et limites « Personnalisé ». Lit et écrit les
 * préférences du lecteur directement (contexte).
 */
export function SidebarPreferences() {
  const { prefs, update, cycleFit } = useReaderSettings();
  const { mode, sens, fit, firstSolo, stretch, limitW, maxw, limitH, maxh } = prefs;
  const fitLabel = READER_FITS.find((f) => f.key === fit)?.label ?? "";
  const fitAide = READER_FITS.find((f) => f.key === fit)?.aide ?? "";

  return (
    <>
      {/* Mode de lecture */}
      <Bloc titre="Mode de lecture">
        <Segment
          label="Mode de lecture"
          value={mode}
          onChange={(next) => update({ mode: next })}
          options={READER_MODES.map((m) => ({ key: m.key, label: m.label }))}
        />
      </Bloc>

      {/* Sens de lecture (le webtoon défile de haut en bas) */}
      {mode !== "vertical" && (
        <Bloc titre="Sens de lecture">
          <Segment
            label="Sens de lecture"
            value={sens}
            onChange={(next) => update({ sens: next })}
            options={[
              { key: "rtl", label: "D → G" },
              { key: "ltr", label: "G → D" },
            ]}
          />
        </Bloc>
      )}

      {/* Décalage double page (uniquement en mode double) */}
      {mode === "double" && (
        <Bloc titre="Décalage double page">
          <Segment
            label="Décalage double page (première page seule)"
            value={firstSolo ? "1" : "0"}
            onChange={(v) => update({ firstSolo: v === "1" })}
            options={[
              { key: "0", label: "Non" },
              { key: "1", label: "Oui" },
            ]}
          />
          <p className="text-xs text-muted">Isole la première page dans sa planche (couverture).</p>
        </Bloc>
      )}

      {/* Ajustement de l'image : bouton cyclique (motif de l'ancien lecteur) */}
      <Bloc titre="Ajustement de l'image">
        <button
          type="button"
          className="btn-secondary min-h-11 w-full justify-between px-3 text-xs"
          onClick={cycleFit}
          title="Changer d'ajustement"
        >
          <span className="truncate">{fitLabel}</span>
          <ChevronDown className="size-4 shrink-0" />
        </button>
        <p className="text-xs text-muted">{fitAide}</p>

        {fit === "perso" && (
          <div className="space-y-3 pt-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs text-fg">
              <input
                type="checkbox"
                checked={stretch}
                onChange={(e) => update({ stretch: e.target.checked })}
                className="size-4 accent-primary"
              />
              Étirer les petites pages
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs text-fg">
              <input
                type="checkbox"
                checked={limitW}
                onChange={(e) => update({ limitW: e.target.checked })}
                className="size-4 accent-primary"
              />
              Limiter la largeur
            </label>
            {limitW && (
              <div className="space-y-1 pl-1">
                <input
                  type="range"
                  min={400}
                  max={3000}
                  step={10}
                  value={maxw}
                  onChange={(e) => update({ maxw: Number(e.target.value) })}
                  aria-label="Largeur maximale des pages"
                  className="reader-progress w-full accent-primary"
                />
                <input
                  type="number"
                  min={400}
                  max={3000}
                  step={10}
                  value={maxw}
                  onChange={(e) => update({ maxw: Number(e.target.value) })}
                  aria-label="Largeur maximale en pixels"
                  className="w-24 rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-fg"
                />
              </div>
            )}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs text-fg">
              <input
                type="checkbox"
                checked={limitH}
                onChange={(e) => update({ limitH: e.target.checked })}
                className="size-4 accent-primary"
              />
              Limiter la hauteur
            </label>
            {limitH && (
              <div className="space-y-1 pl-1">
                <input
                  type="range"
                  min={400}
                  max={3000}
                  step={10}
                  value={maxh}
                  onChange={(e) => update({ maxh: Number(e.target.value) })}
                  aria-label="Hauteur maximale des pages"
                  className="reader-progress w-full accent-primary"
                />
                <input
                  type="number"
                  min={400}
                  max={3000}
                  step={10}
                  value={maxh}
                  onChange={(e) => update({ maxh: Number(e.target.value) })}
                  aria-label="Hauteur maximale en pixels"
                  className="w-24 rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-fg"
                />
              </div>
            )}
          </div>
        )}
      </Bloc>
    </>
  );
}
