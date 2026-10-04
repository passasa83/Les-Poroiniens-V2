"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/** Bandeau de consentement cookies (RGPD) — cookies fonctionnels uniquement. */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Lecture différée : un setState synchrone dans un effet provoquerait un
    // rendu en cascade au montage du bandeau.
    const timer = window.setTimeout(() => {
      try {
        setVisible(!localStorage.getItem("lp-cookie-consent"));
      } catch {
        /* stockage indisponible : pas de bandeau */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function choose(value: "ok" | "no") {
    try {
      localStorage.setItem("lp-cookie-consent", value);
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 p-4 backdrop-blur">
      <div className="container-site flex flex-col gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted">
          Ce site utilise uniquement des cookies fonctionnels (session, mémorisation de vos
          préférences et du gate +18). Aucun cookie publicitaire.{" "}
          <Link href="/legal/confidentialite" className="underline">
            En savoir plus
          </Link>
        </p>
        <div className="flex gap-2 sm:ml-auto">
          <button type="button" className="btn-secondary" onClick={() => choose("no")}>
            Refuser
          </button>
          <button type="button" className="btn-primary" onClick={() => choose("ok")}>
            Accepter
          </button>
        </div>
      </div>
    </div>
  );
}
