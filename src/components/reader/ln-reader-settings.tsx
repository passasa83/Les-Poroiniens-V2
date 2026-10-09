"use client";

import clsx from "clsx";
import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** Famille de polices du lecteur texte (valeurs stables, stockées telles quelles). */
export type LnFont = "sans" | "serif" | "mono";
export type LnAlign = "justify" | "left" | "center" | "right";

export interface LnSettings {
  font: LnFont;
  /** Taille du texte en em (bornes calculées selon l'appareil au montage). */
  size: number;
  /** Interligne (line-height). */
  leading: number;
  /** Lettrage en pixels. */
  tracking: number;
  align: LnAlign;
}

/** Bornes mobile / bureau (le lecteur s'adapte à la largeur de l'écran). */
export const LN_BOUNDS = {
  size: { min: 0.9, max: 2, step: 0.05 },
  leading: { min: 1.4, max: 2.5, step: 0.1 },
  tracking: { min: 0, max: 8, step: 1 },
} as const;

export const LN_DEFAULTS: LnSettings = {
  font: "sans",
  size: 1.05,
  leading: 1.8,
  tracking: 0,
  align: "justify",
};

/** Piles de polices — mêmes choix que l'ancien lecteur (`LNReader/settings.js`). */
export const LN_FONT_STACKS: Record<LnFont, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

