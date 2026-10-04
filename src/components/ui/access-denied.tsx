import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";
import type { Role } from "@/lib/types";

/** Écran 403 réutilisé par toutes les pages protégées par rôle. */
export function AccessDenied({ required, hint }: { required?: Role; hint?: string }) {
  return (
    <div className="container-site flex flex-col items-center gap-4 py-24 text-center">
      <ShieldAlert className="size-10 text-adult" />
      <h1 className="section-title">Accès refusé</h1>
      <p className="max-w-md text-sm text-muted">
        {hint ??
          (required
            ? `Cette page est réservée au rôle « ${ROLE_LABELS[required]} » et supérieur.`
            : "Votre rôle ne vous donne pas accès à cette page.")}
      </p>
      <Link href="/" className="btn-primary">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
