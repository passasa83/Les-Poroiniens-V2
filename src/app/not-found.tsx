import Link from "next/link";
import { Search } from "lucide-react";

/**
 * Page 404 (§6.12) : retour à l'accueil **et** recherche, pour que la
 * navigation reparte sans passer par le moteur du navigateur.
 * Le `noindex` est rendu explicitement : cette page sert aussi les URL de
 * série / chapitre inexistantes détectées par le proxy (statut 404 réel).
 */
export default function NotFound() {
  return (
    <div className="container-site flex flex-col items-center gap-5 py-20 text-center">
      <meta name="robots" content="noindex, follow" />
      <p className="text-6xl font-black text-primary" aria-hidden="true">
        404
      </p>
      <h1 className="section-title">Page introuvable</h1>
      <p className="max-w-md text-sm text-muted">
        Cette page n&apos;existe pas ou a été déplacée. Vérifiez l&apos;adresse, revenez à
        l&apos;accueil ou lancez une recherche.
      </p>

      <form
        action="/recherche"
        method="get"
        role="search"
        className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
      >
        <label className="label sr-only" htmlFor="introuvable-recherche">
          Rechercher une série
        </label>
        <input
          id="introuvable-recherche"
          name="q"
          type="search"
          className="input min-h-11 flex-1"
          placeholder="Titre, auteur, genre…"
          maxLength={120}
          autoComplete="off"
        />
        <button type="submit" className="btn-primary min-h-11">
          <Search className="size-4" aria-hidden="true" />
          Rechercher
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link href="/" className="btn-primary">
          Retour à l&apos;accueil
        </Link>
        <Link href="/recherche" className="btn-ghost">
          Recherche
        </Link>
        <Link href="/catalogue" className="btn-ghost">
          Voir le catalogue
        </Link>
      </div>
    </div>
  );
}
