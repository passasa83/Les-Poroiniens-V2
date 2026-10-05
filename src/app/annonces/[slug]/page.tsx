import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import {
  dateAnnonce,
  dateIsoAnnonce,
  getAnnonceBySlug,
  paragraphesAnnonce,
} from "@/lib/data/annonces";
import { plainText } from "@/lib/format";

type Params = Promise<{ slug: string }>;

/* Page de détail servie à la demande : le contenu vient de la base. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const annonce = await getAnnonceBySlug(slug);
  if (!annonce) {
    /* `notFound()` peut être streamé en 200 (loading.tsx) : on retire la page
       des index, exactement comme sur la fiche série (§11.2). */
    return { title: "Annonce introuvable", robots: { index: false, follow: false } };
  }

  const description = annonce.extrait?.trim() || plainText(annonce.contenu, 160);
  return {
    title: annonce.titre,
    description,
    robots: { index: true, follow: true },
    openGraph: { title: annonce.titre, description, type: "article" },
  };
}

/** §6.11 détail d'une annonce : page publique, datée, en paragraphes. */
export default async function AnnoncePage({ params }: { params: Params }) {
  const { slug } = await params;
  const annonce = await getAnnonceBySlug(slug);
  if (!annonce) notFound();

  const paragraphes = paragraphesAnnonce(annonce.contenu);

  return (
    <article className="container-site max-w-3xl space-y-6 py-8">
      <nav aria-label="Fil d'annonces">
        <Link href="/annonces" className="link-muted inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" aria-hidden />
          Toutes les annonces
        </Link>
      </nav>

      <header className="space-y-2">
        <p className="meta flex flex-wrap items-center gap-x-3 gap-y-1">
          <time dateTime={dateIsoAnnonce(annonce.date)} className="font-semibold text-fg">
            {dateAnnonce(annonce.date)}
          </time>
          {annonce.auteur && <span>Par {annonce.auteur}</span>}
        </p>
        <h1 className="text-2xl font-black tracking-tight text-fg">{annonce.titre}</h1>
        {annonce.extrait && <p className="text-base text-muted">{annonce.extrait}</p>}
      </header>

      <div className="divider" />

      {paragraphes.length > 0 ? (
        <div className="space-y-4 text-sm leading-relaxed text-fg">
          {paragraphes.map((paragraphe, index) => (
            <p key={index}>{paragraphe}</p>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Le contenu de cette annonce n&apos;est pas disponible.</p>
      )}

      <footer className="border-t border-line pt-4">
        <Link href="/annonces" className="btn-secondary">
          <ArrowLeft className="size-4" aria-hidden />
          Voir toutes les annonces
        </Link>
      </footer>
    </article>
  );
}
