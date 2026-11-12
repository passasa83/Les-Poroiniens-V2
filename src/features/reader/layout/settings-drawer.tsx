"use client";

import { MoveHorizontal, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { useReaderSettings } from "../settings/context";
import { READER_FITS, READER_MODES, READER_THEMES } from "../settings/options";
import { READER_SHORTCUTS } from "./help";
import { Reglage, ReglagesDonnees, Segmented } from "./settings-controls";

/**
 * Tiroir de réglages du lecteur : mode, sens, ajustement, thème,
 * luminosité, première page seule et aide aux raccourcis.
 *
 * Le conteneur est monté en permanence (`hidden` quand il est fermé) : les
 * contrôles restent ainsi présents dans le HTML servi, et le focus revient sur
 * le déclencheur à la fermeture (motif de `ui/modal.tsx`).
 */
export function ReaderSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { prefs, update } = useReaderSettings();
  const {
    mode,
    sens,
    fit,
    width,
    maxw,
    maxh,
    theme,
    brightness,
    firstSolo,
    stretch,
    limitW,
    limitH,
  } = prefs;
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
            onChange={(next) => update({ mode: next })}
            options={READER_MODES.map((m) => ({
              key: m.key,
              label: m.label,
              aria: m.aria,
              icon: m.icon,
            }))}
          />
        </Reglage>

        <Reglage titre="Sens de lecture" aide="Le sens est mémorisé pour cette série.">
          <Segmented
            label="Sens de lecture"
            value={sens}
            onChange={(next) => update({ sens: next })}
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
            onChange={(next) => update({ fit: next })}
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
                onChange={(e) => update({ width: Number(e.target.value) })}
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
                  onChange={(e) => update({ stretch: e.target.checked })}
                  className="size-4 accent-primary"
                />
                Étirer les petites pages
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={limitW}
                  onChange={(e) => update({ limitW: e.target.checked })}
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
                    onChange={(e) => update({ maxw: Number(e.target.value) })}
                    className="reader-progress w-full accent-primary"
                  />
                </div>
              )}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg">
                <input
                  type="checkbox"
                  checked={limitH}
                  onChange={(e) => update({ limitH: e.target.checked })}
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
                    onChange={(e) => update({ maxh: Number(e.target.value) })}
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
            onChange={(next) => update({ theme: next })}
            options={READER_THEMES.map((t) => ({ key: t.key, label: t.label }))}
          />
        </Reglage>

        <Reglage titre={`Luminosité : ${Math.round(brightness * 100)} %`}>
          <input
            type="range"
            min={60}
            max={130}
            step={5}
            value={Math.round(brightness * 100)}
            onChange={(e) => update({ brightness: Number(e.target.value) / 100 })}
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
              onChange={(e) => update({ firstSolo: e.target.checked })}
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
            L&apos;aide s&apos;ouvre aussi avec la touche{" "}
            <span className="font-mono text-fg">?</span> sur clavier.
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
