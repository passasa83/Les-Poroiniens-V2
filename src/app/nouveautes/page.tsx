import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { adultGateAccepted, getCurrentUser } from "@/lib/auth";
import { latestPublishedChapter, listUpdates, type ReleaseItem } from "@/lib/data/chapters";
import { listHistory, listLibrary } from "@/lib/data/library";
import { getSettings } from "@/lib/data/moderation";
import { getSeriesBySlug, popularSeries } from "@/lib/data/series";
import { EmptyState } from "@/components/ui/kit";
import { UpdateCard, type UpdateCardData } from "@/components/updates/update-card";
import { UpdateHeroCard, type UpdateHeroData } from "@/components/updates/update-hero";
import { UpdatesSidebar } from "@/components/updates/updates-sidebar";
import { SERIES_TYPE_LABELS, type SeriesType } from "@/lib/types";
import { bucketByDay, dayLabel, isWithin24h } from "@/lib/updates";

export const metadata: Metadata = {
  title: "Nouveautés",
  description:
    "Les derniers chapitres publiés sur Les Poroiniens : les 24 dernières heures, puis les sept jours écoulés, en manga, manhwa et manhua.",
};

const TYPES = ["manga", "manhwa", "manhua"] as const;

const Schema = z.object({
  type: z.enum(TYPES).optional().catch(undefined),
  suivies: z.string().catch("").optional(),
});
type Search = Record<string, string | string[] | undefined>;

function pick(sp: Search, key: string): string | undefined {
  const raw = sp[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const clean = value?.trim();
  return clean ? clean : undefined;
}

/** Onglets : un seul filtre actif à la fois (type XOR séries suivies). */
function tabHref(type: string, suivies: boolean): string {
  if (type) return `/nouveautes?type=${type}`;
  if (suivies) return "/nouveautes?suivies=1";
  return "/nouveautes";
}

/**
 * §6.2 « Nouveautés » : carte héros (sélection du Gérant, sinon le dernier
 * chapitre publié), grille des dernières 24 heures avec étiquette rouge, puis
 * les jours précédents jusqu'à sept jours, colonne latérale Communauté /
 * Les plus lus, et fond flouté emprunté au visuel du héros.
 */
export default async function NouveautesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const parsed = Schema.safeParse({ type: pick(sp, "type"), suivies: pick(sp, "suivies") });
  const type: SeriesType | "" = (parsed.success ? parsed.data.type : undefined) ?? "";
  const suiviesDemande = Boolean(parsed.success && parsed.data.suivies === "1");

  const [user, adult, settings] = await Promise.all([
    getCurrentUser(),
    adultGateAccepted(),
    getSettings().catch(() => ({}) as Record<string, string>),
  ]);
  const suivies = suiviesDemande && Boolean(user);

  const [items, library, history, popular] = await Promise.all([
    listUpdates({ days: 7, type, includeAdult: adult }),
    user ? listLibrary(user.id) : Promise.resolve([]),
    user ? listHistory(user.id, 200) : Promise.resolve([]),
    popularSeries(10, adult),
  ]);

  const followedIds = new Set(library.map((entry) => entry.series_id));
  const readIds = new Set(history.map((entry) => entry.chapter_id));
  const updates = suivies ? items.filter((u) => followedIds.has(u.series.id)) : items;

  /* ── Découpage par jour (0 = dernières 24 h, 7 = il y a sept jours) ────── */
  const { buckets, ages } = bucketByDay(updates);

  /* ── Carte héros : série choisie par le Gérant, sinon le dernier chapitre ─ */
  let hero: UpdateHeroData | null = null;
  if (!type && !suivies && ages.length > 0) {
    const slug = settings.nouveautes_serie?.trim();
    let series = slug ? await getSeriesBySlug(slug) : null;
    if (series && !adult && series.classification === "adult") series = null;

    let chapter = series ? await latestPublishedChapter(series.id) : null;
    if (!series || !chapter) {
      const latest = buckets.get(ages[0])?.[0];
      series = latest ? latest.series : null;
      chapter = latest ?? null;
    }

    if (series && chapter) {
      const fresh = isWithin24h(chapter.publish_at);
      hero = {
        slug: series.slug,
        titre: series.titre,
        auteur: series.auteurs.join(", "),
        visuel:
          series.banniere || series.couverture || `/api/img/cover/${series.slug}`,
        label: fresh ? "Dernières 24 h" : "À la une",
        numero: chapter.numero,
        vues: chapter.vues,
        isAdult: series.classification === "adult",
        fresh,
      };
    }
  }

  const toCard = (item: ReleaseItem): UpdateCardData => ({
    slug: item.series.slug,
    titre: item.series.titre,
    couverture: item.series.couverture || `/api/img/cover/${item.series.slug}`,
    type: item.series.type,
    isAdult: item.series.classification === "adult",
    numero: item.numero,
    vues: item.vues,
    lu: readIds.has(item.id),
  });

  const sidebarSettings: Record<string, string> = {
    announcement: settings.announcement ?? "",
    social_discord: settings.social_discord ?? "",
    social_x: settings.social_x ?? "",
    social_youtube: settings.social_youtube ?? "",
  };

  const tabs = [
    { active: !type && !suivies, href: tabHref("", false), label: "Tout" },
    ...TYPES.map((t) => ({
      active: type === t && !suivies,
      href: tabHref(t, false),
      label: SERIES_TYPE_LABELS[t],
    })),
    ...(user ? [{ active: suivies, href: tabHref("", true), label: "Mes séries suivies" }] : []),
  ];

  return (
    <div className="relative isolate container-site py-6">
      {/* Fond : couverture du héros floutée et assombrie en haut de page (§6.2) */}
      {hero && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-80 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={hero.visuel}
            alt=""
            width={1600}
            height={900}
            loading="lazy"
            decoding="async"
            className="h-full w-full scale-110 object-cover object-top opacity-25 blur-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" />
        </div>
      )}

      <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">Nouveautés</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        Ce qui vient de sortir : les dernières 24 heures en premier, puis les jours
        précédents jusqu&apos;à sept jours.
      </p>

      {!adult && (
        <div className="mt-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Le contenu +18 est masqué.{" "}
          <Link href="/catalogue?adult=1" className="font-semibold text-primary underline">
            Afficher le catalogue adulte
          </Link>
        </div>
      )}

      <nav className="mt-5 flex flex-wrap gap-2" aria-label="Filtrer les nouveautés">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={tab.active ? "page" : undefined}
            className={tab.active ? "chip chip-active" : "chip"}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-8">
          {updates.length === 0 ? (
            <EmptyState
              title={
                suivies
                  ? "Aucune de vos séries n'est sortie cette semaine"
                  : "Aucune sortie ces sept derniers jours"
              }
              description="Revenez après la prochaine publication, ou élargissez la recherche."
              action={
                <Link href="/catalogue" className="btn-primary">
                  Parcourir le catalogue
                </Link>
              }
            />
          ) : (
            <>
              {hero && <UpdateHeroCard hero={hero} />}

              {ages.map((age) => (
                <section key={age} aria-labelledby={`jour-${age}`}>
                  <h2 id={`jour-${age}`} className="section-title">
                    {dayLabel(age)}
                  </h2>
                  <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {(buckets.get(age) ?? []).map((item) => (
                      <UpdateCard key={item.id} item={toCard(item)} fresh={age === 0} />
                    ))}
                  </ul>
                </section>
              ))}
            </>
          )}
        </div>

        <UpdatesSidebar
          settings={sidebarSettings}
          popular={popular}
          adultAllowed={adult}
        />
      </div>
    </div>
  );
}
