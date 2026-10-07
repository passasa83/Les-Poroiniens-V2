import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import clsx from "clsx";
import { Download, FileJson, ListChecks, Play, Trash2 } from "lucide-react";
import { LibraryImport } from "@/components/bibliotheque/library-import";
import { LibraryToolbar } from "@/components/bibliotheque/library-toolbar";
import {
  isTriBiblio,
  isVueBiblio,
  type TriBiblio,
  type VueBiblio,
} from "@/components/bibliotheque/tri-vue";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, EmptyState } from "@/components/ui/kit";
import { getCurrentUser } from "@/lib/auth";
import {
  libraryDashboard,
  removeLibraryEntry,
  type LibraryDashboardRow,
} from "@/lib/data/library";
import { atLeast } from "@/lib/roles";
import { SERIES_STATUT_LABELS, type LibraryStatus } from "@/lib/types";

export const metadata: Metadata = {
  title: "Ma bibliothèque",
  robots: { index: false, follow: false },
};

const STATUT_LABELS: Record<LibraryStatus, string> = {
  en_cours: "En cours",
  a_lire: "À lire",
  termine: "Terminé",
  en_pause: "En pause",
  abandonne: "Abandonné",
};

/** Onglets de la bibliothèque : Tout, statuts, Favoris. */
type OngletBiblio = "tout" | LibraryStatus | "favoris";

const ONGLETS: Array<{ cle: OngletBiblio; label: string }> = [
  { cle: "tout", label: "Tout" },
  { cle: "en_cours", label: "En cours" },
  { cle: "a_lire", label: "À lire" },
  { cle: "termine", label: "Terminé" },
  { cle: "en_pause", label: "En pause" },
  { cle: "abandonne", label: "Abandonné" },
  { cle: "favoris", label: "★ Favoris" },
];

/** Retire la ligne de sa bibliothèque : l'identité vient de la session. */
async function retirerAction(formData: FormData) {
  "use server";
  const user = await getCurrentUser();
  const seriesId = String(formData.get("seriesId") ?? "");
  if (!user || !seriesId || !atLeast(user.role, "membre")) return;
  await removeLibraryEntry(user.id, seriesId);
  revalidatePath("/bibliotheque");
}

function titreDe(row: LibraryDashboardRow): string {
  return row.series?.titre ?? row.entry.series_id;
}

/**
 * Lien de lecture de la carte : bouton **Reprendre** en cas de reprise
 * sinon premier chapitre paru. Le contexte exact (chapitre, page)
 * est porté par l'`aria-label`, le libellé visible reste court.
 */
function lienChapitre(row: LibraryDashboardRow): {
  href: string;
  label: string;
  aria: string;
} | null {
  const slug = row.series?.slug;
  if (!slug) return null;
  if (row.reprise) {
    return {
      href: `/serie/${slug}/chapitre-${row.reprise.numero}`,
      label: "Reprendre",
      aria: `Reprendre au chapitre ${row.reprise.numero}, page ${row.reprise.page}`,
    };
  }
  if (row.premierNumero !== null) {
    return {
      href: `/serie/${slug}/chapitre-${row.premierNumero}`,
      label: `Lire le chapitre ${row.premierNumero}`,
      aria: `Lire le chapitre ${row.premierNumero}`,
    };
  }
  return {
    href: `/serie/${slug}`,
    label: "Voir la série",
    aria: "Voir la fiche de la série",
  };
}

