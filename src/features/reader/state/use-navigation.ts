"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  clamp,
  prefersReducedMotion,
  type Planche,
  type ReaderMode,
  type ReaderPage,
} from "../types";
import { buildSpreads, plancheAt, plancheLabel } from "./spreads";

/** Défilement vers une page du webtoon (le mode réduit supprime l'animation). */
export function scrollToPage(
  container: HTMLElement | null,
  index: number,
  behavior: ScrollBehavior = "smooth",
): void {
  const el = container?.querySelector(`#reader-page-${index}`);
  el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : behavior, block: "start" });
}

/**
 * Position de lecture, exprimée en **planches** : une par page, sauf en
 * double page où deux portraits se suivent (`buildSpreads`). `page` vaut
 * toujours le premier index de la planche affichée.
 */
export function useReaderNavigation({
  pages,
  mode,
  firstSolo,
  initialIndex,
  containerRef,
}: {
  pages: ReaderPage[];
  mode: ReaderMode;
  firstSolo: boolean;
  initialIndex: number;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const lastIndex = Math.max(pages.length - 1, 0);
  const [page, setPageState] = useState(() => clamp(initialIndex, 0, lastIndex));
  /** Valeur courante entre deux rendus (touches répétées). */
  const pageRef = useRef(page);

  const setPage = useCallback((next: number) => {
    pageRef.current = next;
    setPageState(next);
  }, []);

  const planches = useMemo<Planche[]>(
    () =>
      mode === "double"
        ? buildSpreads(pages, firstSolo)
        : pages.map((_, index) => ({ start: index, length: 1 })),
    [mode, pages, firstSolo],
  );

  const at = plancheAt(planches, page);
  const plancheIndex = Math.max(at, 0);
  const spread: Planche = at >= 0 ? planches[at] : { start: clamp(page, 0, lastIndex), length: 1 };
  const spreadEnd = spread.start + spread.length - 1;
  const isLast = spreadEnd >= lastIndex;

  /** Bornes de la planche affichée, lues hors rendu (molette, progression). */
  const startRef = useRef(spread.start);
  const endRef = useRef(spreadEnd);
  useEffect(() => {
    startRef.current = spread.start;
    endRef.current = spreadEnd;
  }, [spread.start, spreadEnd]);

  const goTo = useCallback(
    (target: number) => {
      const index = clamp(target, 0, lastIndex);
      const planche = planches[plancheAt(planches, index)];
      setPage(planche ? planche.start : index);
      if (mode === "vertical") scrollToPage(containerRef.current, index);
    },
    [planches, lastIndex, mode, containerRef, setPage],
  );

  const goToPlanche = useCallback(
    (index: number) => {
      const planche = planches[clamp(index, 0, planches.length - 1)];
      if (planche) goTo(planche.start);
    },
    [planches, goTo],
  );

  const step = useCallback(
    (direction: 1 | -1) => goToPlanche(plancheAt(planches, pageRef.current) + direction),
    [planches, goToPlanche],
  );

  const plancheLabels = useMemo(() => planches.map(plancheLabel), [planches]);

  return {
    page,
    setPage,
    lastIndex,
    planches,
    plancheIndex,
    plancheLabels,
    spread,
    spreadEnd,
    isLast,
    startRef,
    endRef,
    goTo,
    goToPlanche,
    step,
  };
}
