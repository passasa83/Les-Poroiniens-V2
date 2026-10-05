import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AdultGate } from "@/components/adult/adult-gate";
import { SearchBox } from "@/components/search/search-box";
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
import { allSeries, listSeries, popularSeries } from "@/lib/data/series";
import {
  SERIES_STATUT_LABELS,
  SERIES_TYPE_LABELS,
  type SeriesStatus,
  type SeriesType,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Recherche",
  description: "Recherchez une série par titre, titre alternatif ou auteur.",
  robots: { index: false, follow: true },
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

/** URL de la recherche : le mot-clé est conservé, les filtres changent (§6.4). */
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
  return qs ? `/recherche?${qs}` : "/recherche";
}

export default async function RecherchePage({
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
  const includeAdult = gateOk || adultParam;
  const showGate = adultParam && !gateOk;
  const query = (p.q ?? "").trim();

  const keep: Record<string, string> = {};
  if (query) keep.q = query;
  if (p.genre) keep.genre = p.genre;
  if (p.tag) keep.tag = p.tag;
  if (p.statut) keep.statut = p.statut;
  if (p.type) keep.type = p.type;
  if (p.annee) keep.annee = String(p.annee);
  if (p.langue) keep.langue = p.langue;
  if (p.sort) keep.sort = p.sort;
  if (adultParam) keep.adult = "1";

  /* ── Sans mot-clé : champ vide + suggestions populaires (§6.4) ─────── */
  if (!query) {
    const suggestions = await popularSeries(12, includeAdult);
    return (
      <div className="container-site space-y-5 py-8">
        {showGate && <AdultGate open next="/recherche" />}
        <div>
          <h1 className="section-title text-2xl">Recherche</h1>
          <p className="mt-1 text-sm text-muted">
            Titres, titres alternatifs et auteurs — les fautes de frappe sont
            tolérées.
          </p>
        </div>
        <SearchBox className="max-w-xl" autoFocus />
        <section aria-labelledby="suggestions-populaires" className="space-y-3 pt-2">
          <h2 id="suggestions-populaires" className="section-title">
            Suggestions populaires
          </h2>
          {suggestions.length > 0 ? (
            <CatalogueGrid series={suggestions} adultAllowed={gateOk} />
          ) : (
            <EmptyState
              title="Aucune suggestion"
              description="Le catalogue n’a pas encore de série publiée."
              action={
                <Link href="/catalogue" className="btn-primary">
                  Parcourir le catalogue
                </Link>
              }
            />
          )}
        </section>
      </div>
    );
  }

  /* ── Avec mot-clé : résultats filtrables comme le catalogue (§6.4) ─── */
  const isOneShot = p.statut === "one_shot";
  const statut: SeriesStatus | undefined =
    p.statut && p.statut !== "one_shot" ? p.statut : undefined;

  const [result, all] = await Promise.all([
    listSeries({
      q: query,
      genre: p.genre || undefined,
      tag: p.tag || undefined,
      statut,
      type: p.type as SeriesType | undefined,
      annee: p.annee,
      langue: p.langue || undefined,
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

  const tabs: CatalogueTab[] = [
    { value: "", label: "Tout", href: hrefWith(keep, { statut: undefined }) },
    { value: "en_cours", label: "En cours", href: hrefWith(keep, { statut: "en_cours" }) },
    { value: "termine", label: "Terminés", href: hrefWith(keep, { statut: "termine" }) },
    { value: "one_shot", label: "One-shot", href: hrefWith(keep, { statut: "one_shot" }) },
  ];

  /* Chips de filtres actifs : le mot-clé reste dans le champ, il n'est pas chip. */
  const chips: CatalogueChip[] = [];
  for (const value of (p.genre ?? "").split(",").filter(Boolean)) {
    const remaining = (p.genre ?? "").split(",").filter((g) => g && g !== value);
    chips.push({
      id: `genre:${value}`,
      label: value,
      href: hrefWith(keep, { genre: remaining.join(",") }),
    });
  }
  if (p.tag)
    chips.push({ id: "tag", label: p.tag, href: hrefWith(keep, { tag: undefined }) });
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
    chips.push({
      id: "annee",
      label: String(p.annee),
      href: hrefWith(keep, { annee: undefined }),
    });
  if (p.langue)
    chips.push({
      id: "langue",
      label: p.langue,
      href: hrefWith(keep, { langue: undefined }),
    });

  const resetHref = hrefWith({ ...(adultParam ? { adult: "1" } : {}), q: query }, {});

  return (
    <div className="container-site space-y-5 py-8">
      {showGate && <AdultGate open next="/recherche" />}

      <div className="space-y-3">
        <div>
          <h1 className="section-title text-2xl">Recherche</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {result.total} {result.total > 1 ? "résultats" : "résultat"} pour «&nbsp;{query}
            &nbsp;»{result.page > 1 ? ` · page ${result.page}` : ""}
          </p>
        </div>
        <SearchBox className="max-w-xl" initialQuery={query} />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <CatalogueTabs tabs={tabs} active={p.statut ?? ""} />
          <div className="flex shrink-0 items-center gap-2">
            <SortMenu />
            <FilterDrawer
              genres={genres}
              years={years}
              langues={langues}
              total={result.total}
              adultAllowed={includeAdult}
              adultHref={hrefWith({ ...(adultParam ? { adult: "1" } : {}), q: query }, { adult: "1" })}
              keepQuery
            />
          </div>
        </div>
      </div>

      <ActiveChips chips={chips} resetHref={resetHref} />

      {result.total === 0 ? (
        <EmptyState
          title="Aucun résultat"
          description="Essayez un autre mot-clé, vérifiez l’orthographe ou retirez un filtre."
          action={
            <Link href={resetHref} className="btn-primary">
              Retirer les filtres
            </Link>
          }
        />
      ) : (
        <>
          <CatalogueGrid series={result.items} adultAllowed={gateOk} />
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            basePath="/recherche"
            searchParams={keep}
          />
        </>
      )}
    </div>
  );
}
