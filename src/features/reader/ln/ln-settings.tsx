"use client";

import clsx from "clsx";
import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import {
  type LnFont,
  type LnAlign,
  LN_BOUNDS,
  LN_FONT_STACKS,
  lnSnap,
  type LnSettings,
} from "./ln-storage";

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
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])",
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
