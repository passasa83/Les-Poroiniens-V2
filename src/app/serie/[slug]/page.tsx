import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Eye, Flag, Star } from "lucide-react";
import { AdultGate } from "@/components/adult/adult-gate";
import { CommentsSection } from "@/components/comments/comments-section";
import { FollowButton } from "@/components/series/follow-button";
import { SeriesGrid } from "@/components/series/series-card";
import { Badge, EmptyState, Rating } from "@/components/ui/kit";
import { adultGateAccepted, getCurrentUser } from "@/lib/auth";
import { listChapters } from "@/lib/data/chapters";
import { getLibraryEntry, listHistory } from "@/lib/data/library";
import { getSeriesBySlug, seriesStats, similarSeries } from "@/lib/data/series";
import { publishDueChaptersOnDemand } from "@/lib/publishing";
import {
  SERIES_STATUT_LABELS,
  type Chapter,
  type HistoryEntry,
  type Series,
} from "@/lib/types";

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const TYPE_LABELS: Record<Series["type"], string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
};

function plain(raw: string, max = 200): string {
  const clean = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const series = await getSeriesBySlug(slug);
  if (!series) return { title: "Série introuvable" };

  const isAdult = series.classification === "adult";
  const description = plain(series.synopsis) || `Lisez ${series.titre} en ligne.`;

  return {
    title: series.titre,
    description,
    // Contenu +18 : noindex et aucune image dans les aperçus de partage (§11.2)
    robots: isAdult ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: series.titre,
      description,
      type: "website",
      ...(isAdult ? {} : { images: [{ url: series.couverture, alt: `Couverture de ${series.titre}` }] }),
    },
  };
}

