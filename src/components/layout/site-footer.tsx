import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="container-site grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="mb-2 font-black">Les Poroiniens</p>
          <p className="text-sm text-muted">
            Plateforme de lecture de scans manga. Aucune publicité, aucun traceur publicitaire.
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Navigation</p>
          <ul className="space-y-1.5 text-sm text-muted">
            <li>
              <Link className="link-muted" href="/catalogue">
                Catalogue
              </Link>
            </li>
            <li>
              <Link className="link-muted" href="/catalogue?sort=nouveautes">
                Dernières sorties
              </Link>
            </li>
            <li>
              <Link className="link-muted" href="/recherche">
                Recherche
              </Link>
            </li>
            <li>
              <Link className="link-muted" href="/bibliotheque">
                Ma bibliothèque
              </Link>
            </li>
            <li>
              <Link className="link-muted" href="/aide">
                Aide et FAQ
              </Link>
            </li>
            <li>
              <Link className="link-muted" href="/adresse-de-secours">
                Adresse de secours
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Légal</p>
          <ul className="space-y-1.5 text-sm text-muted">
            <li>
              <Link className="link-muted" href="/legal/mentions">
                Mentions légales
              </Link>
            </li>
            <li>
              <Link className="link-muted" href="/legal/confidentialite">
                Politique de confidentialité
              </Link>
            </li>
            <li>
              <Link className="link-muted" href="/legal/dmca">
                Signalement de contenu (DMCA)
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Contact</p>
          <p className="text-sm text-muted">
            Une question, un problème de scan ? Utilisez le bouton « Signaler un problème »
            présent dans le lecteur.
          </p>
        </div>
      </div>
      <div className="border-t border-line py-4">
        <p className="container-site text-xs text-muted">
          © {new Date().getFullYear()} Les Poroiniens — contenu +18 réservé aux personnes
          majeures.
        </p>
      </div>
    </footer>
  );
}
