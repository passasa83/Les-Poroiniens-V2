"use client";

import { useEffect, useRef } from "react";
import type { ReaderSens } from "../types";

export type KeyboardActions = {
  sens: ReaderSens;
  step: (direction: 1 | -1) => void;
  first: () => void;
  last: () => void;
  toggleFullscreen: () => void;
  toggleSettings: () => void;
  cycleMode: () => void;
  cycleTheme: () => void;
  toggleHelp: () => void;
  /**
   * Échap : ferme la couche du dessus (`"closed"`), la laisse gérer seule
   * (`"ignored"`, ex. modale de signalement) ou `null` : sortie du plein écran.
   */
  escape: () => "closed" | "ignored" | null;
};

/**
 * Raccourcis du lecteur. Les actions sont lues via une ref : l'écouteur est
 * posé une seule fois (plus de réabonnement à chaque page tournée).
 */
export function useReaderKeyboard(actions: KeyboardActions): void {
  const ref = useRef(actions);
  useEffect(() => {
    ref.current = actions;
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const a = ref.current;
      if (event.key === "Escape") {
        const result = a.escape();
        if (result === "closed") event.preventDefault();
        else if (result === null && document.fullscreenElement) void document.exitFullscreen();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const forward: 1 | -1 = a.sens === "rtl" ? -1 : 1;
      const run = (fn: () => void) => {
        event.preventDefault();
        fn();
      };

      switch (event.key) {
        // `?` (Maj + , sur AZERTY) : aide aux raccourcis
        case "?":
          return run(a.toggleHelp);
        case "ArrowRight":
          return run(() => a.step(forward));
        case "ArrowLeft":
          return run(() => a.step(forward === 1 ? -1 : 1));
        case "ArrowDown":
        case " ":
          return run(() => a.step(1));
        case "ArrowUp":
          return run(() => a.step(-1));
        case "Home":
          return run(a.first);
        case "End":
          return run(a.last);
        case "f":
        case "F":
          return run(a.toggleFullscreen);
        case "m":
        case "M":
          return run(a.toggleSettings);
        case "d":
        case "D":
          return run(a.cycleMode);
        case "t":
        case "T":
          return run(a.cycleTheme);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
