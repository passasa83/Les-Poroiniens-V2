import Link from "next/link";
import { ArrowRight, Play, Sparkles, TrendingUp } from "lucide-react";
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
import { dateAnnonce, dateIsoAnnonce, derniereAnnonce } from "@/lib/data/annonces";
import { listHistory, listLibrary } from "@/lib/data/library";
import { getSettings } from "@/lib/data/moderation";
import { dataMode } from "@/lib/db";
import { SeriesGrid } from "@/components/series/series-card";
import { Badge, EmptyState } from "@/components/ui/kit";
import { Hero, type HeroSlide } from "@/components/home/hero";
import { ReleasesSection } from "@/components/home/releases-section";
import { RankList } from "@/components/home/rank-list";
import { plainText } from "@/lib/format";
import type { ReleaseItem } from "@/lib/data/chapters";
import type { ReleaseDto } from "@/lib/dto";
import { SERIES_TYPE_LABELS, type Annonce, type Chapter, type Series } from "@/lib/types";

/** Sections facultatives : masquées quand elles n'ont rien à montrer (§3.5). */
export default async function HomePage() {
  const [user, adult, recos, settings, annonce] = await Promise.all([
    getCurrentUser(),
    adultGateAccepted(),
    activeRecommendations("home"),
    getSettings().catch(() => ({}) as Record<string, string>),
    derniereAnnonce().catch(() => null),
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

      {/* Dernière annonce de l'équipe (§6.11) : carte, ou bandeau si le
          Gérant a basculé le réglage « bandeau » (annonce_bandeau). */}
      {annonce && <AnnonceALaUne annonce={annonce} bandeau={settings.annonce_bandeau === "1"} />}

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
      <Link href={href} className="link-muted inline-flex min-h-11 items-center text-sm">
        Tout voir →
      </Link>
    </div>
  );
}

/**
 * Dernière annonce mise en avant sur l'accueil (§6.11). Le Gérant choisit la
 * présentation : carte détaillée par défaut, bandeau compact quand la clé
 * `annonce_bandeau` vaut « 1 ». Le bloc n'apparaît que si une annonce existe.
 */
function AnnonceALaUne({ annonce, bandeau }: { annonce: Annonce; bandeau: boolean }) {
  const href = `/annonces/${annonce.slug}`;
  const date = dateAnnonce(annonce.date);
  const iso = dateIsoAnnonce(annonce.date);

  if (bandeau) {
    return (
      <section
        aria-label="Annonce à la une"
        className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-2"
      >
        <Badge tone="primary">Annonce</Badge>
        <time dateTime={iso} className="meta">
          {date}
        </time>
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary underline underline-offset-4 hover:text-fg"
        >
          {annonce.titre}
          <ArrowRight className="size-4" aria-hidden />
          <span className="sr-only">— lire l&apos;annonce du {date}</span>
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Annonce à la une" className="card space-y-2 p-4 sm:p-5">
      <p className="meta flex flex-wrap items-center gap-x-3 gap-y-1">
        <Badge tone="primary">Annonce</Badge>
        <time dateTime={iso} className="font-semibold text-fg">
          {date}
        </time>
        {annonce.auteur && <span>Par {annonce.auteur}</span>}
      </p>
      <h2 className="text-lg font-bold tracking-tight text-fg">
        <Link href={href} className="hover:text-primary">
          {annonce.titre}
        </Link>
      </h2>
      {annonce.extrait && <p className="text-sm text-muted">{annonce.extrait}</p>}
      <Link href={href} className="btn-secondary mt-1">
        Lire l&apos;annonce
        <ArrowRight className="size-4" aria-hidden />
        <span className="sr-only"> du {date}</span>
      </Link>
    </section>
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
      {/* §12.6 : la carte (couverture, titre) mène à la fiche série ; la reprise
          de lecture reste un bouton explicite, distinct du clic carte. */}
      <div className="card mt-4 flex flex-wrap items-center gap-4 p-4">
        <Link
          href={`/serie/${series.slug}`}
          className="shrink-0"
          aria-label={`Voir la fiche de ${series.titre}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={series.couverture}
            alt=""
            width={80}
            height={120}
            className="h-28 w-[74px] rounded-lg object-cover"
          />
        </Link>
        <div className="min-w-0 flex-1 space-y-1">
          <Link
            href={`/serie/${series.slug}`}
            className="font-semibold text-fg hover:text-primary"
          >
            {series.titre}
          </Link>
          <p className="text-sm text-muted">
            Chapitre {chapter.numero} — page {Math.max(entry.page, 1)}/{chapter.nb_pages}
          </p>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface2"
            role="progressbar"
            aria-label={`Progression de lecture — ${series.titre}, chapitre ${chapter.numero}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(
              100,
              Math.round((Math.max(entry.page, 1) / Math.max(chapter.nb_pages, 1)) * 100),
            )}
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.min(100, Math.round((Math.max(entry.page, 1) / Math.max(chapter.nb_pages, 1)) * 100))}%`,
              }}
            />
          </div>
        </div>
        <Link
          href={`/serie/${series.slug}/chapitre-${chapter.numero}`}
          className="btn-primary w-full shrink-0 justify-center sm:w-auto"
          aria-label={`Reprendre la lecture de ${series.titre} — chapitre ${chapter.numero}, page ${Math.max(entry.page, 1)}`}
        >
          <Play className="size-4" aria-hidden />
          Reprendre
        </Link>
      </div>
    </section>
  );
}
