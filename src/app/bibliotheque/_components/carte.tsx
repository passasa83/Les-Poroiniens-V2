import Link from "next/link";
import clsx from "clsx";
import { ListChecks, Play, Trash2 } from "lucide-react";
import type { VueBiblio } from "@/components/bibliotheque/tri-vue";
import { Badge } from "@/components/ui/kit";
import type { LibraryDashboardRow } from "@/lib/data/library";
import {
  libelleCourt,
  libelleUnite,
  libelleUniteSingulier,
  libelleUnitesPluriel,
} from "@/lib/format";
import { SERIES_STATUT_LABELS } from "@/lib/types";
import { retirerAction } from "../_actions";
import { STATUT_LABELS, titreDe } from "../_lib/onglets";

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
  const unite = row.series?.unite;
  if (row.reprise) {
    return {
      href: `/serie/${slug}/chapitre-${row.reprise.numero}`,
      label: "Reprendre",
      aria: `Reprendre à ${libelleUnite(row.reprise.numero, unite)}, page ${row.reprise.page}`,
    };
  }
  if (row.premierNumero !== null) {
    return {
      href: `/serie/${slug}/chapitre-${row.premierNumero}`,
      label: `Lire ${libelleUnite(row.premierNumero, unite)}`,
      aria: `Lire ${libelleUnite(row.premierNumero, unite)}`,
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
              Dernier {libelleUniteSingulier(row.series?.unite).toLowerCase()} lu :{" "}
              <span className="font-semibold text-fg">
                {libelleCourt(row.reprise.numero, row.series?.unite)}
              </span>
              {row.reprise.page > 1 && <> · page {row.reprise.page}</>}
            </>
          ) : (
            "Aucune lecture enregistrée"
          )}
        </span>
        {row.totalChapitres === 0 ? (
          <Badge tone="neutral">
            Aucun {libelleUniteSingulier(row.series?.unite).toLowerCase()} publié
          </Badge>
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

export function CarteBiblio({ row, vue }: { row: LibraryDashboardRow; vue: VueBiblio }) {
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
            <dt className="inline">{libelleUnitesPluriel(serie?.unite)} : </dt>
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
        <Link href="/historique" className="link-muted inline-flex items-center gap-1 text-xs">
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
