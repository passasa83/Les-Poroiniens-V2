import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { adultGateAccepted, getCurrentUser } from "@/lib/auth";
import { getDb, TABLES } from "@/lib/db";
import { recentChapters } from "@/lib/data/chapters";
import {
  activeRecommendations,
  getSeriesById,
  popularSeries,
} from "@/lib/data/series";
import { listHistory } from "@/lib/data/library";
import { getSettings } from "@/lib/data/moderation";
import { dataMode } from "@/lib/db";
import { SeriesGrid } from "@/components/series/series-card";
import { Badge, EmptyState } from "@/components/ui/kit";
import type { Chapter, Series } from "@/lib/types";

export default async function HomePage() {
  const [user, adult, chapters, recos, settings] = await Promise.all([
    getCurrentUser(),
    adultGateAccepted(),
    recentChapters(10),
    activeRecommendations("home"),
    getSettings().catch(() => ({}) as Record<string, string>),
  ]);
  const popular = await popularSeries(12, adult);

  const recoSeries: Series[] = [];
  for (const rec of recos) {
    const s = await getSeriesById(rec.series_id);
    if (s && (adult || s.classification !== "adult")) {
      recoSeries.push({ ...s, noteMoy: s.noteMoy });
    }
  }

  const continueReading = user ? await continueBlock(user.id) : null;
  const announcement = settings.announcement?.trim();

  return (
    <div className="container-site space-y-12 py-8">
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

      {continueReading}

      {/* Dernières sorties */}
      <section>
        <SectionHeader title="Dernières sorties" href="/catalogue?sort=maj" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {chapters.map((ch) => (
            <ChapterRow key={ch.id} chapter={ch} adultAllowed={adult} />
          ))}
        </div>
      </section>

      {/* Recommandations */}
      {recoSeries.length > 0 && (
        <section>
          <SectionHeader title="Recommandations de la rédaction" href="/catalogue" icon={<Sparkles className="size-4" />} />
          <div className="mt-4">
            <SeriesGrid series={recoSeries} adultAllowed={adult} />
          </div>
        </section>
      )}

      {/* Populaires */}
      <section>
        <SectionHeader title="Séries populaires" href="/catalogue?sort=popularite" icon={<TrendingUp className="size-4" />} />
        <div className="mt-4">
          <SeriesGrid series={popular} adultAllowed={adult} />
        </div>
      </section>

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

function ChapterRow({ chapter, adultAllowed }: { chapter: Chapter & { series: Series }; adultAllowed: boolean }) {
  const hidden = chapter.classification === "adult" && !adultAllowed;
  if (hidden) return null;
  return (
    <Link
      href={`/serie/${chapter.series.slug}/chapitre-${chapter.numero}`}
      className="card group flex items-center gap-3 p-3 transition-colors hover:border-primary"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={chapter.series.couverture}
        alt=""
        width={64}
        height={96}
        loading="lazy"
        className="size-16 rounded-lg object-cover"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold group-hover:text-primary">
          {chapter.series.titre}
        </p>
        <p className="text-xs text-muted">
          Chapitre {chapter.numero} · {relative(chapter.publish_at ?? "")}
        </p>
        {chapter.classification === "adult" && (
          <span className="mt-1 inline-block">
            <Badge tone="adult">+18</Badge>
          </span>
        )}
      </div>
    </Link>
  );
}

async function continueBlock(userId: string) {
  const history = await listHistory(userId, 1);
  if (history.length === 0) return null;
  const entry = history[0];
  const series = await getDb().get<Series>(TABLES.series, entry.series_id);
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

function relative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 30) return `il y a ${days} jours`;
  return `il y a ${Math.floor(days / 30)} mois`;
}
