"use client";

import { useState } from "react";
import { MessageCircle } from "lucide-react";

type OAuthButtonsProps = {
  className?: string;
  /** `true` : les deux variables Discord sont en place côté serveur. */
  discordEnabled?: boolean;
  /** Page atteinte après connexion réussie (page interne uniquement). */
  next?: string;
};

/**
 * Boutons OAuth (« Discord », « Google »).
 *
 * Discord est **actif** dès que `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET`
 * sont renseignés : le bouton lance le parcours `/api/auth/discord/start`.
 * Sans configuration — et pour Google — les boutons restent livrés « en état
 * à configurer » : cliquables, avec un message sobre. Aucune clé n'est
 * inventée, aucun fournisseur n'est déclaré actif à tort.
 */
export function OAuthButtons({ className, discordEnabled = false, next = "/compte" }: OAuthButtonsProps) {
  const [message, setMessage] = useState<string | null>(null);

  const lien = `/api/auth/discord/start?next=${encodeURIComponent(next)}`;

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">
        Ou continuer avec
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {discordEnabled ? (
          <a href={lien} className="btn-secondary w-full">
            <MessageCircle className="size-4" aria-hidden />
            Discord
          </a>
        ) : (
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => setMessage("Connexion Discord à configurer par l'administrateur.")}
          >
            <MessageCircle className="size-4" aria-hidden />
            Discord
          </button>
        )}
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
        {discordEnabled
          ? "Connexion avec Google : à configurer par l'administrateur."
          : "Connexion avec Discord ou Google : à configurer par l'administrateur."}
      </p>
      <p role="status" aria-live="polite" className="mt-1 text-xs text-fg">
        {message}
      </p>
    </div>
  );
}
