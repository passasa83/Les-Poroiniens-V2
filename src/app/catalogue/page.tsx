import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { AdultGate } from "@/components/adult/adult-gate";
import {
  ActiveChips,
  CatalogueTabs,
  type CatalogueChip,
  type CatalogueTab,
} from "@/components/series/catalogue-bar";
import { CatalogueGrid } from "@/components/series/catalogue-card";
import { FilterDrawer, SortMenu } from "@/components/series/catalogue-controls";
import { EmptyState, Pagination } from "@/components/ui/kit";
import { adultGateAccepted } from "@/lib/auth";
import { allSeries, listSeries } from "@/lib/data/series";
import { SERIES_STATUT_LABELS, SERIES_TYPE_LABELS, type SeriesStatus, type SeriesType } from "@/lib/types";

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Parcourez le catalogue complet : manga, manhwa et manhua, avec filtres par genre, statut, type et année.",
};

const SORTS = ["popularite", "nouveautes", "alpha", "note", "maj"] as const;
const STATUTS = ["en_cours", "termine", "hiatus", "abandonne", "one_shot"] as const;
const TYPES = ["manga", "manhwa", "manhua"] as const;

const Schema = z.object({
  q: z.string().max(120).catch("").optional(),
  genre: z.string().max(300).catch("").optional(),
  tag: z.string().max(60).catch("").optional(),
  statut: z.enum(STATUTS).optional().catch(undefined),
  type: z.enum(TYPES).optional().catch(undefined),
  annee: z.coerce.number().int().min(1900).max(2100).optional().catch(undefined),
  langue: z.string().max(16).catch("").optional(),
  sort: z.enum(SORTS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(9999).optional().catch(undefined),
  adult: z.string().catch("").optional(),
});

type Search = Record<string, string | string[] | undefined>;

function pick(sp: Search, key: string): string | undefined {
  const raw = sp[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const clean = value?.trim();
  return clean ? clean : undefined;
}

/** URL du catalogue avec un ou plusieurs paramètres modifiés (page 1 par défaut). */
function hrefWith(
  keep: Record<string, string>,
  patch: Record<string, string | undefined>,
): string {
  const next: Record<string, string> = { ...keep };
  delete next.page;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  const qs = new URLSearchParams(next).toString();
  return qs ? `/catalogue?${qs}` : "/catalogue";
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;

  const parsed = Schema.safeParse({
    q: pick(sp, "q"),
    genre: pick(sp, "genre"),
    tag: pick(sp, "tag"),
    statut: pick(sp, "statut"),
    type: pick(sp, "type"),
    annee: pick(sp, "annee"),
    langue: pick(sp, "langue"),
    sort: pick(sp, "sort"),
    page: pick(sp, "page"),
    adult: pick(sp, "adult"),
  });
  const p = parsed.success ? parsed.data : {};

  const gateOk = await adultGateAccepted();
  const adultParam = p.adult === "1";
  // Le contenu +18 n'apparaît qu'après validation du gate, ou sur demande
  // explicite via ?adult=1 (auquel cas le gate s'affiche, §11). Tant que le
  // gate n'est pas validé, les cartes restent listées mais **floutées**
  // (adultAllowed={gateOk}, §10 « couverture floutée tant que le gate n'est
  // pas validé »).
  const includeAdult = gateOk || adultParam;
  const showGate = adultParam && !gateOk;

  const isOneShot = p.statut === "one_shot";
  const statut: SeriesStatus | undefined =
    p.statut && p.statut !== "one_shot" ? p.statut : undefined;

  const [result, all] = await Promise.all([
    listSeries({
      q: p.q || undefined,
      genre: p.genre || undefined,
      tag: p.tag || undefined,
      statut,
      type: p.type as SeriesType | undefined,
      annee: p.annee,
      langue: p.langue || undefined,
      // Onglets exclusifs (§6.3) : une publication unique vit dans « One-shot ».
      oneShot: isOneShot,
      excludeOneShot: !isOneShot && Boolean(statut),
      sort: p.sort,
      page: p.page,
      includeAdult,
    }),
    allSeries(),
  ]);

  const genres = [...new Set(all.flatMap((s) => s.genres))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const years = [
    ...new Set(all.map((s) => s.annee).filter((y): y is number => typeof y === "number")),
  ].sort((a, b) => b - a);
  const langues = [...new Set(all.map((s) => s.langue).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );

  const keep: Record<string, string> = {};
  if (p.q) keep.q = p.q;
  if (p.genre) keep.genre = p.genre;
  if (p.tag) keep.tag = p.tag;
  if (p.statut) keep.statut = p.statut;
  if (p.type) keep.type = p.type;
  if (p.annee) keep.annee = String(p.annee);
  if (p.langue) keep.langue = p.langue;
  if (p.sort) keep.sort = p.sort;
  if (adultParam) keep.adult = "1";

  const resetHref = adultParam ? "/catalogue?adult=1" : "/catalogue";

  /* Onglets de statut (§6.3) : les filtres du tiroir pointent vers les mêmes
     paramètres, un statut hors onglets (Hiatus, Abandonné) désactive tout onglet. */
  const tabs: CatalogueTab[] = [
    { value: "", label: "Tout", href: hrefWith(keep, { statut: undefined }) },
    {
      value: "en_cours",
      label: "En cours",
      href: hrefWith(keep, { statut: "en_cours" }),
    },
    { value: "termine", label: "Terminés", href: hrefWith(keep, { statut: "termine" }) },
    { value: "one_shot", label: "One-shot", href: hrefWith(keep, { statut: "one_shot" }) },
  ];

  /* Chips de filtres actifs (§6.3) : chacune retire son propre critère. */
  const chips: CatalogueChip[] = [];
  if (p.q) chips.push({ id: "q", label: `Recherche : ${p.q}`, href: hrefWith(keep, { q: undefined }) });
  for (const value of (p.genre ?? "").split(",").filter(Boolean)) {
    const remaining = (p.genre ?? "")
      .split(",")
      .filter((genre) => genre && genre !== value);
    chips.push({
      id: `genre:${value}`,
      label: value,
      href: hrefWith(keep, { genre: remaining.join(",") }),
    });
  }
  if (p.tag) chips.push({ id: "tag", label: p.tag, href: hrefWith(keep, { tag: undefined }) });
  if (p.statut)
    chips.push({
      id: "statut",
      label: isOneShot ? "One-shot" : SERIES_STATUT_LABELS[statut as SeriesStatus],
      href: hrefWith(keep, { statut: undefined }),
    });
  if (p.type)
    chips.push({
      id: "type",
      label: SERIES_TYPE_LABELS[p.type],
      href: hrefWith(keep, { type: undefined }),
    });
  if (p.annee)
    chips.push({ id: "annee", label: String(p.annee), href: hrefWith(keep, { annee: undefined }) });
  if (p.langue)
    chips.push({ id: "langue", label: p.langue, href: hrefWith(keep, { langue: undefined }) });

  return (
    <div className="container-site space-y-5 py-8">
      {showGate && <AdultGate open next="/catalogue" />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title text-2xl">Catalogue</h1>
          <p className="mt-1 text-sm text-muted">
            {result.total} {result.total > 1 ? "séries" : "série"}
            {result.page > 1 ? ` · page ${result.page}` : ""}
          </p>
        </div>
        {!includeAdult && (
          <Link href="/catalogue?adult=1" className="btn-secondary text-sm">
            Afficher le contenu +18
          </Link>
        )}
      </div>

      {/* Onglets centrés + menus déroulants à droite (§6.3) */}
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CatalogueTabs tabs={tabs} active={p.statut ?? ""} />
          <div className="flex shrink-0 items-center gap-2">
            <Suspense fallback={<div className="h-11 w-32 animate-pulse rounded-lg bg-surface2" />}>
              <SortMenu />
              <FilterDrawer
                genres={genres}
                years={years}
                langues={langues}
                total={result.total}
                adultAllowed={includeAdult}
                adultHref="/catalogue?adult=1"
              />
            </Suspense>
          </div>
        </div>
      </div>

      <ActiveChips chips={chips} resetHref={resetHref} />

      {result.total === 0 ? (
        <EmptyState
          title="Aucune série ne correspond"
          description="Essayez d’élargir la recherche : enlevez un filtre ou modifiez les mots-clés."
          action={
            <Link href={resetHref} className="btn-primary">
              Réinitialiser les filtres
            </Link>
          }
        />
      ) : (
        <>
          <CatalogueGrid series={result.items} adultAllowed={gateOk} />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            basePath="/catalogue"
            searchParams={keep}
          />
        </>
      )}
    </div>
  );
}
