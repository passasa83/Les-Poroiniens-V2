"use client";

import { useEffect, useState, type RefObject } from "react";
import { clamp } from "../types";

/** Hauteur des barres fixes : la page « courante » est celle qui passe dessous. */
const TOP_OFFSET = 72;

/**
 * Webtoon : page courante d'après le défilement, progression (0-100, au %
 * près pour limiter les rendus) et affichage du bouton « remonter ».
 */
export function useVerticalTracking({
  containerRef,
  enabled,
  onPage,
}: {
  containerRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  onPage: (index: number) => void;
}): { scrollProgress: number; showTop: boolean } {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let frame: number | null = null;
    let current = -1;

    function measure() {
      frame = null;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      containerRef.current?.querySelectorAll("[id^='reader-page-']").forEach((el, index) => {
        const dist = Math.abs(el.getBoundingClientRect().top - TOP_OFFSET);
        if (dist < bestDist) {
          bestDist = dist;
          best = index;
        }
      });
      if (best !== current) {
        current = best;
        onPage(best);
      }

      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = Math.round((max > 0 ? clamp(window.scrollY / max, 0, 1) : 0) * 100);
      setScrollProgress((prev) => (prev === pct ? prev : pct));
      setShowTop(window.scrollY > window.innerHeight * 0.8);
    }

    function onScroll() {
      if (frame === null) frame = requestAnimationFrame(measure);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [containerRef, enabled, onPage]);

  return { scrollProgress, showTop };
}
