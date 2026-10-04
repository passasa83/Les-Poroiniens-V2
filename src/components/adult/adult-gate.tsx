"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";

/**
 * Déclaration d'âge simple (§11) : aucune vérification d'identité.
 * Mémorisée 30 jours en cookie pour les visiteurs, à vie dans le compte.
 */
export function AdultGate({
  open,
  next,
  onClose,
}: {
  open: boolean;
  next?: string;
  onClose?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

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
    router.push(next && !next.startsWith("/api") ? next : "/");
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
          Aucune vérification d&apos;identité n&apos;est réalisée. Votre choix est conservé
          30 jours sur cet appareil (et dans vos préférences de compte si vous êtes connecté).
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={leave} disabled={busy}>
            Quitter
          </button>
          <button type="button" className="btn-primary" onClick={accept} disabled={busy}>
            J&apos;ai 18 ans ou plus
          </button>
        </div>
      </div>
    </Modal>
  );
}
