import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-site flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-6xl font-black text-primary">404</p>
      <h1 className="section-title">Page introuvable</h1>
      <p className="max-w-md text-sm text-muted">
        Cette page n&apos;existe pas ou a été déplacée. Vérifiez l&apos;adresse ou revenez au
        catalogue.
      </p>
      <Link href="/catalogue" className="btn-primary">
        Voir le catalogue
      </Link>
    </div>
  );
}
