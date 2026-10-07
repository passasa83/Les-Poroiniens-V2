"use client";

import { useEffect } from "react";

/**
 * Enregistrement discret du service worker (PWA, « installation jamais
 * bloquante », « PWA installable »).
 *
 * - aucun affichage, aucune invitation : l'utilisateur n'est jamais dérangé ;
 * - **production uniquement** : pendant `next dev`, aucun worker n'est
 *   enregistré, l'outil de développement reste intact ;
 * - rendu serveur intact : le composant ne fait rien avant l'hydratation et
 *   toute erreur est avalement (un échec d'enregistrement ne casse jamais la
 *   page) ;
 * - la stratégie du worker est déterministe (public/sw.js) : réseau d'abord
 *   pour les navigations, cache uniquement en repli hors ligne.
 */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    // Après le chargement : l'enregistrement ne dispute jamais la bande
    // passante aux ressources de premier rendu (LCP).
    const register = () => {
      try {
        void navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        /* environnement sans service worker (private mode, http…) */
      }
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
