"use client";

import { useEffect, useRef, useState } from "react";

const SCRIPT_ID = "lp-turnstile";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Charge le script Cloudflare une seule fois, même après démontage/remontage. */
function loadTurnstile(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("script")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("script"));
    document.head.appendChild(script);
  });
}

/**
 * Captcha d'inscription (« protection anti-bot »).
 *
 * Deux états possibles :
 *  - clé publique fournie → widget Cloudflare Turnstile rendu explicitement ;
 *  - clé absente → **tout est masqué** (aucun bandeau « à configurer »
 *    montré aux visiteurs) : le repli serveur reste actif — vérification
 *    sautée et journalisée, honeypot et limitation de débit toujours en
 *    place — sans clé manquante affichée et sans blocage fantôme.
 *    L'état réel reste consultable par le Gérant (Réglages : statuts).
 */
export function CaptchaField({
  siteKey,
  idPrefix,
  error,
  onTokenChange,
}: {
  siteKey: string | null;
  idPrefix: string;
  error?: string;
  onTokenChange: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">(
    siteKey ? "loading" : "ready",
  );
  const renderId = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);

  /* Suivi par effet : un rendu du parent ne doit jamais réinitialiser le widget. */
  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        renderId.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          callback: (token: string) => onTokenChangeRef.current(token),
          "expired-callback": () => onTokenChangeRef.current(""),
          "error-callback": () => onTokenChangeRef.current(""),
        });
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });

    return () => {
      cancelled = true;
      const id = renderId.current;
      renderId.current = null;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* widget déjà retiré par la page */
        }
      }
    };
  }, [siteKey]);

  /* Sans clé : rien à afficher au visiteur (le repli serveur s'en charge). */
  if (!siteKey) return null;

  const labelId = `${idPrefix}-captcha-label`;

  return (
    <div
      data-captcha="turnstile"
      role="group"
      aria-labelledby={labelId}
      className="space-y-2"
    >
      <p className="label mb-0" id={labelId}>
        Vérification anti-robot
      </p>

      <div ref={containerRef} />
      {state === "loading" && (
        <p className="text-xs text-muted">Chargement de la vérification…</p>
      )}
      {state === "unavailable" && (
        <p className="text-xs text-adult">
          La vérification anti-robot n&apos;a pas pu se charger (réseau ou bloqueur) :
          réessayez ou désactivez votre bloqueur.
        </p>
      )}

      <p className="mt-1 text-xs text-adult" role="alert">
        {error}
      </p>
    </div>
  );
}
