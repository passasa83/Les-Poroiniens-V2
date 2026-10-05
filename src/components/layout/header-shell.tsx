"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Barre supérieure fixe (DA §5.1) : elle se masque au défilement vers le bas
 * et réapparaît au défilement vers le haut. Sous les 120 premiers pixels elle
 * reste toujours visible, et `prefers-reduced-motion` supprime la transition.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  /** Immersion du lecteur (§6.6) : le lecteur masque l'en-tête du site. */
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    const read = () => setImmersive(document.body.dataset.readerImmersive === "on");
    read();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(read);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-reader-immersive"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let anchor = window.scrollY;
    let ticking = false;

    const measure = () => {
      const y = window.scrollY;
      /* L'ancre ne bouge qu'à chaque décision : la direction est mesurée sur
         la distance cumulée, quel que soit le nombre d'événements émis. */
      if (y <= 120) {
        setHidden(false);
        anchor = y;
      } else if (y > anchor + 24) {
        setHidden(true);
        anchor = y;
      } else if (y < anchor - 24) {
        setHidden(false);
        anchor = y;
      }
      ticking = false;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-hidden={hidden || immersive ? "true" : "false"}
      className="sticky top-0 z-40 border-b border-line bg-header/95 backdrop-blur transition-transform duration-200 motion-reduce:transition-none data-[hidden=true]:-translate-y-full"
    >
      {children}
    </header>
  );
}
