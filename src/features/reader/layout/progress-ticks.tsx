"use client";

import clsx from "clsx";
import { ChevronRight } from "lucide-react";

/* ── Barre de progression à ticks (bas de page, grand écran) ──────── */

/**
 * Barre fixe en bas, un tick par planche, cliquable (motif de l'ancien
 * lecteur). En lecture droite-à-gauche les ticks sont inversés ; le clic
 * est traduit en index de planche quel que soit le sens.
 */
export function ReaderProgressTicks({
  planches,
  current,
  rtl,
  onSeek,
  left,
  right,
}: {
  planches: number;
  current: number;
  rtl: boolean;
  onSeek: (index: number) => void;
  /** Décalage gauche (largeur de la sidebar), en pixels. */
  left: number;
  /** Décalage droit (marge du conteneur centré), en pixels. */
  right: number;
}) {
  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || planches <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const visual = Math.min(planches - 1, Math.max(0, Math.floor(ratio * planches)));
    onSeek(rtl ? planches - 1 - visual : visual);
  }

  return (
    <div
      role="group"
      aria-label="Progression de lecture"
      onClick={onClick}
      style={{ left: `${left}px`, right: `${right}px` }}
      className={clsx(
        "fixed bottom-0 z-40 hidden h-[22px] cursor-pointer items-center gap-[2px] border-t border-line bg-surface/85 px-[5px] backdrop-blur transition-[left] duration-300 ease-in-out lg:flex lg:motion-reduce:transition-none",
        rtl && "flex-row-reverse",
      )}
    >
      {Array.from({ length: planches }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={clsx(
            "h-1.5 flex-1 rounded-[1px] transition-colors",
            index === current
              ? "h-2.5 bg-primary"
              : index < current
                ? "bg-primary/50 hover:bg-primary/70"
                : "bg-fg/20 hover:bg-fg/40",
          )}
        />
      ))}
    </div>
  );
}

/* ── Réouverture de la sidebar (état replié) ───────────────────────── */

/**
 * Quand la colonne vaut 0, la barre de pied a disparu avec elle : ce petit
 * anneau fixe en bas à gauche sert alors à rouvrir les contrôles. Sur grand
 * écran, il se pose dans la marge du conteneur ; sinon il touche le coin bas
 * gauche de la lecture (une seule fois replié, comme l'onglet de l'ancien site).
 */
export function ReaderSidebarReexpand({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      type="button"
      className={clsx(
        /* Pose sur la barre de ticks (h-[22px]) plutôt que derrière elle. */
        "fixed bottom-[22px] left-0 z-40 hidden h-11 items-center gap-1.5",
        "rounded-r-lg border border-l-0 border-line bg-surface px-3",
        "text-muted shadow-md hover:bg-surface2 hover:text-fg lg:flex",
      )}
      onClick={onToggle}
      aria-label="Afficher les contrôles"
      title="Afficher les contrôles"
    >
      <ChevronRight className="size-4" />
      <span className="text-xs">Contrôles</span>
    </button>
  );
}
