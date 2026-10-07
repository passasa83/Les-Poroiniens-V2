import type { Metadata } from "next";
import Link from "next/link";
import { Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Maintenance",
  description:
    "Le site Les Poroiniens est temporairement en maintenance : les annonces restent accessibles.",
  robots: { index: false, follow: false },
};

/**
 * État de maintenance : message clair + lien vers les annonces, qui
 * restent servies pendant l'intervention. La page est atteignable à tout moment
 * (aucun verrouillage de route) : elle décrit la situation sans bloquer le site.
 */
export default function MaintenancePage() {
  return (
    <div className="container-site flex flex-col items-center gap-5 py-20 text-center">
      <p className="text-6xl font-black text-primary" aria-hidden="true">
        503
      </p>
      <h1 className="section-title">Le site est en maintenance</h1>
      <p className="max-w-md text-sm text-muted">
        Nous intervenons actuellement sur Les Poroiniens. La lecture et les espaces membres
        peuvent être momentanément indisponibles : réessayez dans quelques minutes.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/annonces" className="btn-primary">
          <Wrench className="size-4" aria-hidden="true" />
          Voir les annonces
        </Link>
        <Link href="/" className="btn-ghost">
          Retour à l&apos;accueil
        </Link>
        <Link href="/catalogue" className="btn-ghost">
          Voir le catalogue
        </Link>
      </div>

      <p className="max-w-md text-xs text-muted">
        Les annonces du site (avancement des travaux, incidents connus) sont publiées sur la
        page dédiée : c&apos;est là que sont annoncés la fin de la maintenance et les
        éventuelles limitations de service.
      </p>
    </div>
  );
}
