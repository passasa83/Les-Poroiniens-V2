"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { openAuthModal, type AuthView } from "./auth-views";

/**
 * Lien d'authentification de l'en-tête : ouvre la modale (« modale
 * depuis n'importe quelle page ») tout en gardant un vrai `href` — sans
 * JavaScript, la page dédiée `/connexion` ou `/inscription` s'ouvre normalement.
 */
export function AuthLink({
  view,
  href,
  className,
  children,
}: {
  view: AuthView;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      aria-haspopup="dialog"
      onClick={(event) => {
        event.preventDefault();
        openAuthModal(view);
      }}
    >
      {children}
    </Link>
  );
}
