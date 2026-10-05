import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/ui/kit";
import { dateAnnonce, dateIsoAnnonce, listAnnonces } from "@/lib/data/annonces";

export const metadata: Metadata = {
  title: "Annonces",
  description:
    "Toutes les annonces de l’équipe des Poroiniens : maintenance, nouveautés, ouvertures et fermetures du site, datées et archivées.",
};

/* Une annonce publiée doit apparaître sans attendre de nouvelle compilation. */
export const dynamic = "force-dynamic";

/**
 * §6.11 « Annonces » : liste datée du plus récent au plus ancien. Le détail
 * est une page publique par slug (`/annonces/[slug]`), le titre et le bouton
 * « Lire l'annonce » pointant dessus.
 */
export default async function AnnoncesPage() {
  const annonces = await listAnnonces();

  return (
    <div className="container-site space-y-6 py-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-black tracking-tight text-fg">Annonces</h1>
        <p className="text-sm text-muted">
          Les messages de l&apos;équipe, du plus récent au plus ancien : maintenance, nouveautés et
          informations du site.
        </p>
      </header>

      {annonces.length === 0 ? (
        <EmptyState
          title="Aucune annonce pour le moment"
          description="Les annonces de l’équipe apparaîtront ici dès leur publication."
          action={
            <Link href="/" className="btn-secondary">
              <ArrowLeft className="size-4" aria-hidden />
              Retour à l&apos;accueil
            </Link>
          }
        />
      ) : (
        <ol className="space-y-3">
          {annonces.map((annonce) => (
            <li key={annonce.id}>
              <article className="card flex flex-col gap-2 p-4 sm:p-5">
                <p className="meta flex flex-wrap items-center gap-x-3 gap-y-1">
                  <time dateTime={dateIsoAnnonce(annonce.date)} className="font-semibold text-fg">
                    {dateAnnonce(annonce.date)}
                  </time>
                  {annonce.auteur && <span>Par {annonce.auteur}</span>}
                </p>
                <h2 className="text-lg font-bold tracking-tight text-fg">
                  <Link href={`/annonces/${annonce.slug}`} className="hover:text-primary">
                    {annonce.titre}
                  </Link>
                </h2>
                {annonce.extrait && <p className="text-sm text-muted">{annonce.extrait}</p>}
                <p>
                  <Link
                    href={`/annonces/${annonce.slug}`}
                    className="link-muted inline-flex items-center gap-1 text-sm font-semibold"
                  >
                    Lire l&apos;annonce
                    <ArrowRight className="size-4" aria-hidden />
                    <span className="sr-only"> : {annonce.titre}</span>
                  </Link>
                </p>
              </article>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
