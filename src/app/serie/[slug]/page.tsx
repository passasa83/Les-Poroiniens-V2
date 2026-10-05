import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { BookOpen, Eye, Flag, Play, Star } from "lucide-react";
import { AdultGate } from "@/components/adult/adult-gate";
import { CommentsSection } from "@/components/comments/comments-section";
import { ChapterList, type ChapterRow } from "@/components/series/chapter-list";
import { FollowButton } from "@/components/series/follow-button";
import { SeriesGrid } from "@/components/series/series-card";
import { Synopsis } from "@/components/series/synopsis";
import { Badge, EmptyState, Rating } from "@/components/ui/kit";
import { adultGateAccepted, getCurrentUser } from "@/lib/auth";
import { listChapters } from "@/lib/data/chapters";
import { getLibraryEntry, listHistory } from "@/lib/data/library";
import { getSeriesBySlug, seriesStats, similarSeries } from "@/lib/data/series";
import { dateOrRelative, plainText } from "@/lib/format";
import { publishDueChaptersOnDemand } from "@/lib/publishing";
import {
  SERIES_STATUT_LABELS,
  SERIES_TYPE_LABELS,
  type Chapter,
  type HistoryEntry,
} from "@/lib/types";

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function plain(raw: string, max = 200): string {
  return plainText(raw, max);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const series = await getSeriesBySlug(slug);
  if (!series) {
    // `notFound()` est lancé dans une réponse streamée (loading.tsx) : le
    // statut reste 200. On exclut donc la page des index (atténuation
    // officielle Next) ; le 404 réel relève d'un contrôle dans `proxy`.
    return { title: "Série introuvable", robots: { index: false, follow: false } };
  }

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

/** Onglets de la fiche : Chapitres / Commentaires / Infos (§6.5). */
const ONGLETS = ["chapitres", "commentaires", "infos"] as const;
type Onglet = (typeof ONGLETS)[number];

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
  const ascending: Chapter[] = [...chapters].sort((a, b) => a.numero - b.numero);
  const ordered: Chapter[] = asc ? ascending : [...ascending].reverse();

  const chapterHref = (numero: number) => `/serie/${series.slug}/chapitre-${numero}`;
  const firstChapter = ascending[0] ?? null;

  /* Bouton principal : reprise de lecture pour un membre, sinon premier ch. */
  const reprise = history
    .filter((h) => h.series_id === series.id)
    .sort((a, b) => b.read_at.localeCompare(a.read_at))[0];
  const repriseChapitre = reprise
    ? chapters.find((c) => c.id === reprise.chapter_id) ?? null
    : null;
  const cta = repriseChapitre
    ? {
        href: chapterHref(repriseChapitre.numero),
        label: `Reprendre au chapitre ${repriseChapitre.numero}, page ${Math.max(1, reprise.page)}`,
      }
    : firstChapter
      ? { href: chapterHref(firstChapter.numero), label: `Lire le chapitre ${firstChapter.numero}` }
      : null;

  const rawOnglet = Array.isArray(sp.onglet) ? sp.onglet[0] : sp.onglet;
  const onglet: Onglet = ONGLETS.includes(rawOnglet as Onglet) ? (rawOnglet as Onglet) : "chapitres";

  const rows: ChapterRow[] = ordered.map((chapter) => {
    const state = read.get(chapter.id);
    return {
      id: chapter.id,
      numero: chapter.numero,
      titre: chapter.titre,
      volume: chapter.volume,
      date: dateOrRelative(chapter.publish_at ?? chapter.created_at),
      pages: chapter.nb_pages,
      likes: chapter.likes ?? 0,
      href: chapterHref(chapter.numero),
      lu: state?.completed ?? false,
      page: state?.page ?? null,
    };
  });

  /* Données structurées de la fiche (§6.5, SEO). */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Book",
    name: series.titre,
    ...(series.titresAlt.length ? { alternateName: series.titresAlt } : {}),
    image: series.couverture,
    description: plain(series.synopsis, 300),
    inLanguage: series.langue,
    ...(series.annee ? { datePublished: String(series.annee) } : {}),
    ...(series.auteurs.length ? { author: series.auteurs.map((a) => ({ "@type": "Person", name: a })) } : {}),
    ...(series.genres.length ? { genre: series.genres.join(", ") } : {}),
    ...(series.tags.length ? { keywords: series.tags.join(", ") } : {}),
    numberOfEpisodes: series.nb_chapitres,
    ...(series.nbVotes > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: series.noteMoy.toFixed(1),
            ratingCount: series.nbVotes,
            bestRating: "10",
            worstRating: "1",
          },
        }
      : {}),
  };

  const tabs: Array<{ id: Onglet; label: string; count?: number }> = [
    { id: "chapitres", label: "Chapitres", count: chapters.length },
    { id: "commentaires", label: "Commentaires" },
    { id: "infos", label: "Infos" },
  ];

  return (
    <div className="container-site space-y-8 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {isAdult && <meta name="rating" content="adult" />}
      {needsGate && <AdultGate open next={`/serie/${series.slug}`} />}

      <div className={needsGate ? "adult-blur space-y-8" : "space-y-8"}>
        {/* ── Bannière floutée : couverture, identité, bouton principal ─── */}
        <header className="relative overflow-hidden rounded-3xl border border-line">
          <div aria-hidden className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={series.banniere ?? series.couverture}
              alt=""
              width={1600}
              height={900}
              loading="lazy"
              decoding="async"
              className="h-full w-full scale-110 object-cover blur-2xl brightness-[.45] saturate-150"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-surface/95 via-surface/85 to-surface/60" />
          </div>

          <div className="relative grid gap-6 p-5 sm:grid-cols-[180px_1fr] sm:p-6">
            <div className="relative mx-auto w-40 sm:mx-0 sm:w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={series.couverture}
                alt={`Couverture de ${series.titre}`}
                width={600}
                height={900}
                loading="eager"
                fetchPriority="high"
                decoding="sync"
                className="aspect-[2/3] w-full rounded-xl border border-line object-cover shadow-lg"
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
                  <p className="text-sm text-muted">
                    Également connu sous : {series.titresAlt.join(", ")}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge tone={series.statut === "termine" ? "ok" : "neutral"}>
                  {SERIES_STATUT_LABELS[series.statut]}
                </Badge>
                <Badge tone="primary">{SERIES_TYPE_LABELS[series.type]}</Badge>
                <Badge tone="neutral">{series.annee ?? "année inconnue"}</Badge>
                <Badge tone="neutral">{series.langue}</Badge>
                <Rating value={series.noteMoy} count={series.nbVotes} />
              </div>

              <Synopsis text={series.synopsis} />

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Genres :</span>
                {series.genres.map((g) => (
                  <Link key={g} href={`/catalogue?genre=${encodeURIComponent(g)}`} className="chip">
                    {g}
                  </Link>
                ))}
              </div>

              {cta && (
                <Link href={cta.href} className="btn-primary">
                  <Play aria-hidden className="size-4" />
                  {cta.label}
                </Link>
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

        {/* ── Suivi / notation (le « + Bibliothèque » de la DA) ────────── */}
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

        {/* ── Onglets : Chapitres / Commentaires / Infos ───────────────── */}
        <nav aria-label="Sections de la fiche" className="overflow-x-auto">
          <div className="flex w-max min-w-full items-stretch gap-1 border-b border-line">
            {tabs.map((tab) => (
              <Link
                key={tab.id}
                href={`/serie/${series.slug}?onglet=${tab.id}${asc ? "&ordre=asc" : ""}#contenu`}
                aria-current={onglet === tab.id ? "page" : undefined}
                className={clsx(
                  "inline-flex min-h-11 items-center border-b-2 px-4 text-sm transition-colors",
                  onglet === tab.id
                    ? "border-primary font-semibold text-fg"
                    : "border-transparent text-muted hover:text-fg",
                )}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className="ml-1 text-xs font-normal text-muted">({tab.count})</span>
                )}
              </Link>
            ))}
          </div>
        </nav>

        <div id="contenu" className="scroll-mt-24 space-y-4">
          {onglet === "chapitres" && (
            <section aria-labelledby="chapitres" className="space-y-4">
              <h2 id="chapitres" className="section-title">
                Chapitres <span className="text-sm font-normal text-muted">({chapters.length})</span>
              </h2>
              {ordered.length === 0 ? (
                <EmptyState
                  title="Aucun chapitre publié"
                  description="Le premier chapitre arrive bientôt."
                />
              ) : (
                <ChapterList
                  chapters={rows}
                  seriesId={series.id}
                  orderHref={`/serie/${series.slug}?ordre=${asc ? "desc" : "asc"}#contenu`}
                  orderLabel={asc ? "Dernier → Premier" : "Premier → Dernier"}
                  canMark={Boolean(user) && !needsGate}
                />
              )}
            </section>
          )}

          {onglet === "commentaires" && (
            <CommentsSection
              targetType="series"
              targetId={series.id}
              canComment={Boolean(user)}
              adultOnly={isAdult}
            />
          )}

          {onglet === "infos" && (
            <section aria-labelledby="infos" className="space-y-4">
              <h2 id="infos" className="section-title">
                Infos
              </h2>
              <dl className="card overflow-hidden p-0 text-sm">
                <InfoRow label="Auteurs">
                  {series.auteurs.length ? series.auteurs.join(", ") : "Non renseigné"}
                </InfoRow>
                <InfoRow label="Éditeur">Non renseigné</InfoRow>
                <InfoRow label="Année">{series.annee ?? "—"}</InfoRow>
                <InfoRow label="Type">{SERIES_TYPE_LABELS[series.type]}</InfoRow>
                <InfoRow label="Statut">{SERIES_STATUT_LABELS[series.statut]}</InfoRow>
                <InfoRow label="Langue">{series.langue}</InfoRow>
                <InfoRow label="Genres">
                  <span className="flex flex-wrap gap-2">
                    {series.genres.length ? (
                      series.genres.map((g) => (
                        <Link
                          key={g}
                          href={`/catalogue?genre=${encodeURIComponent(g)}`}
                          className="chip"
                        >
                          {g}
                        </Link>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </InfoRow>
                <InfoRow label="Tags">
                  <span className="flex flex-wrap gap-2">
                    {series.tags.length ? (
                      series.tags.map((t) => (
                        <Link
                          key={t}
                          href={`/catalogue?tag=${encodeURIComponent(t)}`}
                          className="chip"
                        >
                          {t}
                        </Link>
                      ))
                    ) : (
                      "—"
                    )}
                  </span>
                </InfoRow>
                <InfoRow label="Titres alternatifs">
                  {series.titresAlt.length ? series.titresAlt.join(", ") : "—"}
                </InfoRow>
              </dl>
            </section>
          )}
        </div>

        {/* ── Séries similaires (bas de page, §6.5) ───────────────────── */}
        {similar.length > 0 && (
          <section className="space-y-4">
            <h2 className="section-title">Séries similaires</h2>
            <SeriesGrid series={similar} adultAllowed={gateOk} />
          </section>
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

/** Ligne de description de l'onglet « Infos ». */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 last:border-b-0">
      <dt className="w-36 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-fg">{children}</dd>
    </div>
  );
}
