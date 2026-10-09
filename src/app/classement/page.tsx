import type { Metadata } from "next";
import Link from "next/link";
import clsx from "clsx";
import { adultGateAccepted } from "@/lib/auth";
import { compteUnites, libelleUniteSingulier } from "@/lib/format";
import { Badge, EmptyState, Rating } from "@/components/ui/kit";
import {
  PERIODES,
  PERIODE_DEFAUT,
  classement,
  estPeriode,
  estTypeSerie,
  type PeriodeCle,
  type RangClassement,
} from "@/lib/data/classement";
import { SERIES_TYPE_LABELS, type SeriesType } from "@/lib/types";

export const metadata: Metadata = {
  title: "Classement",
  description:
    "Le classement des séries les plus actives sur Les Poroiniens : jour, semaine, mois et tout temps, en manga, manhwa, manhua et light novel.",
};

/* Le classement repose sur l'activité en base : jamais de page figée. */
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

const TYPES: Array<{ cle: SeriesType | ""; label: string }> = [
  { cle: "", label: "Tous formats" },
  { cle: "manga", label: "Manga" },
  { cle: "manhwa", label: "Manhwa" },
  { cle: "manhua", label: "Manhua" },
  { cle: "light_novel", label: "Light Novel" },
];

function premier(sp: Record<string, string | string[] | undefined>, cle: string): string | undefined {
  const brut = sp[cle];
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  const propre = valeur?.trim();
  return propre ? propre : undefined;
}

/** URL de l'onglet Période : le filtre de format est conservé. */
function hrefPeriode(cle: PeriodeCle, type: SeriesType | ""): string {
  const query = new URLSearchParams();
  if (cle !== PERIODE_DEFAUT) query.set("periode", cle);
  if (type) query.set("type", type);
  const qs = query.toString();
  return qs ? `/classement?${qs}` : "/classement";
}

/** URL du filtre Format : la période est conservée. */
function hrefType(periode: PeriodeCle, type: SeriesType | ""): string {
  const query = new URLSearchParams();
  if (periode !== PERIODE_DEFAUT) query.set("periode", periode);
  if (type) query.set("type", type);
  const qs = query.toString();
  return qs ? `/classement?${qs}` : "/classement";
}

/**
 * Évolution : places gagnées depuis la fenêtre précédente de même
 * longueur. `▲` monte, `▼` descend, `=` stable, `—` non comparable. Aucune
 * couleur réservée au podium et aucun point : la liste reste une liste.
 */
function Evolution({ rang, nouveau }: { rang: number | null; nouveau: boolean }) {
  if (nouveau) {
    /* Déjà annoncé par le badge « Nouveau » posé sur la ligne. */
    return null;
  }
  if (rang === null) {
    return (
      <>
        <span aria-hidden>—</span>
        <span className="sr-only">Non comparable avec la période précédente</span>
      </>
    );
  }
  if (rang === 0) {
    return (
      <>
        <span aria-hidden>=</span>
        <span className="sr-only">Stable par rapport à la période précédente</span>
      </>
    );
  }
  const gagne = rang > 0;
  const nombre = Math.abs(rang);
  return (
    <>
      <span aria-hidden>{gagne ? "▲" : "▼"}</span>
      <span aria-hidden className="tabular-nums">
        {nombre}
      </span>
      <span className="sr-only">
        {gagne ? "Gagne" : "Perd"} {nombre} place{nombre > 1 ? "s" : ""} par rapport à la période
        précédente
      </span>
    </>
  );
}

function activite(r: RangClassement, periode: PeriodeCle): string {
  if (periode === "tout-temps") {
    /* le compteur de vues est réservé à la fiche série. Sur « Tout
       temps », on annonce donc le nombre de chapitres publiés (colonne déjà
       dénormalisée en base) plutôt qu'un nombre de vues. */
    const chapitres = Math.max(Math.trunc(r.serie.nb_chapitres) || 0, 0);
    if (chapitres === 0)
      return `Aucun ${libelleUniteSingulier(r.serie.unite).toLowerCase()} publié`;
    return compteUnites(chapitres, r.serie.unite);
  }
  const bits: string[] = [];
  if (r.sorties > 0) bits.push(`${r.sorties} sortie${r.sorties > 1 ? "s" : ""}`);
  if (r.lectures > 0) bits.push(`${r.lectures} lecture${r.lectures > 1 ? "s" : ""}`);
  if (bits.length === 0) bits.push("Activité sur la période");
  return bits.join(" · ");
}

