"use client";

import clsx from "clsx";
import { Columns2, MoveHorizontal, Rows3, Square, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export type ReaderMode = "vertical" | "single" | "double";
export type ReaderSens = "ltr" | "rtl";
/** Ajustement des pages dans la zone de lecture. */
export type ReaderFit = "auto" | "largeur" | "hauteur" | "perso";
/** Thème appliqué au seul lecteur, le reste de la page garde le thème du site. */
export type ReaderTheme = "site" | "clair" | "noir";

export const READER_MODES: Array<{
  key: ReaderMode;
  label: string;
  aria: string;
  icon: ReactNode;
}> = [
  {
    key: "vertical",
    label: "Webtoon",
    aria: "Mode webtoon (défilement vertical)",
    icon: <Rows3 className="size-4" />,
  },
  { key: "single", label: "Page", aria: "Mode page par page", icon: <Square className="size-4" /> },
  {
    key: "double",
    label: "Double",
    aria: "Mode double page",
    icon: <Columns2 className="size-4" />,
  },
];

const FITS: Array<{ key: ReaderFit; label: string; aide: string }> = [
  { key: "auto", label: "Auto", aide: "Largeur naturelle de la zone de lecture." },
  { key: "largeur", label: "Largeur", aide: "Ajuste la largeur des pages (pourcentage)." },
  { key: "hauteur", label: "Hauteur", aide: "Une planche tient dans la hauteur de la fenêtre." },
  { key: "perso", label: "Personnalisé", aide: "Largeur maximale des pages, en pixels." },
];

const THEMES: Array<{ key: ReaderTheme; label: string }> = [
  { key: "site", label: "Défaut du site" },
  { key: "clair", label: "Clair" },
  { key: "noir", label: "Noir" },
];

const SHORTCUTS: Array<[string, string]> = [
  ["← / →", "Page précédente / suivante (selon le sens)"],
  ["↑ / ↓", "Page précédente / suivante"],
  ["Espace", "Page suivante"],
  ["F", "Plein écran"],
  ["M", "Ouvrir ou fermer ce tiroir"],
  ["D", "Changer de mode de lecture"],
  ["Échap", "Fermer le tiroir, puis la fenêtre, puis le plein écran"],
  ["Molette", "Tourner les pages (mode page et double page)"],
  ["Tactile", "Zones gauche / centre / droite et balayage"],
];

/** Petit groupe de réglages : libellé, contrôle, aide. */
function Reglage({ titre, aide, children }: { titre: string; aide?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-fg">{titre}</p>
      {children}
      {aide && <p className="text-xs text-muted">{aide}</p>}
    </div>
  );
}

/** Sélecteur segmenté : boutons mutuellement exclusifs annoncés par `aria-pressed`. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ key: T; label: string; aria?: string; icon?: ReactNode }>;
  onChange: (next: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          aria-label={option.aria ?? option.label}
          onClick={() => onChange(option.key)}
          className={clsx(
            "chip min-h-11 flex-1 justify-center gap-1.5 px-3",
            value === option.key && "chip-active",
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tiroir de réglages du lecteur : mode, sens, ajustement, thème,
 * luminosité, première page seule et aide aux raccourcis.
 *
 * Le conteneur est monté en permanence (`hidden` quand il est fermé) : les
 * contrôles restent ainsi présents dans le HTML servi, et le focus revient sur
 * le déclencheur à la fermeture (motif de `ui/modal.tsx`).
 */
export function ReaderSettings({
  open,
  onClose,
  mode,
  onMode,
  sens,
  onSens,
  fit,
  onFit,
  width,
  onWidth,
  maxw,
  onMaxw,
  theme,
  onTheme,
  brightness,
  onBrightness,
  firstSolo,
  onFirstSolo,
}: {
  open: boolean;
  onClose: () => void;
  mode: ReaderMode;
  onMode: (m: ReaderMode) => void;
  sens: ReaderSens;
  onSens: (s: ReaderSens) => void;
  fit: ReaderFit;
  onFit: (f: ReaderFit) => void;
  width: number;
  onWidth: (w: number) => void;
  maxw: number;
  onMaxw: (w: number) => void;
  theme: ReaderTheme;
  onTheme: (t: ReaderTheme) => void;
  brightness: number;
  onBrightness: (b: number) => void;
  firstSolo: boolean;
  onFirstSolo: (v: boolean) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("button, a[href], input, select")?.focus();
    }, 0);

    // Piège de focus : Tab reste dans le tiroir tant qu'il est ouvert.
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const nodes = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ) ?? [],
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = active ? panelRef.current?.contains(active) : false;
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  return (
    <div
      hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label="Réglages du lecteur"
      className="fixed inset-0 z-[60]"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col gap-5 overflow-y-auto border-l border-line bg-surface p-4 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">Réglages du lecteur</h2>
          <button
            type="button"
            className="btn-ghost px-2"
            aria-label="Fermer les réglages"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <Reglage
          titre="Mode de lecture"
          aide="Le mode est mémorisé pour tout le site."
        >
          <Segmented
            label="Mode de lecture"
            value={mode}
            onChange={onMode}
            options={READER_MODES.map((m) => ({
              key: m.key,
              label: m.label,
              aria: m.aria,
              icon: m.icon,
            }))}
          />
        </Reglage>

        <Reglage
          titre="Sens de lecture"
          aide="Le sens est mémorisé pour cette série."
        >
          <Segmented
            label="Sens de lecture"
            value={sens}
            onChange={onSens}
            options={[
              { key: "ltr", label: "G → D" },
              { key: "rtl", label: "D → G" },
            ]}
          />
        </Reglage>

        <Reglage titre="Ajustement" aide={FITS.find((f) => f.key === fit)?.aide}>
          <Segmented
            label="Ajustement des pages"
            value={fit}
            onChange={onFit}
            options={FITS.map((f) => ({ key: f.key, label: f.label }))}
          />
          {fit === "largeur" && (
            <div>
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
            </div>
          )}
          {fit === "perso" && (
            <div>
              <label className="label" htmlFor="reader-maxw">
                Largeur maximale : {maxw} px
              </label>
              <input
                id="reader-maxw"
                type="range"
                min={320}
                max={1600}
                step={40}
                value={maxw}
                onChange={(e) => onMaxw(Number(e.target.value))}
                className="reader-progress w-full accent-primary"
              />
            </div>
          )}
        </Reglage>

        <Reglage
          titre="Thème du lecteur"
          aide="Appliqué au seul lecteur : le reste de la page garde le thème du site."
        >
          <Segmented
            label="Thème du lecteur"
            value={theme}
            onChange={onTheme}
            options={THEMES.map((t) => ({ key: t.key, label: t.label }))}
          />
        </Reglage>

        <Reglage titre={`Luminosité : ${Math.round(brightness * 100)} %`}>
          <input
            type="range"
            min={60}
            max={130}
            step={5}
            value={Math.round(brightness * 100)}
            onChange={(e) => onBrightness(Number(e.target.value) / 100)}
            aria-label="Luminosité des pages"
            className="reader-progress w-full accent-primary"
          />
        </Reglage>

        <Reglage
          titre="Première page seule"
          aide="En mode double page, la première planche s’affiche seule (les planches paysage le restent aussi)."
        >
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg">
            <input
              type="checkbox"
              checked={firstSolo}
              onChange={(e) => onFirstSolo(e.target.checked)}
              className="size-4 accent-primary"
            />
            Afficher la première page seule
          </label>
        </Reglage>

        <Reglage titre="Aide aux raccourcis">
          <dl className="space-y-1 text-xs text-muted">
            {SHORTCUTS.map(([touches, effet]) => (
              <div key={touches} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 font-mono text-fg">{touches}</dt>
                <dd className="text-right">{effet}</dd>
              </div>
            ))}
          </dl>
        </Reglage>

        <div className="flex items-center gap-1 text-xs text-muted">
          <MoveHorizontal className="size-4 shrink-0" />
          <p>
            Mode, sens et réglages sont conservés sur cet appareil ; le mode et le sens suivent
            aussi votre compte.
          </p>
        </div>
      </div>
    </div>
  );
}
