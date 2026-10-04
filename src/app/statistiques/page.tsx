import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, CalendarCheck, Clock3, FileText, Layers, Lock, Unlock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { computeStats, libraryWithSeries, listHistory } from "@/lib/data/library";
import { getSeriesById } from "@/lib/data/series";
import { getProfile } from "@/lib/data/users";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, EmptyState } from "@/components/ui/kit";
import type { Series } from "@/lib/types";

export const metadata: Metadata = {
  title: "Statistiques de lecture",
  robots: { index: false, follow: false },
};

function duree(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} h ${m} min` : `${h} h`;
}

/** 30 derniers jours, complétés par les journées sans lecture. */
function derniersJours(par_jour: Array<{ date: string; pages: number; chapitres: number }>) {
  return Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    const found = par_jour.find((d) => d.date === date);
    return { date, pages: found?.pages ?? 0, chapitres: found?.chapitres ?? 0 };
  });
}

export default async function StatistiquesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/statistiques");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const [stats, profile, library, history] = await Promise.all([
    computeStats(user.id),
    getProfile(user.id),
    libraryWithSeries(user.id),
    listHistory(user.id, 1000),
  ]);
  const publiques = profile?.confidentialite?.statsPubliques ?? true;

  // 30 derniers jours (données de `par_jour`, complétées par les jours sans lecture)
  const jours = derniersJours(stats.par_jour);
  const maxPages = Math.max(1, ...jours.map((j) => j.pages));

  // Genres et série la plus lue, reconstitués à partir des fiches séries
  const ids = new Set<string>([
    ...library.map((row) => row.series_id),
    ...history.map((h) => h.series_id),
    ...(stats.serie_preferee ? [stats.serie_preferee] : []),
  ]);
  const seriesList = (await Promise.all([...ids].map((id) => getSeriesById(id)))).filter(
    (s): s is Series => s !== null,
  );
  const genres = new Map<string, number>();
  for (const serie of seriesList) {
    for (const genre of serie.genres) genres.set(genre, (genres.get(genre) ?? 0) + 1);
  }
  const topGenres = [...genres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxGenre = topGenres[0]?.[1] ?? 1;
  const seriePreferee = stats.serie_preferee ? await getSeriesById(stats.serie_preferee) : null;

  const cartes = [
    { label: "Chapitres lus", value: String(stats.chapitres_lus), icon: BookOpen },
    { label: "Pages lues", value: String(stats.pages_lues), icon: FileText },
    { label: "Temps de lecture estimé", value: duree(stats.minutes_estimes), icon: Clock3 },
    {
      label: "Séries terminées / suivies",
      value: `${stats.series_terminees} / ${stats.series_suivies}`,
      icon: Layers,
    },
    { label: "Jours consécutifs de lecture", value: String(stats.jours_consecutifs), icon: CalendarCheck },
  ];

  return (
    <div className="container-site space-y-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Statistiques</h1>
          <p className="text-sm text-muted">Vos chiffres de lecture personnels (§7.4).</p>
        </div>
        <Badge tone={publiques ? "ok" : "neutral"}>
          {publiques ? (
            <>
              <Unlock className="size-3" /> Publiques
            </>
          ) : (
            <>
              <Lock className="size-3" /> Privées
            </>
          )}
        </Badge>
      </header>

      {!publiques && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Ces statistiques ne sont visibles que par vous : elles n&apos;apparaissent pas sur votre{" "}
          <Link href="/compte" className="link-muted underline">
            profil public
          </Link>{" "}
          (réglage « Statistiques publiques »).
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cartes.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-4">
            <dt className="flex items-center gap-2 text-xs text-muted">
              <Icon className="size-3.5" />
              {label}
            </dt>
            <dd className="mt-1 text-2xl font-black tracking-tight text-fg">{value}</dd>
          </div>
        ))}
      </dl>

      {stats.chapitres_lus === 0 ? (
        <EmptyState
          title="Pas encore de lecture à analyser"
          description="Lisez quelques chapitres : vous verrez ici votre rythme, vos genres favoris et vos séries terminées."
          action={
            <Link href="/catalogue" className="btn-primary">
              Parcourir le catalogue
            </Link>
          }
        />
      ) : (
        <section className="card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">30 derniers jours</h2>
            <p className="text-xs text-muted">pages lues par jour</p>
          </div>

          <svg
            viewBox="0 0 600 170"
            className="mt-4 w-full"
            role="img"
            aria-label={`Pages lues sur les 30 derniers jours, maximum ${maxPages} pages par jour`}
          >
            <line x1="0" y1="130.5" x2="600" y2="130.5" stroke="var(--line)" strokeWidth="1" />
            {jours.map((jour, i) => {
              const width = 600 / 30;
              const height = (jour.pages / maxPages) * 118;
              const x = i * width + 2;
              const y = 130 - height;
              return (
                <g key={jour.date}>
                  <rect
                    x={x}
                    y={y}
                    width={width - 4}
                    height={Math.max(jour.pages > 0 ? 2 : 0, height)}
                    rx="2"
                    fill={jour.pages > 0 ? "var(--primary)" : "var(--surface2)"}
                  >
                    <title>{`${jour.date} : ${jour.pages} page(s), ${jour.chapitres} chapitre(s)`}</title>
                  </rect>
                  {(i === 0 || i === 14 || i === 29) && (
                    <text
                      x={x + (width - 4) / 2}
                      y={148}
                      textAnchor="middle"
                      fontSize="10"
                      fill="var(--muted)"
                    >
                      {jour.date.slice(8, 10)}/{jour.date.slice(5, 7)}
                    </text>
                  )}
                </g>
              );
            })}
            <text x="0" y="165" fontSize="10" fill="var(--muted)">
              Maximum : {maxPages} page(s) / jour
            </text>
          </svg>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-6">
          <h2 className="section-title">Genres préférés</h2>
          {topGenres.length === 0 ? (
            <p className="text-sm text-muted">
              Ajoutez des séries à votre bibliothèque pour faire apparaître vos genres favoris.
            </p>
          ) : (
            <ul className="space-y-3">
              {topGenres.map(([genre, total]) => (
                <li key={genre}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-fg">{genre}</span>
                    <span className="text-xs text-muted">{total}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.round((total / maxGenre) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="section-title">Série la plus lue</h2>
          {seriePreferee ? (
            <Link href={`/serie/${seriePreferee.slug}`} className="flex items-center gap-4 hover:text-primary">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={seriePreferee.couverture}
                alt={`Couverture de ${seriePreferee.titre}`}
                width={64}
                height={96}
                loading="lazy"
                className="h-24 w-16 rounded-lg object-cover"
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-fg">{seriePreferee.titre}</span>
                <span className="block text-xs text-muted">
                  {stats.chapitres_lus} chapitre{stats.chapitres_lus > 1 ? "s" : ""} lus au total ·{" "}
                  {seriePreferee.genres.slice(0, 3).join(", ") || "sans genre"}
                </span>
              </span>
            </Link>
          ) : (
            <p className="text-sm text-muted">Aucune donnée pour le moment.</p>
          )}
        </section>
      </div>
    </div>
  );
}
