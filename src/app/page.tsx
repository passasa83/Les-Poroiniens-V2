import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { adultGateAccepted, getCurrentUser } from "@/lib/auth";
import { getDb, TABLES } from "@/lib/db";
import { firstChapterNumbers, listRecentReleases } from "@/lib/data/chapters";
import {
  activeRecommendations,
  getSeriesById,
  listSeries,
  popularSeries,
  similarSeries,
} from "@/lib/data/series";
import { listHistory, listLibrary } from "@/lib/data/library";
import { getSettings } from "@/lib/data/moderation";
import { dataMode } from "@/lib/db";
import { SeriesGrid } from "@/components/series/series-card";
import { EmptyState } from "@/components/ui/kit";
import { Hero, type HeroSlide } from "@/components/home/hero";
import { ReleasesSection } from "@/components/home/releases-section";
import { RankList } from "@/components/home/rank-list";
import { plainText } from "@/lib/format";
import type { ReleaseItem } from "@/lib/data/chapters";
import type { ReleaseDto } from "@/lib/dto";
import { SERIES_TYPE_LABELS, type Chapter, type Series } from "@/lib/types";

/** Sections facultatives : masquées quand elles n'ont rien à montrer (§3.5). */
export default async function HomePage() {
  const [user, adult, recos, settings] = await Promise.all([
    getCurrentUser(),
    adultGateAccepted(),
    activeRecommendations("home"),
    getSettings().catch(() => ({}) as Record<string, string>),
  ]);

  const [popular, releases, nouveautes, library] = await Promise.all([
    popularSeries(10, adult),
    listRecentReleases({ perPage: 12, includeAdult: adult }),
    listSeries({ sort: "nouveautes", perPage: 6, includeAdult: adult }),
    user ? listLibrary(user.id) : Promise.resolve([]),
  ]);

  /* ── Héros « À la une » (§6.1) : sélection de la rédaction, sinon les plus lues ── */
  const editorial: Series[] = [];
  for (const rec of recos.slice(0, 12)) {
    const s = await getSeriesById(rec.series_id);
    if (s && (adult || s.classification !== "adult")) editorial.push(s);
  }

  const heroPool = editorial.length > 0 ? editorial : popular;
  const heroSeries = heroPool.slice(0, 5);
  const heroIds = new Set(heroSeries.map((s) => s.id));
  const firstChapters = await firstChapterNumbers(heroSeries.map((s) => s.id));
  const followedIds = new Set(library.map((entry) => entry.series_id));

  const slides: HeroSlide[] = heroSeries.map((s) => ({
    id: s.id,
    slug: s.slug,
    titre: s.titre,
    cover: s.couverture || `/api/img/cover/${s.slug}`,
    typeLabel: SERIES_TYPE_LABELS[s.type],
    genres: s.genres.slice(0, 3),
    synopsis: plainText(s.synopsis),
    chapitre: firstChapters.get(s.id) ?? null,
    isAdult: s.classification === "adult",
    followed: followedIds.has(s.id),
  }));

  /* ── « Ajouts récents » et recommandations (§6.1) ─────────────────────── */
  let recoSeries: Series[] = [];
  let recoForVisitor = true;
  if (user) {
    const history = await listHistory(user.id, 1);
    const lastRead = history[0] ? await getSeriesById(history[0].series_id) : null;
    if (lastRead) {
      recoForVisitor = false;
      recoSeries = await similarSeries(lastRead, 6);
    }
  }
  if (recoSeries.length === 0) {
    recoForVisitor = true;
    recoSeries = editorial;
  }
  recoSeries = recoSeries
    .filter((s) => !heroIds.has(s.id) && (adult || s.classification !== "adult"))
    .slice(0, 6);

  const continueReading = user ? await continueBlock(user.id) : null;
  const announcement = settings.announcement?.trim();

  return (
    <div className="container-site space-y-12 py-6">
      {/* Le héros et les sections portent des h2 : la page a besoin d'un h1,
          même invisible, pour la hiérarchie des titres et le référencement. */}
      <h1 className="sr-only">
        Les Poroiniens — dernières sorties, nouveautés et classement des scans
      </h1>

      {announcement && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-fg">
          {announcement}
        </div>
      )}

      {!adult && (
        <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Le contenu +18 est masqué.{" "}
          <Link href="/catalogue?adult=1" className="font-semibold text-primary underline">
            Afficher le catalogue adulte
          </Link>
        </div>
      )}

      {dataMode() === "demo" && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn">
          Mode démonstration : Appwrite n&apos;est pas encore configuré (clé API absente).
          Catalogue, comptes et commentaires utilisent un jeu de données local. Renseignez{" "}
          <code className="font-mono">APPWRITE_API_KEY</code> puis lancez{" "}
          <code className="font-mono">npm run appwrite:setup</code> pour basculer sur votre
          instance.
        </div>
      )}

      {/* Héros « À la une » */}
      <Hero slides={slides} authed={Boolean(user)} />

      {/* Continuer la lecture */}
      {continueReading}

      {/* Dernières sorties : onglets + « Charger plus » (§6.1) */}
      {releases.total > 0 && (
        <ReleasesSection
          initialItems={releases.items.map((ch) => toReleaseDto(ch))}
          initialTotal={releases.total}
          adultAllowed={adult}
        />
      )}

      {/* Les plus lues (§6.1) : classement 1 à 10 sur deux colonnes */}
      {popular.length > 0 && (
        <section>
          <SectionHeader
            title="Les plus lues"
            href="/catalogue?sort=popularite"
            icon={<TrendingUp className="size-4" />}
          />
          <div className="mt-4">
            <RankList series={popular} adultAllowed={adult} />
          </div>
        </section>
      )}

      {/* Ajouts récents (§6.1) */}
      {nouveautes.items.length > 0 && (
        <section>
          <SectionHeader
            title="Ajouts récents"
            href="/catalogue?sort=nouveautes"
            icon={<Sparkles className="size-4" />}
          />
          <div className="mt-4">
            <SeriesGrid series={nouveautes.items} adultAllowed={adult} />
          </div>
        </section>
      )}

      {/* Recommandations (§6.1) */}
      {recoSeries.length > 0 && (
        <section>
          <SectionHeader
            title={recoForVisitor ? "Recommandations de la rédaction" : "Recommandations pour vous"}
            href="/catalogue"
            icon={<Sparkles className="size-4" />}
          />
          <div className="mt-4">
            <SeriesGrid series={recoSeries} adultAllowed={adult} />
          </div>
        </section>
      )}

      {!user && (
        <EmptyState
          title="Créez votre compte pour suivre vos séries"
          description="Bibliothèque, historique de lecture, commentaires et statistiques personnelles : tout est gratuit, sans publicité."
          action={
            <Link href="/inscription" className="btn-primary">
              S&apos;inscrire <ArrowRight className="size-4" />
            </Link>
          }
        />
      )}
    </div>
  );
}

