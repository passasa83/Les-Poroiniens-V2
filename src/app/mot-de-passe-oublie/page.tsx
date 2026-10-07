import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = {
  title: "Mot de passe oublié",
  robots: { index: false, follow: false },
};

export default function MotDePasseOubliePage() {
  return (
    <div className="container-site py-10">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-black tracking-tight text-fg">Mot de passe oublié</h1>
          <p className="text-sm text-muted">
            La réinitialisation est <strong className="text-fg">manuelle</strong> au lancement du
            site.
          </p>
        </header>

        {/* Sans fournisseur de mails, le parcours renvoie au support. */}
        <section className="card space-y-3 p-5 text-sm">
          <p className="section-title">
            <LifeBuoy className="mr-1.5 inline size-5 align-[-3px] text-primary" aria-hidden />
            Renvoi vers le support
          </p>
          <p className="text-muted">
            Aucun service d&apos;envoi de mails n&apos;est actif : la réinitialisation du mot de
            passe n&apos;est pas automatique. Un administrateur vous remet un mot de passe
            temporaire après vérification de votre identité.
          </p>
          <Link href="/aide" className="btn-primary w-full">
            Contacter le support
          </Link>
        </section>

        <ResetRequestForm />
      </div>
    </div>
  );
}
