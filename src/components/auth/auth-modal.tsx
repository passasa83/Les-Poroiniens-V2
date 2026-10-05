"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MailWarning } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { ConnexionForm, type DemoAccount } from "./connexion-form";
import { InscriptionForm } from "./inscription-form";
import {
  AUTH_MODAL_EVENT,
  AUTH_VIEW_LABELS,
  isAuthView,
  type AuthView,
} from "./auth-views";

/**
 * Modale d'authentification accessible **depuis n'importe quelle page** (§6.10) :
 * connexion, inscription et mot de passe oublié y cohabitent sous forme de
 * vues. Elle s'ouvre
 *   - au chargement d'une URL `?auth=connexion|inscription|oublie` ;
 *   - sur l'événement global déclenché par les liens de l'en-tête.
 *
 * Les pages dédiées `/connexion` et `/inscription` restent en place et sont
 * utilisables sans JavaScript.
 */
export function AuthModal({
  demoAccounts,
  turnstileSiteKey,
}: {
  demoAccounts: DemoAccount[];
  turnstileSiteKey: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("auth");
  const [view, setView] = useState<AuthView | null>(() =>
    isAuthView(initial) ? initial : null,
  );

  /* Ouverture par événement global (en-tête, liens internes). */
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<AuthView>).detail;
      if (isAuthView(detail)) setView(detail);
    };
    window.addEventListener(AUTH_MODAL_EVENT, onOpen);
    return () => window.removeEventListener(AUTH_MODAL_EVENT, onOpen);
  }, []);

  /* Navigation : la modale ne survit pas au changement de page. */
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  useEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    setView(null);
  }, [pathname]);

  const close = useCallback(() => {
    setView(null);
    // `?auth=` retiré de l'URL : recharger la page ne rouvre pas la modale.
    if (typeof window !== "undefined" && window.location.search.includes("auth=")) {
      const params = new URLSearchParams(window.location.search);
      params.delete("auth");
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        query ? `?${query}` : window.location.pathname,
      );
    }
  }, []);

  const success = useCallback(() => {
    close();
    router.refresh();
  }, [close, router]);

  const title = view ? AUTH_VIEW_LABELS[view] : undefined;

  return (
    <Modal open={view !== null} onClose={close} title={title} labelledBy="auth-modal-title">
      {view === "connexion" && (
        <ConnexionForm
          heading="none"
          idPrefix="modal-connexion"
          demoAccounts={demoAccounts}
          embedded
          onSwitch={setView}
          onSuccess={success}
        />
      )}
      {view === "inscription" && (
        <InscriptionForm
          heading="none"
          idPrefix="modal-inscription"
          turnstileSiteKey={turnstileSiteKey}
          embedded
          onSwitch={setView}
          onSuccess={success}
        />
      )}
      {view === "oublie" && <MotDePasseOubliePanel onSwitch={setView} />}
    </Modal>
  );
}

/**
 * Vue « mot de passe oublié » de la modale (§6.10 / §14.3) : sans fournisseur
 * de mails, la réinitialisation est manuelle et renvoie explicitement au
 * support du site.
 */
function MotDePasseOubliePanel({ onSwitch }: { onSwitch: (view: AuthView) => void }) {
  return (
    <div className="space-y-4 text-sm">
      <p className="rounded-xl border border-line bg-surface2 px-3 py-2 text-muted">
        <MailWarning className="mr-1 inline size-4 align-[-2px]" aria-hidden />
        Aucun service d&apos;envoi de mails n&apos;est actif : la réinitialisation du mot de
        passe est <strong className="text-fg">manuelle</strong> et traitée par le support du
        site.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-muted">
        <li>Indiquez le pseudo ou l&apos;adresse e-mail de votre compte.</li>
        <li>Un administrateur vous remet un mot de passe temporaire.</li>
        <li>La réponse est identique quelle que soit l&apos;adresse saisie.</li>
      </ul>
      <div className="flex flex-col gap-2">
        <Link href="/aide" className="btn-primary">
          Contacter le support
        </Link>
        <button type="button" className="btn-ghost" onClick={() => onSwitch("connexion")}>
          Retour à la connexion
        </button>
        <Link href="/mot-de-passe-oublie" className="btn-ghost">
          Voir la page dédiée
        </Link>
      </div>
    </div>
  );
}