export default async function SeriePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const series = await getSeriesBySlug(slug);
  if (!series) notFound();

  // Chapitres programmés échus : publiés immédiatement (le cron quotidien ne
  // couvre qu'une exécution par jour sur le plan Hobby de Vercel).
  await publishDueChaptersOnDemand();

  const isAdult = series.classification === "adult";
  const [user, gateOk, stats] = await Promise.all([
    getCurrentUser(),
    adultGateAccepted(),
    seriesStats(series.slug),
  ]);
  const needsGate = isAdult && !gateOk;

  const [chapters, similar] = await Promise.all([
    listChapters(series.id, { publishedOnly: true }),
    similarSeries(series, 6),
  ]);

  const history: HistoryEntry[] = user ? await listHistory(user.id, 500) : [];
  const read = new Map(history.map((h) => [h.chapter_id, h]));
  const entry = user ? await getLibraryEntry(user.id, series.id) : null;

  const rawOrdre = Array.isArray(sp.ordre) ? sp.ordre[0] : sp.ordre;
  const asc = rawOrdre === "asc";
  const ordered: Chapter[] = asc ? [...chapters].reverse() : chapters;

  const toggleHref = `/serie/${series.slug}?ordre=${asc ? "desc" : "asc"}#chapitres`;

  return (
    <div className="container-site space-y-10 py-8">
      {isAdult && <meta name="rating" content="adult" />}
      {needsGate && <AdultGate open next={`/serie/${series.slug}`} />}

      <div className={needsGate ? "adult-blur space-y-10" : "space-y-10"}>
        {/* ── En-tête de la fiche ─────────────────────────────────────── */}
        <header className="grid gap-6 sm:grid-cols-[200px_1fr]">
          <div className="relative mx-auto w-40 sm:mx-0 sm:w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={series.couverture}
              alt={`Couverture de ${series.titre}`}
              width={600}
              height={900}
              loading="eager"
              className="aspect-[2/3] w-full rounded-xl border border-line object-cover"
            />
            {isAdult && (
              <span className="absolute left-2 top-2">
                <Badge tone="adult">+18</Badge>
              </span>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-fg sm:text-3xl">
                {series.titre}
              </h1>
              {series.titresAlt.length > 0 && (
                <p className="text-sm text-muted">Également connu sous : {series.titresAlt.join(", ")}</p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={series.statut === "termine" ? "ok" : "neutral"}>
                {SERIES_STATUT_LABELS[series.statut]}
              </Badge>
              <Badge tone="primary">{TYPE_LABELS[series.type]}</Badge>
              <Badge tone="neutral">{series.annee ?? "année inconnue"}</Badge>
              <Badge tone="neutral">{series.langue}</Badge>
              <Rating value={series.noteMoy} count={series.nbVotes} />
            </div>

            <p className="max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {series.synopsis}
            </p>

            <div className="space-y-2 text-sm">
              <p className="text-muted">
                <span className="font-semibold text-fg">Auteurs :</span>{" "}
                {series.auteurs.join(", ")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-fg">Genres :</span>
                {series.genres.map((g) => (
                  <Link key={g} href={`/catalogue?genre=${encodeURIComponent(g)}`} className="chip">
                    {g}
                  </Link>
                ))}
              </div>
              {series.tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-fg">Tags :</span>
                  {series.tags.map((t) => (
                    <Link key={t} href={`/catalogue?tag=${encodeURIComponent(t)}`} className="chip">
                      {t}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Statistiques publiques (§14.8) ──────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile icon={<Eye className="size-4" />} label="Vues" value={stats.vues.toLocaleString("fr-FR")} />
            <StatTile
              icon={<Star className="size-4" />}
              label="Note moyenne"
              value={`${stats.noteMoy.toFixed(1)}/10 (${stats.nbVotes})`}
            />
            <StatTile icon={<BookOpen className="size-4" />} label="Chapitres" value={String(stats.nb_chapitres)} />
            <StatTile
              icon={<Flag className="size-4" />}
              label="Statut"
              value={SERIES_STATUT_LABELS[series.statut]}
            />
          </div>
        )}

        {/* ── Suivi / notation ────────────────────────────────────────── */}
        {user ? (
          <FollowButton
            seriesId={series.id}
            initial={{
              statut: entry?.statut ?? null,
              favori: entry?.favori ?? false,
              note: entry?.note ?? null,
            }}
          />
        ) : (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted">
              Créez un compte pour suivre cette série, la noter et participer aux commentaires.
            </p>
            <div className="flex gap-2">
              <Link href="/connexion" className="btn-secondary">
                Connexion
              </Link>
              <Link href="/inscription" className="btn-primary">
                Inscription
              </Link>
            </div>
          </div>
        )}

        {/* ── Chapitres ───────────────────────────────────────────────── */}
        <section id="chapitres" className="scroll-mt-24 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">
              Chapitres <span className="text-sm font-normal text-muted">({chapters.length})</span>
            </h2>
            <Link href={toggleHref} className="btn-ghost text-sm">
              {asc ? "Croissant ↑" : "Décroissant ↓"}
            </Link>
          </div>

          {ordered.length === 0 ? (
            <EmptyState
              title="Aucun chapitre publié"
              description="Le premier chapitre arrive bientôt."
            />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {ordered.map((chapter) => {
                const state = read.get(chapter.id);
                return (
                  <li key={chapter.id}>
                    <Link
                      href={`/serie/${series.slug}/chapitre-${chapter.numero}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface2"
                    >
                      <span className="w-14 shrink-0 text-sm font-bold text-primary">
                        Ch. {chapter.numero}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">
                        {chapter.titre}
                        {chapter.volume !== null && (
                          <span className="ml-2 text-xs text-muted">Vol. {chapter.volume}</span>
                        )}
                      </span>
                      <span className="hidden text-xs text-muted sm:block">
                        {chapter.publish_at
                          ? new Date(chapter.publish_at).toLocaleDateString("fr-FR")
                          : ""}
                      </span>
                      <span className="w-16 shrink-0 text-right text-xs text-muted">
                        {chapter.nb_pages} p.
                      </span>
                      {user &&
                        (state?.completed ? (
                          <Badge tone="ok">Lu</Badge>
                        ) : state && state.page > 0 ? (
                          <Badge tone="warn">p. {state.page}</Badge>
                        ) : (
                          <Badge tone="neutral">Non lu</Badge>
                        ))}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Séries similaires ───────────────────────────────────────── */}
        {similar.length > 0 && (
          <section className="space-y-4">
            <h2 className="section-title">Séries similaires</h2>
            <SeriesGrid series={similar} adultAllowed={gateOk} />
          </section>
        )}

        {/* ── Commentaires ────────────────────────────────────────────── */}
        {!needsGate && (
          <CommentsSection
            targetType="series"
            targetId={series.id}
            canComment={Boolean(user)}
            adultOnly={isAdult}
          />
        )}
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <span className="flex items-center gap-2 text-xs text-muted">
        {icon}
        {label}
      </span>
      <span className="text-lg font-bold text-fg">{value}</span>
    </div>
  );
}