/** Barre de progression + dernier chapitre lu + badge « +N non lus ». */
function Progression({ row }: { row: LibraryDashboardRow }) {
  const titre = titreDe(row);
  const pourcent = row.progression;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>Progression</span>
        <span className="font-semibold text-fg">
          {row.totalChapitres > 0 ? `${pourcent} %` : "—"}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pourcent}
        aria-label={`Progression de lecture de ${titre}`}
        className="h-2 w-full overflow-hidden rounded-full bg-surface2"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pourcent}%` }} />
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          {row.reprise ? (
            <>
              Dernier chapitre lu : <span className="font-semibold text-fg">ch. {row.reprise.numero}</span>
              {row.reprise.page > 1 && <> · page {row.reprise.page}</>}
            </>
          ) : (
            "Aucune lecture enregistrée"
          )}
        </span>
        {row.totalChapitres === 0 ? (
          <Badge tone="neutral">Aucun chapitre publié</Badge>
        ) : row.nonLus > 0 ? (
          <Badge tone="primary">+{row.nonLus} non lus</Badge>
        ) : (
          <Badge tone="ok">À jour</Badge>
        )}
      </div>
    </div>
  );
}

/** Bouton de reprise collé à la carte. */
function BoutonReprendre({ row, className }: { row: LibraryDashboardRow; className?: string }) {
  const lien = lienChapitre(row);
  if (!lien) return null;
  return (
    <Link
      href={lien.href}
      className={clsx("btn-primary", className)}
      aria-label={`${lien.aria} — ${titreDe(row)}`}
    >
      <Play aria-hidden className="size-4" />
      {lien.label}
    </Link>
  );
}

function CarteBiblio({ row, vue }: { row: LibraryDashboardRow; vue: VueBiblio }) {
  const serie = row.series;
  const hrefSerie = serie ? `/serie/${serie.slug}` : "/catalogue";

  const couverture = (
    <Link href={hrefSerie} className="shrink-0" aria-label={titreDe(row)}>
      {serie ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={serie.couverture}
          alt={`Couverture de ${serie.titre}`}
          width={600}
          height={900}
          loading="lazy"
          decoding="async"
          className={
            vue === "grille"
              ? "aspect-[2/3] w-full rounded-lg bg-surface2 object-cover"
              : "h-28 w-[72px] rounded-lg object-cover"
          }
        />
      ) : (
        <div
          className={clsx(
            "grid place-items-center rounded-lg bg-surface2 text-xs text-muted",
            vue === "grille" ? "aspect-[2/3] w-full" : "h-28 w-[72px]",
          )}
          aria-hidden
        >
          ?
        </div>
      )}
    </Link>
  );

  const entete = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={hrefSerie}
          className={clsx(
            "truncate font-semibold text-fg hover:text-primary",
            vue === "grille" && "line-clamp-2",
          )}
        >
          {titreDe(row)}
        </Link>
        <Badge tone={row.entry.statut === "termine" ? "ok" : "neutral"}>
          {STATUT_LABELS[row.entry.statut]}
        </Badge>
        {row.entry.favori && <Badge tone="warn">★ Favori</Badge>}
        {serie && serie.statut !== "en_cours" && (
          <Badge tone="primary">{SERIES_STATUT_LABELS[serie.statut]}</Badge>
        )}
        {serie?.classification === "adult" && <Badge tone="adult">+18</Badge>}
      </div>
      {vue === "liste" && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          <div>
            <dt className="inline">Note : </dt>
            <dd className="inline font-semibold text-fg">
              {row.entry.note !== null ? `${row.entry.note}/10` : "non notée"}
            </dd>
          </div>
          <div>
            <dt className="inline">Chapitres : </dt>
            <dd className="inline font-semibold text-fg">{row.totalChapitres}</dd>
          </div>
          <div>
            <dt className="inline">Mis à jour : </dt>
            <dd className="inline">{new Date(row.entry.updated_at).toLocaleDateString("fr-FR")}</dd>
          </div>
        </dl>
      )}
    </>
  );

  const actions = (
    <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
      <BoutonReprendre row={row} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href="/historique"
          className="link-muted inline-flex items-center gap-1 text-xs"
        >
          <ListChecks className="size-3.5" aria-hidden />
          Historique
        </Link>
        <form action={retirerAction}>
          <input type="hidden" name="seriesId" value={row.entry.series_id} />
          <button type="submit" className="btn-ghost text-sm text-adult">
            <Trash2 className="size-4" aria-hidden />
            Retirer
          </button>
        </form>
      </div>
    </div>
  );

  if (vue === "grille") {
    return (
      <article className="card flex h-full flex-col gap-3 p-3">
        {couverture}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <div className="space-y-1.5">{entete}</div>
          <div className="mt-auto space-y-2">
            <Progression row={row} />
            {actions}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="card flex flex-wrap items-center gap-4 p-4">
      {couverture}
      <div className="min-w-0 flex-1 space-y-2">
        {entete}
        <Progression row={row} />
      </div>
      {actions}
    </article>
  );
}

export default async function BibliothequePage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; favoris?: string; tri?: string; vue?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/bibliotheque");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const { statut, favoris, tri, vue } = await searchParams;
  const statutActif = statut && statut in STATUT_LABELS ? (statut as LibraryStatus) : null;
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

  /* Tri : dernière lecture, nouveautés, titre, note. */
  const comparateurs: Record<TriBiblio, (a: LibraryDashboardRow, b: LibraryDashboardRow) => number> = {
    // Les séries jamais lues ferment la marche (chaîne vide avant les dates).
    lecture: (a, b) =>
      (b.derniereLecture ?? "").localeCompare(a.derniereLecture ?? "") ||
      b.entry.updated_at.localeCompare(a.entry.updated_at),
    // Nouveautés : dernière parution dans le catalogue, sinon mise à jour.
    nouveautes: (a, b) =>
      (b.derniereSortie ?? b.entry.updated_at).localeCompare(
        a.derniereSortie ?? a.entry.updated_at,
      ),
    titre: (a, b) => titreDe(a).localeCompare(titreDe(b), "fr"),
    note: (a, b) =>
      (b.entry.note ?? -1) - (a.entry.note ?? -1) || titreDe(a).localeCompare(titreDe(b), "fr"),
  };
  const triRows = [...filtre].sort(comparateurs[triActif]);

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
