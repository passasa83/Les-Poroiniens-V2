"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * Le site entier bascule en immersion tant que le lecteur est à l'écran :
 * l'en-tête du site se masque (motif de `layout/header-shell.tsx`).
 */
export function useImmersive(inView: boolean): void {
  useEffect(() => {
    document.body.dataset.readerImmersive = inView ? "on" : "off";
    return () => {
      delete document.body.dataset.readerImmersive;
    };
  }, [inView]);
}

/** Plein écran de l'élément, synchronisé avec la sortie système (Échap). */
export function useFullscreen(ref: RefObject<HTMLElement | null>) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }, [ref]);

  return { fullscreen, toggleFullscreen: toggle };
}

/**
 * Marges du conteneur centré : le site centre le lecteur au-delà de 1280 px,
 * la barre de ticks s'aligne alors sur la colonne de lecture (et non sur le
 * bord de la fenêtre) — mesurées au montage et à chaque redimensionnement.
 */
export function useColumnInset() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inset, setInset] = useState({ left: 0, right: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const left = Math.round(r.left);
      // `clientWidth` (et non innerWidth) : le décalage droit d'un élément
      // fixed se mesure depuis la fenêtre de mise en page, sans scrollbar.
      const right = Math.max(0, Math.round(document.documentElement.clientWidth - r.right));
      setInset((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, inset };
}