export const LN_SETTINGS_KEY = "lp-ln-settings";
/** Ancienne clé du site v1 : lue une fois pour migrer les réglages connus. */
const LEGACY_KEY = "les_poroiniens_ln_settings_v1";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Arrondi propre des pas (0.05 em / 0.1 d'interligne sans biais de flottants). */
export function lnSnap(kind: "size" | "leading" | "tracking", value: number): number {
  const { min, max, step } = LN_BOUNDS[kind];
  const snapped = Math.round((value - min) / step) * step + min;
  return clamp(Number(snapped.toFixed(2)), min, max);
}

/**
 * Lecture des réglages mémorisés : clé V2 d'abord, sinon migration silencieuse
 * de la clé de l'ancien site (police en pile CSS → famille, px → em).
 */
export function loadLnSettings(): LnSettings | null {
  try {
    const brut = localStorage.getItem(LN_SETTINGS_KEY);
    if (brut) {
      const data = JSON.parse(brut) as Partial<LnSettings>;
      return normalizeLnSettings(data);
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const data = JSON.parse(legacy) as Record<string, unknown>;
      const fontStack = String(data.fontFamily ?? "");
      const font: LnFont = /mono/i.test(fontStack) ? "mono" : /georgia|times/i.test(fontStack) ? "serif" : "sans";
      const sizeRaw = Number(data.fontSize);
      const migrated = normalizeLnSettings({
        font,
        // Ancien stockage parfois en px : la valeur em reste < 4.
        size: sizeRaw > 4 ? sizeRaw / 16 : sizeRaw,
        leading: Number(data.leading),
        tracking: Number(data.tracking),
        align: data.align as LnAlign | undefined,
      });
      localStorage.setItem(LN_SETTINGS_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    /* stockage indisponible : réglages par défaut */
  }
  return null;
}

export function saveLnSettings(settings: LnSettings): void {
  try {
    localStorage.setItem(LN_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* stockage indisponible : réglages non mémorisés */
  }
}

/** Normalisation défensive : toute valeur hors bornes retombe sur le défaut. */
export function normalizeLnSettings(data: Partial<LnSettings>): LnSettings {
  const fonts: LnFont[] = ["sans", "serif", "mono"];
  const aligns: LnAlign[] = ["justify", "left", "center", "right"];
  const size = Number(data.size);
  const leading = Number(data.leading);
  const tracking = Number(data.tracking);
  return {
    font: fonts.includes(data.font as LnFont) ? (data.font as LnFont) : LN_DEFAULTS.font,
    size: Number.isFinite(size) ? lnSnap("size", size) : LN_DEFAULTS.size,
    leading: Number.isFinite(leading) ? lnSnap("leading", leading) : LN_DEFAULTS.leading,
    tracking: Number.isFinite(tracking) ? lnSnap("tracking", tracking) : LN_DEFAULTS.tracking,
    align: aligns.includes(data.align as LnAlign) ? (data.align as LnAlign) : LN_DEFAULTS.align,
  };
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

/** Contrôle − / valeur / + : cibles de 44 px, bornes appliquées par le parent. */
function Stepper({
  label,
  display,
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  display: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2 p-1"
    >
      <button
        type="button"
        className="btn-ghost min-h-11 px-3 text-lg"
        aria-label={`${label} : diminuer`}
        onClick={onMinus}
        disabled={minusDisabled}
      >
        −
      </button>
      <span className="min-w-16 text-center text-sm font-semibold tabular-nums text-fg">
        {display}
      </span>
      <button
        type="button"
        className="btn-ghost min-h-11 px-3 text-lg"
        aria-label={`${label} : augmenter`}
        onClick={onPlus}
        disabled={plusDisabled}
      >
        +
      </button>
    </div>
  );
}

/**
 * Tiroir de réglages du lecteur texte : police, taille, interligne,
 * lettrage, alignement et réinitialisation. Même structure (et même piège de
 * focus) que `ReaderSettings` du lecteur manga.
 */
export function LnReaderSettings({
  open,
  onClose,
  settings,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  settings: LnSettings;
  onChange: (next: LnSettings) => void;
  onReset: () => void;
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

  const set = (patch: Partial<LnSettings>) => onChange({ ...settings, ...patch });
  // Bornes identiques partout (0,9–2 em / 1,4–2,5) : pas de dépendance à la
  // largeur d'écran au rendu, donc aucun déséquilibre serveur/navigateur.
  const sizeMin = LN_BOUNDS.size.min;
  const leadingMin = LN_BOUNDS.leading.min;

  return (
    <div
      hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label="Réglages de lecture"
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
          <h2 className="section-title">Réglages de lecture</h2>
          <button
            type="button"
            className="btn-ghost px-2"
            aria-label="Fermer les réglages"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <Reglage titre="Police" aide="Mémorisée sur cet appareil.">
          <div role="group" aria-label="Famille de polices" className="flex flex-wrap gap-2">
            {(
              [
                ["sans", "Sans-serif"],
                ["serif", "Serif"],
                ["mono", "Monospace"],
              ] as Array<[LnFont, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={settings.font === key}
                onClick={() => set({ font: key })}
                style={{ fontFamily: LN_FONT_STACKS[key] }}
                className={clsx(
                  "chip min-h-11 flex-1 justify-center px-3",
                  settings.font === key && "chip-active",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Reglage>

        <Reglage titre={`Taille : ${Math.round(settings.size * 16)} px`} aide="De 0,9 à 2 em.">
          <Stepper
            label="Taille du texte"
            display={`${settings.size.toFixed(2)} em`}
            minusDisabled={settings.size <= sizeMin}
            plusDisabled={settings.size >= LN_BOUNDS.size.max}
            onMinus={() => set({ size: lnSnap("size", settings.size - LN_BOUNDS.size.step) })}
            onPlus={() => set({ size: lnSnap("size", settings.size + LN_BOUNDS.size.step) })}
          />
        </Reglage>

        <Reglage titre="Interligne">
          <Stepper
            label="Interligne"
            display={settings.leading.toFixed(1)}
            minusDisabled={settings.leading <= leadingMin}
            plusDisabled={settings.leading >= LN_BOUNDS.leading.max}
            onMinus={() =>
              set({ leading: lnSnap("leading", settings.leading - LN_BOUNDS.leading.step) })
            }
            onPlus={() =>
              set({ leading: lnSnap("leading", settings.leading + LN_BOUNDS.leading.step) })
            }
          />
        </Reglage>

        <Reglage titre="Lettrage">
          <Stepper
            label="Lettrage"
            display={`${settings.tracking} px`}
            minusDisabled={settings.tracking <= LN_BOUNDS.tracking.min}
            plusDisabled={settings.tracking >= LN_BOUNDS.tracking.max}
            onMinus={() =>
              set({ tracking: lnSnap("tracking", settings.tracking - LN_BOUNDS.tracking.step) })
            }
            onPlus={() =>
              set({ tracking: lnSnap("tracking", settings.tracking + LN_BOUNDS.tracking.step) })
            }
          />
        </Reglage>

        <Reglage titre="Alignement">
          <div role="group" aria-label="Alignement du texte" className="flex flex-wrap gap-2">
            {(
              [
                ["justify", "Justifié"],
                ["left", "Gauche"],
                ["center", "Centré"],
                ["right", "Droite"],
              ] as Array<[LnAlign, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={settings.align === key}
                onClick={() => set({ align: key })}
                className={clsx(
                  "chip min-h-11 flex-1 justify-center px-3",
                  settings.align === key && "chip-active",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </Reglage>

        <button type="button" className="btn-secondary" onClick={onReset}>
          <RotateCcw className="size-4" /> Réinitialiser les réglages
        </button>

        <p className="text-xs text-muted">
          Les réglages de lecture sont conservés sur cet appareil et s&apos;appliquent à tous les
          light novels.
        </p>
      </div>
    </div>
  );
}