function toReleaseDto(ch: ReleaseItem): ReleaseDto {
  return {
    id: ch.id,
    numero: ch.numero,
    publishAt: ch.publish_at,
    classification: ch.classification,
    series: {
      slug: ch.series.slug,
      titre: ch.series.titre,
      couverture: ch.series.couverture || `/api/img/cover/${ch.series.slug}`,
      type: ch.series.type,
      classification: ch.series.classification,
    },
  };
}

function SectionHeader({
  title,
  href,
  icon,
}: {
  title: string;
  href: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="section-title flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <Link href={href} className="link-muted text-sm">
        Tout voir →
      </Link>
    </div>
  );
}

async function continueBlock(userId: string) {
  const history = await listHistory(userId, 1);
  if (history.length === 0) return null;
  const entry = history[0];
  const series = await getSeriesById(entry.series_id);
  const chapters = await getDb().list<Chapter>(TABLES.chapters, {
    filters: [{ field: "id", op: "eq", value: entry.chapter_id }],
    limit: 1,
  });
  const chapter = chapters.items[0];
  if (!series || !chapter) return null;

  return (
    <section>
      <h2 className="section-title">Continuer la lecture</h2>
      <Link
        href={`/serie/${series.slug}/chapitre-${chapter.numero}`}
        className="card mt-4 flex items-center gap-4 p-4 hover:border-primary"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={series.couverture}
          alt=""
          width={80}
          height={120}
          className="h-28 w-[74px] rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{series.titre}</p>
          <p className="text-sm text-muted">
            Chapitre {chapter.numero} — page {Math.max(entry.page, 1)}/{chapter.nb_pages}
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, Math.round((Math.max(entry.page, 1) / Math.max(chapter.nb_pages, 1)) * 100))}%`,
              }}
            />
          </div>
        </div>
        <ArrowRight className="size-5 text-muted" />
      </Link>
    </section>
  );
}
