import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileJson } from "lucide-react";
import { LibraryImport } from "@/components/bibliotheque/library-import";
import { LibraryToolbar } from "@/components/bibliotheque/library-toolbar";
import {
  isTriBiblio,
  isVueBiblio,
  type TriBiblio,
  type VueBiblio,
} from "@/components/bibliotheque/tri-vue";
import { AccessDenied } from "@/components/ui/access-denied";
import { EmptyState } from "@/components/ui/kit";
import { getCurrentUser } from "@/server/auth";
import { libraryDashboard } from "@/lib/data/library";
import { atLeast } from "@/lib/roles";
import type { LibraryStatus } from "@/lib/types";
import { CarteBiblio } from "./_components/carte";
import { COMPARATEURS, ONGLETS, STATUT_LABELS, type OngletBiblio } from "./_lib/onglets";

export const metadata: Metadata = {
  title: "Ma bibliothèque",
  robots: { index: false, follow: false },
};

export default async function BibliothequePage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; favoris?: string; tri?: string; vue?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/bibliotheque");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const { statut, favoris, tri, vue } = await searchParams;
  const statutActif =
    statut && Object.hasOwn(STATUT_LABELS, statut) ? (statut as LibraryStatus) : null;
  const favorisSeuls = favoris === "1" || favoris === "true";
  const triActif: TriBiblio = isTriBiblio(tri) ? tri : "lecture";
  const vueActive: VueBiblio = isVueBiblio(vue) ? vue : "liste";

  // Onglet courant : les favoris priment sur un statut combiné dans l'URL.
  const ongletActif = favorisSeuls ? "favoris" : (statutActif ?? "tout");

  const rows = await libraryDashboard(user.id);

  const filtre = rows.filter((row) => {
    if (ongletActif === "tout") return true;
    if (ongletActif === "favoris") return row.entry.favori;
    return row.entry.statut === ongletActif;
  });

  const triRows = [...filtre].sort(COMPARATEURS[triActif]);

  /* Onglets : libellés + compteurs. */
  const compteurs = new Map<string, number>(
    (Object.keys(STATUT_LABELS) as LibraryStatus[]).map((key) => [
      key,
      rows.filter((row) => row.entry.statut === key).length,
    ]),
  );
  const onglets = ONGLETS.map((onglet) => ({
    ...onglet,
    total:
      onglet.cle === "tout"
        ? rows.length
        : onglet.cle === "favoris"
          ? rows.filter((row) => row.entry.favori).length
          : (compteurs.get(onglet.cle) ?? 0),
    actif: ongletActif === onglet.cle,
  }));

  /** URL d'un onglet : tri et vue conservés, filtres remplacés. */
  function ongletHref(cle: OngletBiblio): string {
    const query = new URLSearchParams();
    if (cle !== "tout" && cle !== "favoris") query.set("statut", cle);
    if (cle === "favoris") query.set("favoris", "1");
    if (triActif !== "lecture") query.set("tri", triActif);
    if (vueActive !== "liste") query.set("vue", vueActive);
    const qs = query.toString();
    return qs ? `/bibliotheque?${qs}` : "/bibliotheque";
  }

  return (
    <div className="container-site space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Ma bibliothèque</h1>
          <p className="text-sm text-muted">
            {rows.length} série{rows.length > 1 ? "s" : ""} suivie{rows.length > 1 ? "s" : ""} ·
            export et import de votre bibliothèque
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <a className="btn-secondary text-sm" href="/api/account/library/export?format=json">
            <FileJson aria-hidden className="size-4" />
            Export JSON
          </a>
          <a className="btn-secondary text-sm" href="/api/account/library/export?format=csv">
            <Download aria-hidden className="size-4" />
            Export CSV
          </a>
          <LibraryImport />
        </div>
      </header>

      <nav aria-label="Onglets de la bibliothèque" className="overflow-x-auto">
        <div className="flex w-max min-w-full flex-wrap items-center gap-2">
          {onglets.map(({ cle, label, total, actif }) => (
            <Link
              key={cle}
              href={ongletHref(cle)}
              aria-current={actif ? "page" : undefined}
              className={actif ? "chip chip-active" : "chip"}
            >
              {label} ({total})
            </Link>
          ))}
        </div>
      </nav>

      <LibraryToolbar tri={triActif} vue={vueActive} total={triRows.length} />

      {rows.length === 0 ? (
        <EmptyState
          title="Votre bibliothèque est vide"
          description="Ajoutez des séries depuis le catalogue pour suivre votre lecture, noter vos coups de cœur et retrouver votre dernière page lue."
          action={
            <Link href="/catalogue" className="btn-primary">
              Parcourir le catalogue
            </Link>
          }
        />
      ) : triRows.length === 0 ? (
        <EmptyState
          title="Aucune série pour ce filtre"
          description="Modifiez l’onglet ou le filtre « Favoris » pour afficher d’autres séries."
          action={
            <Link href={ongletHref("tout")} className="btn-secondary">
              Voir toutes les séries
            </Link>
          }
        />
      ) : (
        <ul
          className={
            vueActive === "grille"
              ? "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
              : "space-y-3"
          }
        >
          {triRows.map((row) => (
            <li key={`${row.entry.user_id}-${row.entry.series_id}`}>
              <CarteBiblio row={row} vue={vueActive} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
