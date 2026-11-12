"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { setLocalProgress } from "./local";

/** Attente après le dernier changement de page avant l'envoi. */
const DEBOUNCE_MS = 2000;
/** Au plus un envoi au serveur toutes les 10 s. */
const THROTTLE_MS = 10_000;
/** Mise à jour de `?page=N`. */
const URL_DEBOUNCE_MS = 150;

/**
 * Suivi de lecture d'un chapitre de scans :
 * - compte : envoi débouncé (2 s), limité à 1 / 10 s, et à la fermeture ;
 * - appareil : reprise locale (visiteurs compris) ;
 * - URL : `?page=N` tenu à jour (lien partageable, `page=1` retiré).
 *
 * `startRef` / `endRef` : bornes de la planche affichée (complétion quand la
 * dernière page est visible, y compris en double page).
 */
export function useReadingProgress({
  chapterId,
  page,
  lastIndex,
  startRef,
  endRef,
  canProgress,
  hydrated,
}: {
  chapterId: string;
  /** Change à chaque planche : déclenche les sauvegardes. */
  page: number;
  lastIndex: number;
  startRef: RefObject<number>;
  endRef: RefObject<number>;
  canProgress: boolean;
  /** Avant hydration, la page affichée n'est pas encore la page reprise. */
  hydrated: boolean;
}): void {
  const lastSent = useRef(0);

  const send = useCallback(() => {
    lastSent.current = Date.now();
    void fetch("/api/reading/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entries: [
          { chapterId, page: startRef.current + 1, completed: endRef.current >= lastIndex },
        ],
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [chapterId, lastIndex, startRef, endRef]);

  const saveLocal = useCallback(() => {
    setLocalProgress("scans", chapterId, startRef.current + 1);
  }, [chapterId, startRef]);

  // Sauvegardes différées après chaque changement de planche.
  useEffect(() => {
    if (!hydrated) return;
    let throttle: ReturnType<typeof setTimeout> | null = null;
    const debounce = setTimeout(() => {
      saveLocal();
      if (!canProgress) return;
      const wait = Math.max(0, THROTTLE_MS - (Date.now() - lastSent.current));
      if (wait > 0) throttle = setTimeout(send, wait);
      else send();
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(debounce);
      if (throttle) clearTimeout(throttle);
    };
  }, [page, hydrated, canProgress, send, saveLocal]);

  // Fermeture de l'onglet / navigation : dernier état, sans attendre.
  useEffect(() => {
    if (!hydrated) return;
    const onHide = () => {
      saveLocal();
      if (canProgress) send();
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [hydrated, canProgress, send, saveLocal]);

  // `?page=N` sans nouvelle entrée d'historique.
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        const numero = startRef.current + 1;
        if (numero <= 1) url.searchParams.delete("page");
        else url.searchParams.set("page", String(numero));
        const next = `${url.pathname}${url.search}${url.hash}`;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (next !== current) window.history.replaceState(window.history.state, "", next);
      } catch {
        /* URL indisponible : la lecture n'en dépend pas */
      }
    }, URL_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [page, hydrated, startRef]);
}
