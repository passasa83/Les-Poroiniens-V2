"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

/**
 * Raccourcis du lecteur, affichés dans la modale d'aide (`?`) et dans le
 * tiroir de réglages — une seule source pour les deux rendus.
 */
export const READER_SHORTCUTS: Array<[string, string]> = [
  ["← / →", "Page précédente / suivante (selon le sens)"],
  ["↑ / ↓", "Page précédente / suivante (défilement en webtoon)"],
  ["Espace", "Page suivante"],
  ["Début / Fin", "Première / dernière page"],
  ["F", "Plein écran"],
  ["M", "Ouvrir ou fermer les réglages"],
  ["D", "Changer de mode de lecture"],
  ["T", "Changer de thème du lecteur"],
  ["?", "Afficher ou masquer cette aide"],
  ["Échap", "Fermer, puis quitter le plein écran"],
  ["Molette", "Tourner les pages (mode page et double page)"],
  ["Tactile", "Zones gauche / centre / droite et balayage"],
];

/**
 * Modale d'aide aux raccourcis clavier du lecteur : ouverte par la touche `?`
 * ou le bouton dédié de la sidebar ; fermée par Échap, la croix ou le clic
 * sur le voile (motif de `reader-report.tsx`).
 */
export function ReaderHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open]);

  return (
    <div
      hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label="Raccourcis clavier du lecteur"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-md rounded-xl border border-line bg-surface p-4 shadow-2xl outline-none"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="section-title">Raccourcis du lecteur</h2>
          <button
            type="button"
            className="btn-ghost px-2"
            aria-label="Fermer l'aide"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <dl className="mt-3 space-y-1 text-xs text-muted">
          {READER_SHORTCUTS.map(([touches, effet]) => (
            <div key={touches} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 font-mono text-fg">{touches}</dt>
              <dd className="text-right">{effet}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Les gestes tactiles (zones gauche / centre / droite, balayage) restent
          disponibles en mode page et double page.
        </p>
      </div>
    </div>
  );
}
