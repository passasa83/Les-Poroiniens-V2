import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReaderSens } from "../types";

/**
 * Zones tactiles gauche / centre / droite : les côtés tournent les
 * pages (sens inversé en lecture droite-à-gauche), le centre montre ou masque
 * les commandes. Cibles de 44 px minimum, étiquetées pour le clavier.
 */
export function TouchZones({
  sens,
  onPrev,
  onNext,
  onToggleChrome,
}: {
  sens: ReaderSens;
  onPrev: () => void;
  onNext: () => void;
  onToggleChrome: () => void;
}) {
  const leftIsNext = sens === "rtl";
  const zone =
    "group pointer-events-auto flex min-h-11 flex-1 touch-manipulation items-center justify-center text-fg transition-colors active:bg-fg/10 motion-reduce:transition-none";
  const icon =
    "size-8 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-100 motion-reduce:transition-none";

  return (
    <div className="absolute inset-0 z-20 flex" role="group" aria-label="Zones tactiles de lecture">
      <button
        type="button"
        className={zone}
        onClick={leftIsNext ? onNext : onPrev}
        aria-label={leftIsNext ? "Zone gauche : page suivante" : "Zone gauche : page précédente"}
      >
        {leftIsNext ? (
          <ChevronRight className={icon} aria-hidden="true" />
        ) : (
          <ChevronLeft className={icon} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={zone}
        onClick={onToggleChrome}
        aria-label="Zone centre : afficher ou masquer les commandes"
      />
      <button
        type="button"
        className={zone}
        onClick={leftIsNext ? onPrev : onNext}
        aria-label={leftIsNext ? "Zone droite : page précédente" : "Zone droite : page suivante"}
      >
        {leftIsNext ? (
          <ChevronLeft className={icon} aria-hidden="true" />
        ) : (
          <ChevronRight className={icon} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
