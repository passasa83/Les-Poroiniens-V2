import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { getSettings } from "@/lib/data/moderation";

export const metadata: Metadata = {
  title: "Adresse de secours",
  description:
    "Si le site principal est inaccessible, retrouvez Les Poroiniens sur ses adresses de secours officielles.",
};

/**
 * La liste est saisie par le Gérant (Paramètres du site) : seules des
 * URL http(s) valides sont rendues cliquables, les lignes fautives sont ignorées.
 */
function safeUrls(raw: string | undefined): string[] {
  const out: string[] = [];
  for (const line of (raw ?? "").split(/\r?\n/)) {
    const value = line.trim();
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") out.push(url.toString());
    } catch {
      /* ligne non valide : ignorée */
    }
  }
  return [...new Set(out)];
}

/** page d'adresse de secours, mise à jour depuis l'administration. */
export default async function AdresseDeSecoursPage() {
  const settings = await getSettings().catch(() => ({}) as Record<string, string>);
  const urls = safeUrls(settings.adresses_secours);
  const canonical = process.env.NEXT_PUBLIC_SITE_URL || "";

  return (
    <div className="container-site max-w-3xl space-y-6 py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-fg sm:text-3xl">Adresse de secours</h1>
        <p className="text-sm text-muted">
          Si l&apos;adresse principale ne répond plus (maintenance, blocage réseau, panne DNS),
          utilisez l&apos;une des adresses ci-dessous : elles mènent au même site, avec le même
          compte et la même bibliothèque.
        </p>
      </div>

      <section className="card space-y-3 p-5" aria-labelledby="adresses-title">
        <h2 id="adresses-title" className="section-title">
          Adresses officielles
        </h2>
        {urls.length > 0 ? (
          <ul className="space-y-2">
            {urls.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="link-muted inline-flex items-center gap-2 break-words text-sm"
                >
                  {url}
                  <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">
            Aucune adresse de secours n&apos;est déclarée pour l&apos;instant : le site
            n&apos;est joignable que sur son adresse principale.
          </p>
        )}
        {canonical && <p className="meta">Adresse principale : {canonical}</p>}
      </section>

      <section className="card space-y-2 p-5" aria-labelledby="prudence-title">
        <h2 id="prudence-title" className="section-title flex items-center gap-2">
          <ShieldAlert className="size-4" aria-hidden="true" />
          Méfiez-vous des copies
        </h2>
        <p className="text-sm text-muted">
          Seules les adresses listées ici sont officielles. En cas de doute, vérifiez
          l&apos;orthographe de l&apos;adresse dans la barre d&apos;adresse et connectez-vous
          avec vos identifiants habituels : nous ne demandons jamais vos mots de passe par
          message.
        </p>
      </section>

      <div className="flex flex-wrap gap-2">
        <Link href="/" className="btn-secondary">
          Retour à l&apos;accueil
        </Link>
        <Link href="/aide" className="btn-ghost">
          Aide et FAQ
        </Link>
      </div>
    </div>
  );
}
