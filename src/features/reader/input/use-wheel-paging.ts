"use client";

import { useEffect, type RefObject } from "react";

const LOCK_MS = 250;

/**
 * Molette en mode page / double : une planche par cran, verrou de 250 ms.
 * Aux extrémités, le défilement natif reprend (fin de chapitre, commentaires).
 */
export function useWheelPaging({
  zoneRef,
  enabled,
  step,
  atStart,
  atEnd,
}: {
  zoneRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  step: (direction: 1 | -1) => void;
  atStart: () => boolean;
  atEnd: () => boolean;
}): void {
  useEffect(() => {
    const el = zoneRef.current;
    if (!el || !enabled) return;
    let locked = false;
    let timer: number | null = null;

    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) < 8) return;
      const down = event.deltaY > 0;
      if (down ? atEnd() : atStart()) return;
      event.preventDefault();
      if (locked) return;
      locked = true;
      timer = window.setTimeout(() => {
        locked = false;
        timer = null;
      }, LOCK_MS);
      step(down ? 1 : -1);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [zoneRef, enabled, step, atStart, atEnd]);
}
