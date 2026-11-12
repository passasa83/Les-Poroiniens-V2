"use client";

import { useCallback, useRef, type TouchEvent } from "react";
import type { ReaderSens } from "../types";

/** Distance horizontale minimale d'un balayage (px). */
const SWIPE_MIN = 60;

/**
 * Balayage horizontal : tourne la page dans le sens de lecture (en D → G,
 * balayer vers la gauche recule). Ignoré si le geste est surtout vertical.
 */
export function useSwipe(sens: ReaderSens, step: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback((event: TouchEvent) => {
    const t = event.touches[0];
    start.current = { x: t.clientX, y: t.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEvent) => {
      const from = start.current;
      start.current = null;
      if (!from) return;
      const t = event.changedTouches[0];
      const dx = t.clientX - from.x;
      const dy = t.clientY - from.y;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy)) return;
      const forward: 1 | -1 = sens === "rtl" ? -1 : 1;
      step(dx < 0 ? forward : forward === 1 ? -1 : 1);
    },
    [sens, step],
  );

  return { onTouchStart, onTouchEnd };
}