function LigneClassement({ r, periode }: { r: RangClassement; periode: PeriodeCle }) {
  const serie = r.serie;
  const genres = serie.genres.slice(0, 3).join(" · ");

  return (
    <li>
      <Link
        href={`/serie/${serie.slug}`}
        className="card group flex items-center gap-3 p-3 transition-colors hover:border-accent"
      >
        {/* Rang + évolution : colonne étroite, jamais de podium */}
        <span className="flex w-8 shrink-0 flex-col items-center gap-0.5">
          <span className="text-base font-black tabular-nums text-fg">{r.rang}</span>
          <span
            className={clsx(
              "flex items-center gap-0.5 text-[11px] font-semibold",
              r.nouveau || r.evolution === null
                ? "text-muted"
                : r.evolution > 0
                  ? "text-ok"
                  : r.evolution < 0
                    ? "text-warn"
                    : "text-muted",
            )}
          >
            <Evolution rang={r.evolution} nouveau={r.nouveau} />
          </span>
        </span>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={serie.couverture || `/api/img/cover/${serie.slug}`}
          alt=""
          width={48}
          height={72}
          loading="lazy"
          decoding="async"
          className="h-16 w-11 shrink-0 rounded-lg bg-surface2 object-cover"
        />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg group-hover:text-primary">
              {serie.titre}
            </span>
            {r.nouveau && <Badge tone="primary">Nouveau</Badge>}
            {serie.classification === "adult" && <Badge tone="adult">+18</Badge>}
          </span>
          <span className="meta mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="truncate">{genres || SERIES_TYPE_LABELS[serie.type]}</span>
            {Number.isFinite(serie.noteMoy) && (
              <Rating value={serie.noteMoy} count={serie.nbVotes} />
            )}
            <span className="sm:hidden">{activite(r, periode)}</span>
          </span>
        </span>

        <span className="hidden shrink-0 flex-col items-end gap-1 text-right sm:flex">
          <span className="meta">{SERIES_TYPE_LABELS[serie.type]}</span>
          <span className="meta">{activite(r, periode)}</span>
        </span>
      </Link>
    </li>
  );
}

/**
 * « Classement » : onglets Jour / Semaine / Mois / Tout temps, filtre de
 * format, liste numérotée avec évolution. Tout est piloté par l'URL
 * (`?periode=` et `?type=`) : une valeur inconnue bascule silencieusement sur
 * le repli par défaut et les onglets restent de simples liens.
 */
export default async function ClassementPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;

  const periodeBrute = premier(sp, "periode");
  const periode: PeriodeCle = estPeriode(periodeBrute) ? periodeBrute : PERIODE_DEFAUT;
  const typeBrut = premier(sp, "type");
  const type: SeriesType | "" = estTypeSerie(typeBrut) ? typeBrut : "";

  const includeAdult = await adultGateAccepted();
  const rangs = await classement({ periode, type, includeAdult, limite: 50 });

  const definition = PERIODES.find((p) => p.cle === periode) ?? PERIODES[0];
  const filtreType = TYPES.find((t) => t.cle === type);

  /* État vide : on propose un autre onglet plutôt qu'une page morte. */
  const autrePeriode: PeriodeCle = periode === "tout-temps" ? "mois" : "tout-temps";
  const autreLien = hrefPeriode(autrePeriode, type);
  const autreLabel =
    autrePeriode === "mois" ? "Voir le classement du mois" : "Voir le classement de tous les temps";

  return (
    <div className="container-site space-y-6 py-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-black tracking-tight text-fg">Classement</h1>
        <p className="text-sm text-muted">
          {definition.fenetre.charAt(0).toUpperCase() + definition.fenetre.slice(1)} ·{" "}
          {periode === "tout-temps"
            ? "les séries du catalogue classées par vues cumulées"
            : "les séries ayant eu une activité pendant la période (chapitres parus et lectures enregistrées)"}
          {filtreType ? ` · ${filtreType.label}` : ""}
        </p>
      </header>

      <nav aria-label="Période du classement" className="overflow-x-auto">
        <div className="flex w-max min-w-full flex-wrap items-center gap-2">
          {PERIODES.map((p) => (
            <Link
              key={p.cle}
              href={hrefPeriode(p.cle, type)}
              aria-current={p.cle === periode ? "page" : undefined}
              className={p.cle === periode ? "chip chip-active" : "chip"}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </nav>

      <nav aria-label="Format du classement" className="overflow-x-auto">
        <div className="flex w-max min-w-full flex-wrap items-center gap-2">
          {TYPES.map((t) => (
            <Link
              key={t.cle || "tous"}
              href={hrefType(periode, t.cle)}
              aria-current={t.cle === type ? "page" : undefined}
              className={t.cle === type ? "chip chip-active" : "chip"}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>

      {rangs.length === 0 ? (
        <EmptyState
          title="Aucune activité sur cette période"
          description={`Aucune série n’a eu de chapitre paru ni de lecture enregistrée pendant ${definition.fenetre}${
            filtreType ? ` pour les ${filtreType.label.toLowerCase()}s` : ""
          }. Le classement se remplit dès la première activité.`}
          action={
            <Link href={autreLien} className="btn-secondary">
              {autreLabel}
            </Link>
          }
        />
      ) : (
        <ol className="space-y-2">
          {rangs.map((r) => (
            <LigneClassement key={r.serie.id} r={r} periode={periode} />
          ))}
        </ol>
      )}
    </div>
  );
}
