import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="container-site flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-6xl font-black text-adult">403</p>
      <h1 className="section-title">Accès refusé</h1>
      <p className="max-w-md text-sm text-muted">
        Votre rôle ne vous donne pas accès à cette page. Si vous pensez qu&apos;il s&apos;agit
        d&apos;une erreur, contactez un administrateur.
      </p>
      <Link href="/" className="btn-primary">
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
