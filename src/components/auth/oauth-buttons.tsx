"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

/**
 * Boutons OAuth (« Discord », « Google »).
 *
 * Arbitrage du client : les boutons sont livrés **en état « à configurer »**.
 * Ils restent cliquables et affichent un message sobre annonçant que la
 * connexion Discord / Google doit être branchée par l'administrateur. Aucune
 * clé OAuth n'est inventée, aucun fournisseur n'est déclaré actif.
 */
export function OAuthButtons({ className }: { className?: string }) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
        Ou continuer avec
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => setMessage("Connexion Discord à configurer par l'administrateur.")}
        >
          <MessageCircle className="size-4" aria-hidden />
          Discord
        </button>
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() => setMessage("Connexion Google à configurer par l'administrateur.")}
        >
          <span aria-hidden className="text-sm font-black">
            G
          </span>
          Google
        </button>
      </div>

      {/* État permanent : visible sans clic, aussi annoncé aux lecteurs d'écran. */}
      <p className="mt-2 text-xs text-muted">
        Connexion avec Discord ou Google : à configurer par l&apos;administrateur.
      </p>
      <p role="status" aria-live="polite" className="mt-1 text-xs text-fg">
        {message}
      </p>
    </div>
  );
}
