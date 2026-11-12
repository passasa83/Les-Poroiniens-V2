"use client";

import { useCallback, useEffect, useRef } from "react";

const FLUSH_DELAY = 2000;

/**
 * Pages restées en échec après reprise : envoyées par lots à la télémétrie
 * (jamais bloquant).
 */
export function useFailureReport(chapterId: string): (index: number) => void {
  const failed = useRef<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    const indexes = [...failed.current];
    if (indexes.length === 0) return;
    failed.current.clear();
    void fetch("/api/telemetry/images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chapterId, indexes }),
      keepalive: true,
    }).catch(() => undefined);
  }, [chapterId]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // Démontage (chapitre suivant) : on n'abandonne pas le lot en attente.
      flush();
    },
    [flush],
  );

  return useCallback(
    (index: number) => {
      failed.current.add(index);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, FLUSH_DELAY);
    },
    [flush],
  );
}
