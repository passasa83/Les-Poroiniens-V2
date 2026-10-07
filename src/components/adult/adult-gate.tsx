"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";

/**
 * Déclaration d'âge simple : aucune vérification d'identité.
 * Réservée aux membres connectés : un visiteur est invité à se connecter,
 * le +18 n'est jamais accessible sans compte. Mémorisée 30 jours en cookie,
 * et dans le compte pour les membres.
 */
export function AdultGate({
  open,
  next,
  onClose,
  authenticated = false,
}: {
  open: boolean;
  next?: string;
  onClose?: () => void;
  authenticated?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const safeNext = next && !next.startsWith("/api") ? next : "/";
  const loginHref = `/connexion${safeNext === "/" ? "" : `?next=${encodeURIComponent(safeNext)}`}`;

  async function accept() {
    setBusy(true);
    try {
      await fetch("/api/adult/accept", { method: "POST" });
      router.refresh();
      onClose?.();
    } finally {
      setBusy(false);
    }
  }

  function leave() {
    // Visiteur : quitter = sortir du contexte +18 (sinon `next` rebouclerait
    // vers la porte). Membre : retour à la page d'origine.
    router.push(authenticated ? safeNext : "/");
  }

  return (
    <Modal open={open} onClose={onClose ?? leave} title="Contenu réservé aux adultes">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Une partie du catalogue est classée <strong className="text-adult">+18</strong>. En
          continuant, vous confirmez avoir au moins 18 ans et acceptez d&apos;accéder à ce
          contenu.
        </p>
        <p className="rounded-xl border border-line bg-surface2 p-3 text-xs text-muted">
          {authenticated ? (
            <>
              Aucune vérification d&apos;identité n&apos;est réalisée. Votre choix est conservé
              30 jours sur cet appareil (et dans vos préférences de compte).
            </>
          ) : (
            <>
              L&apos;accès au contenu +18 nécessite un compte. Connectez-vous (ou créez-en un),
              puis validez cette déclaration une seule fois.
            </>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={leave} disabled={busy}>
            Quitter
          </button>
          {authenticated ? (
            <button type="button" className="btn-primary" onClick={accept} disabled={busy}>
              J&apos;ai 18 ans ou plus
            </button>
          ) : (
            <Link href={loginHref} className="btn-primary">
              Se connecter pour continuer
            </Link>
          )}
        </div>
      </div>
    </Modal>
  );
}
