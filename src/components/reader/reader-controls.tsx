"use client";

import clsx from "clsx";
import {
  Columns2,
  Flag,
  Maximize,
  Minimize,
  MoveHorizontal,
  Rows3,
  Settings2,
  Square,
} from "lucide-react";

export type ReaderMode = "vertical" | "single" | "double";
export type ReaderSens = "ltr" | "rtl";

const MODES: Array<{ key: ReaderMode; label: string; icon: React.ReactNode }> = [
  { key: "vertical", label: "Vertical", icon: <Rows3 className="size-4" /> },
  { key: "single", label: "Page", icon: <Square className="size-4" /> },
  { key: "double", label: "Double", icon: <Columns2 className="size-4" /> },
];

/** Barre d’outils du lecteur : modes, sens, largeur, plein écran, signalement. */
export function ReaderControls({
  mode,
  onMode,
  sens,
  onSens,
  width,
  onWidth,
  page,
  total,
  onSeek,
  fullscreen,
  onFullscreen,
  panelOpen,
  onPanel,
  onReport,
}: {
  mode: ReaderMode;
  onMode: (m: ReaderMode) => void;
  sens: ReaderSens;
  onSens: (s: ReaderSens) => void;
  width: number;
  onWidth: (w: number) => void;
  page: number;
  total: number;
  onSeek: (index: number) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  panelOpen: boolean;
  onPanel: () => void;
  onReport: () => void;
}) {
  return (
    <div className="sticky top-16 z-30 space-y-2 border-b border-line bg-bg/90 px-3 py-2 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-surface2 p-0.5" role="group" aria-label="Mode de lecture">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onMode(m.key)}
              aria-pressed={mode === m.key}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors",
                mode === m.key ? "bg-primary text-primaryfg" : "text-muted hover:text-fg",
              )}
            >
              {m.icon}
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn-ghost px-2 text-xs"
          onClick={() => onSens(sens === "ltr" ? "rtl" : "ltr")}
          title="Sens de lecture"
        >
          <MoveHorizontal className="size-4" />
          {sens === "ltr" ? "G → D" : "D → G"}
        </button>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost px-2"
            aria-pressed={panelOpen}
            aria-label="Réglages du lecteur"
            onClick={onPanel}
          >
            <Settings2 className="size-4" />
          </button>
          <button
            type="button"
            className="btn-ghost px-2"
            aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
            onClick={onFullscreen}
          >
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
          <button type="button" className="btn-ghost px-2 text-xs" onClick={onReport}>
            <Flag className="size-4" />
            <span className="hidden sm:inline">Signaler</span>
          </button>
        </div>
      </div>

      {panelOpen && (
        <div className="rounded-xl border border-line bg-surface p-3 text-xs text-muted">
          <label className="label" htmlFor="reader-width">
            Largeur des pages : {width} %
          </label>
          <input
            id="reader-width"
            type="range"
            min={50}
            max={100}
            step={5}
            value={width}
            onChange={(e) => onWidth(Number(e.target.value))}
            className="reader-progress w-full accent-primary"
          />
          <p className="mt-2">
            Raccourcis : ← / → ou ↑ / ↓ pour naviguer, Espace = page suivante, F = plein écran,
            Échap = quitter le plein écran.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span className="w-16 shrink-0 text-center text-xs tabular-nums text-muted">
          {page + 1}/{total}
        </span>
        <input
          type="range"
          className="reader-progress w-full accent-primary"
          min={0}
          max={Math.max(total - 1, 0)}
          value={page}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Progression de lecture"
        />
      </div>
    </div>
  );
}
