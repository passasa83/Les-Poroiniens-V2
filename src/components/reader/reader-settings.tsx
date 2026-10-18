"use client";

import clsx from "clsx";
import { Columns2, MoveHorizontal, Rows3, Square, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { READER_SHORTCUTS } from "./reader-help";

export type ReaderMode = "vertical" | "single" | "double";
export type ReaderSens = "ltr" | "rtl";
/** Ajustement des pages dans la zone de lecture. */
export type ReaderFit = "auto" | "originale" | "largeur" | "hauteur" | "perso";
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

/** Ajustements possibles, dans l'ordre du bouton cyclique de la sidebar. */
export const READER_FITS: Array<{ key: ReaderFit; label: string; aide: string }> = [
  { key: "auto", label: "Auto", aide: "Largeur naturelle de la zone de lecture." },
  {
    key: "originale",
    label: "Originale",
    aide: "Taille d'origine des pages, sans contrainte (défilement horizontal).",
  },
  { key: "largeur", label: "Largeur", aide: "Ajuste la largeur des pages (pourcentage)." },
  { key: "hauteur", label: "Hauteur", aide: "Une planche tient dans la hauteur de la fenêtre." },
  {
    key: "perso",
    label: "Personnalisé",
    aide: "Limites de largeur et de hauteur des pages, en pixels.",
  },
];

const THEMES: Array<{ key: ReaderTheme; label: string }> = [
  { key: "site", label: "Défaut du site" },
  { key: "clair", label: "Clair" },
  { key: "noir", label: "Noir" },
];

/** Préfixe de toutes les clés de réglages du lecteur (export / import). */
const SETTINGS_PREFIX = "lp-reader-";

/**
 * Export / import des réglages de lecture : télécharge ou restaure toutes les
 * clés `lp-reader-*` (donc toutes les séries) via un fichier JSON versionné.
 */
function ReglagesDonnees() {
  const [etat, setEtat] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function exporter() {
    try {
      const settings: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(SETTINGS_PREFIX)) continue;
        const value = localStorage.getItem(key);
        if (value !== null) settings[key] = value;
      }
      const blob = new Blob([JSON.stringify({ version: 1, settings }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "poroiniens-reglages-lecteur.json";
      link.click();
      URL.revokeObjectURL(url);
      setEtat("Réglages exportés.");
    } catch {
      setEtat("Export impossible sur cet appareil.");
    }
  }

  async function importer(file: File) {
    try {
      const data = JSON.parse(await file.text()) as {
        version?: number;
        settings?: Record<string, unknown>;
      };
      if (data?.version !== 1 || !data.settings || typeof data.settings !== "object") {
        setEtat("Fichier de réglages invalide.");
        return;
      }
      let count = 0;
      for (const [key, value] of Object.entries(data.settings)) {
        // Liste blanche stricte : seules les clés de réglages sont réécrites.
        if (!key.startsWith(SETTINGS_PREFIX) || typeof value !== "string" || count >= 200) {
          continue;
        }
        localStorage.setItem(key, value);
        count += 1;
      }
      if (count === 0) {
        setEtat("Aucun réglage à importer dans ce fichier.");
        return;
      }
      setEtat("Réglages importés : rechargement…");
      window.setTimeout(() => window.location.reload(), 600);
    } catch {
      setEtat("Fichier illisible.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary text-sm" onClick={exporter}>
          Exporter
        </button>
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => fileRef.current?.click()}
        >
          Importer
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Fichier de réglages à importer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importer(file);
            e.target.value = "";
          }}
        />
      </div>
      {etat && (
        <p className="text-xs text-muted" role="status">
          {etat}
        </p>
      )}
    </div>
  );
}

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
  stretch,
  onStretch,
  limitW,
  onLimitW,
  limitH,
  onLimitH,
  maxh,
  onMaxh,
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
  /** Ajustement « Personnalisé » (réglages hérités de l'ancien lecteur). */
  stretch: boolean;
  onStretch: (v: boolean) => void;
  limitW: boolean;
  onLimitW: (v: boolean) => void;
  limitH: boolean;
  onLimitH: (v: boolean) => void;
  maxh: number;
  onMaxh: (h: number) => void;
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
          aide="Mémorisé pour cette série ; les autres séries gardent le dernier mode choisi."
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

        <Reglage titre="Ajustement" aide={READER_FITS.find((f) => f.key === fit)?.aide}>
          <Segmented
            label="Ajustement des pages"
            value={fit}
            onChange={onFit}
            options={READER_FITS.map((f) => ({ key: f.key, label: f.label }))}
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
            /* Ajustement hérité de l'ancien lecteur : étirement et deux
               limites indépendantes (largeur / hauteur), de 400 à 3000 px. */
            <div className="space-y-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={stretch}
                  onChange={(e) => onStretch(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Étirer les petites pages
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={limitW}
                  onChange={(e) => onLimitW(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Limiter la largeur
              </label>
              {limitW && (
                <div>
                  <label className="label" htmlFor="reader-maxw">
                    Largeur maximale : {maxw} px
                  </label>
                  <input
                    id="reader-maxw"
                    type="range"
                    min={400}
                    max={3000}
                    step={10}
                    value={maxw}
                    onChange={(e) => onMaxw(Number(e.target.value))}
                    className="reader-progress w-full accent-primary"
                  />
                </div>
              )}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={limitH}
                  onChange={(e) => onLimitH(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Limiter la hauteur
              </label>
              {limitH && (
                <div>
                  <label className="label" htmlFor="reader-maxh">
                    Hauteur maximale : {maxh} px
                  </label>
                  <input
                    id="reader-maxh"
                    type="range"
                    min={400}
                    max={3000}
                    step={10}
                    value={maxh}
                    onChange={(e) => onMaxh(Number(e.target.value))}
                    className="reader-progress w-full accent-primary"
                  />
                </div>
              )}
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
            {READER_SHORTCUTS.map(([touches, effet]) => (
              <div key={touches} className="flex items-baseline justify-between gap-3">
                <dt className="shrink-0 font-mono text-fg">{touches}</dt>
                <dd className="text-right">{effet}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted">
            L&apos;aide s&apos;ouvre aussi avec la touche <span className="font-mono text-fg">?</span> sur
            clavier.
          </p>
        </Reglage>

        <Reglage
          titre="Mes réglages"
          aide="Mode, sens, ajustement et décalage sont mémorisés par série. L’export regroupe tous les réglages de l’appareil (toutes séries comprises)."
        >
          <ReglagesDonnees />
        </Reglage>

        <div className="flex items-center gap-1 text-xs text-muted">
          <MoveHorizontal className="size-4 shrink-0" />
          <p>
            Réglages conservés sur cet appareil ; le mode et le sens suivent aussi votre compte.
          </p>
        </div>
      </div>
    </div>
  );
}
