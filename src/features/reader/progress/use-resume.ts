"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { scrollToPage } from "../state/use-navigation";
import { clamp, type ReaderMode } from "../types";
import { getLocalProgress } from "./local";

/**
 * Hydratation du lecteur, différée d'un tick après le montage : réglages de
 * l'appareil (`hydrate`), puis reprise de lecture — l'historique du compte
 * (`initialPage`) l'emporte, sinon la progression locale. En webtoon, la
 * page reprise est atteinte par défilement. Renvoie vrai une fois hydraté :
 * le suivi et la mesure du défilement attendent ce signal.
 */
export function useResume({
  hydrate,
  setPage,
  chapterId,
  initialPage,
  lastIndex,
  page,
  mode,
  containerRef,
  reveal,
}: {
  hydrate: () => void;
  setPage: (index: number) => void;
  chapterId: string;
  initialPage: number;
  lastIndex: number;
  page: number;
  mode: ReaderMode;
  containerRef: RefObject<HTMLDivElement | null>;
  reveal: () => void;
}): boolean {
  const [hydrated, setHydrated] = useState(false);
  const resumeDone = useRef(false);

  useEffect(() => {
    // Différé d'un tick : un setState synchrone dans un effet provoquerait
    // un rendu en cascade au montage. Les deux mises à jour sont groupées.
    const timer = window.setTimeout(() => {
      hydrate();
      // L'historique du compte l'emporte, sinon la progression locale.
      let resume = clamp(initialPage - 1, 0, lastIndex);
      if (initialPage <= 1) {
        const local = getLocalProgress("scans", chapterId);
        if (local !== null && local >= 1) resume = clamp(local - 1, 0, lastIndex);
      }
      if (resume > 0) setPage(resume);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrate, setPage, chapterId, initialPage, lastIndex]);

  // Webtoon : on défile jusqu'à la page reprise (les autres modes l'affichent).
  useEffect(() => {
    if (!hydrated || resumeDone.current || page <= 0) return;
    resumeDone.current = true;
    if (mode !== "vertical") return;
    scrollToPage(containerRef.current, page, "auto");
    const timer = window.setTimeout(reveal, 400);
    return () => window.clearTimeout(timer);
  }, [hydrated, page, mode, reveal, containerRef]);

  return hydrated;
}
