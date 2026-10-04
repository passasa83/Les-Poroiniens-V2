import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { AdultGate } from "@/components/adult/adult-gate";
import { Filters } from "@/components/series/filters";
import { SeriesGrid } from "@/components/series/series-card";
import { EmptyState, Pagination } from "@/components/ui/kit";
import { adultGateAccepted } from "@/lib/auth";
import { allSeries, listSeries } from "@/lib/data/series";

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Parcourez le catalogue complet : manga, manhwa et manhua, avec filtres par genre, statut, type et année.",
};

const SORTS = ["popularite", "nouveautes", "alpha", "note", "maj"] as const;
const STATUTS = ["en_cours", "termine", "hiatus", "abandonne"] as const;
const TYPES = ["manga", "manhwa", "manhua"] as const;

const Schema = z.object({
  q: z.string().max(120).catch("").optional(),
  genre: z.string().max(60).catch("").optional(),
  tag: z.string().max(60).catch("").optional(),
  statut: z.enum(STATUTS).optional().catch(undefined),
  type: z.enum(TYPES).optional().catch(undefined),
  annee: z.coerce.number().int().min(1900).max(2100).optional().catch(undefined),
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

function withoutTag(keep: Record<string, string>): string {
  const next = { ...keep };
  delete next.tag;
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
    sort: pick(sp, "sort"),
    page: pick(sp, "page"),
    adult: pick(sp, "adult"),
  });
  const p = parsed.success ? parsed.data : {};

  const gateOk = await adultGateAccepted();
  const adultParam = p.adult === "1";
  // Le contenu +18 n'apparaît qu'après validation du gate, ou sur demande
  // explicite via ?adult=1 (auquel cas le gate s'affiche, §11).
  const includeAdult = gateOk || adultParam;
  const showGate = adultParam && !gateOk;

  const [result, all] = await Promise.all([
    listSeries({
      q: p.q || undefined,
      genre: p.genre || undefined,
      tag: p.tag || undefined,
      statut: p.statut,
      type: p.type,
      annee: p.annee,
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

  const keep: Record<string, string> = {};
  if (p.q) keep.q = p.q;
  if (p.genre) keep.genre = p.genre;
  if (p.tag) keep.tag = p.tag;
  if (p.statut) keep.statut = p.statut;
  if (p.type) keep.type = p.type;
  if (p.annee) keep.annee = String(p.annee);
  if (p.sort) keep.sort = p.sort;
  if (adultParam) keep.adult = "1";

  return (
    <div className="container-site space-y-6 py-8">
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

      {p.tag && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Tag actif :</span>
          <Link
            href={withoutTag(keep)}
            className="chip chip-active"
            aria-label={`Retirer le tag ${p.tag}`}
          >
            {p.tag} ×
          </Link>
        </div>
      )}

      <Suspense fallback={<div className="card h-64 animate-pulse bg-surface2" />}>
        <Filters genres={genres} years={years} />
      </Suspense>

      {result.total === 0 ? (
        <EmptyState
          title="Aucune série ne correspond"
          description="Essayez d’élargir la recherche : enlevez un filtre ou modifiez les mots-clés."
          action={
            <Link href="/catalogue" className="btn-primary">
              Réinitialiser les filtres
            </Link>
          }
        />
      ) : (
        <>
          <SeriesGrid series={result.items} adultAllowed={includeAdult} />
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
