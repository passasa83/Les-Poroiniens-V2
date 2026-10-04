import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { SeriesGrid } from "@/components/series/series-card";
import { EmptyState, Pagination } from "@/components/ui/kit";
import { adultGateAccepted } from "@/lib/auth";
import { listSeries, popularSeries } from "@/lib/data/series";

export const metadata: Metadata = {
  title: "Recherche",
  description: "Recherchez une série par titre, titre alternatif ou auteur.",
  robots: { index: false, follow: true },
};

const Schema = z.object({
  q: z.string().max(120).catch("").optional(),
  page: z.coerce.number().int().min(1).max(9999).optional().catch(undefined),
});

type Search = Record<string, string | string[] | undefined>;

function pick(sp: Search, key: string): string | undefined {
  const raw = sp[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const clean = value?.trim();
  return clean ? clean : undefined;
}

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const parsed = Schema.safeParse({ q: pick(sp, "q"), page: pick(sp, "page") });
  const q = parsed.success ? (parsed.data.q ?? "") : "";
  const page = parsed.success ? parsed.data.page : undefined;

  const gateOk = await adultGateAccepted();

  const [result, suggestions] = await Promise.all([
    listSeries({ q: q || undefined, page, includeAdult: gateOk, sort: "popularite" }),
    popularSeries(6, gateOk),
  ]);

  const keep: Record<string, string> = {};
  if (q) keep.q = q;

  return (
    <div className="container-site space-y-6 py-8">
      <div>
        <h1 className="section-title text-2xl">Recherche</h1>
        <p className="mt-1 text-sm text-muted">
          Titres, titres alternatifs et auteurs.
        </p>
      </div>

      <form action="/recherche" method="get" className="flex max-w-xl gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          maxLength={120}
          placeholder="Ex. : Poroiniens, Amamiya…"
          aria-label="Rechercher une série"
          className="input"
        />
        <button type="submit" className="btn-primary shrink-0">
          Rechercher
        </button>
      </form>

      {!q ? (
        <EmptyState
          title="Lancez une recherche"
          description="Saisissez un titre, un titre alternatif ou le nom d’un auteur pour trouver une série."
        />
      ) : result.total === 0 ? (
        <div className="space-y-8">
          <EmptyState
            title={`Aucun résultat pour « ${q} »`}
            description="Vérifiez l’orthographe, essayez un autre mot-clé ou parcourez les séries les plus populaires."
            action={
              <Link href="/catalogue" className="btn-secondary">
                Voir tout le catalogue
              </Link>
            }
          />
          {suggestions.length > 0 && (
            <section>
              <h2 className="section-title">Suggestions</h2>
              <div className="mt-4">
                <SeriesGrid series={suggestions} adultAllowed={gateOk} />
              </div>
            </section>
          )}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            {result.total} {result.total > 1 ? "résultats" : "résultat"} pour « {q} »
          </p>
          <SeriesGrid series={result.items} adultAllowed={gateOk} />
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
