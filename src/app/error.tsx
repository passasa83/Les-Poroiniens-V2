"use client"; // Les frontières d'erreur sont obligatoirement des composants clients.

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

/**
 * Erreur serveur inattendue — 500.
 * `retry` (Next 16) re-exécute le rendu de la route sans recharger la page ;
 * `reset` reste accepté pour compatibilité.
 */
export default function ErrorPage({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    // Le détail reste côté console (le message est déjà anonymisé en production).
    console.error("[erreur 500]", error.digest ?? error.message);
  }, [error]);

  const reessayer = retry ?? reset ?? (() => window.location.reload());

  return (
    <div
      className="container-site flex flex-col items-center gap-5 py-20 text-center"
      role="alert"
      aria-live="polite"
    >
      <p className="text-6xl font-black text-primary" aria-hidden="true">
        500
      </p>
      <h1 className="section-title">Une erreur est survenue</h1>
      <p className="max-w-md text-sm text-muted">
        Le serveur n&apos;a pas pu afficher cette page. C&apos;est généralement temporaire :
        réessayez dans un instant, ou revenez à l&apos;accueil.
      </p>
      {error.digest && (
        <p className="text-xs text-muted">
          Référence à communiquer à l&apos;équipe :{" "}
          <code className="text-fg">{error.digest}</code>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className="btn-primary" onClick={reessayer}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Réessayer
        </button>
        <Link href="/" className="btn-ghost">
          Retour à l&apos;accueil
        </Link>
        <Link href="/catalogue" className="btn-ghost">
          Voir le catalogue
        </Link>
      </div>
      <p className="text-xs text-muted">
        <TriangleAlert className="mr-1 inline size-3.5" aria-hidden="true" />
        Un incident récurrent ? Signalez-le depuis le lecteur (« Signaler un problème »).
      </p>
    </div>
  );
}
