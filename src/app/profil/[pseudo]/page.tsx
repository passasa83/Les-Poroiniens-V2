import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CalendarDays, ChartColumn, Clock3, FileText, Layers, Lock, Settings } from "lucide-react";
import { adultGateAccepted, getCurrentUser } from "@/lib/auth";
import { computeStats, libraryWithSeries } from "@/lib/data/library";
import { getProfileByPseudo } from "@/lib/data/users";
import { duree } from "@/lib/format";
import { atLeast, ROLE_LABELS } from "@/lib/roles";
import { Badge, EmptyState } from "@/components/ui/kit";
import { SeriesGrid } from "@/components/series/series-card";
import type { Series } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ pseudo: string }>;
}): Promise<Metadata> {
  const { pseudo } = await params;
  const profile = await getProfileByPseudo(pseudo);
  if (!profile) return { title: "Profil introuvable" };
  return {
    title: `${profile.pseudo} — profil`,
    description: profile.bio ? profile.bio.slice(0, 160) : `Profil public de ${profile.pseudo}.`,
  };
}

export default async function ProfilPage({ params }: { params: Promise<{ pseudo: string }> }) {
  const { pseudo } = await params;
  const profile = await getProfileByPseudo(pseudo);
  if (!profile) notFound();

  const [viewer, adult] = await Promise.all([getCurrentUser(), adultGateAccepted()]);
  const estMoi = Boolean(viewer && viewer.id === profile.user_id);

  const biblioPublique = profile.confidentialite?.bibliothequePublique ?? true;
  const statsPubliques = profile.confidentialite?.statsPubliques ?? true;

  const [library, stats] = await Promise.all([
    biblioPublique ? libraryWithSeries(profile.user_id) : Promise.resolve(null),
    statsPubliques ? computeStats(profile.user_id) : Promise.resolve(null),
  ]);

  const series = (library ?? [])
    .map((row) => row.series)
    .filter((s): s is Series => s !== null);

  return (
    <div className="container-site space-y-8 py-8">
      <header className="card flex flex-wrap items-center gap-5 p-6">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-surface2 text-xl font-black text-primary">
          {profile.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.avatar}
              alt={`Avatar de ${profile.pseudo}`}
              width={80}
              height={80}
              className="size-20 object-cover"
            />
          ) : (
            profile.pseudo.slice(0, 2).toUpperCase()
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-fg">{profile.pseudo}</h1>
            {atLeast(profile.role, "modo") && <Badge tone="primary">{ROLE_LABELS[profile.role]}</Badge>}
            {estMoi && <Badge tone="neutral">Vous</Badge>}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              Inscrit le{" "}
              {new Date(profile.date_inscription).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
          </p>
          {profile.bio ? (
            <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-fg">{profile.bio}</p>
          ) : (
            <p className="mt-2 text-sm text-muted">Aucune biographie pour l’instant.</p>
          )}
        </div>

        {estMoi && (
          <div className="flex flex-wrap gap-2">
            <Link href="/statistiques" className="btn-secondary text-sm">
              <ChartColumn className="size-4" aria-hidden />
              Mes statistiques
            </Link>
            <Link href="/compte" className="btn-secondary text-sm">
              <Settings className="size-4" aria-hidden />
              Modifier mon profil
            </Link>
          </div>
        )}
      </header>

      {/* Bibliothèque */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Bibliothèque</h2>
          {biblioPublique && series.length > 0 && (
            <span className="text-xs text-muted">{series.length} série(s)</span>
          )}
        </div>

        {!biblioPublique ? (
          <p className="card flex items-center gap-3 p-4 text-sm text-muted">
            <Lock className="size-4 shrink-0" />
            {profile.pseudo} a choisi de rendre sa bibliothèque privée.
          </p>
        ) : series.length === 0 ? (
          <EmptyState
            title="Bibliothèque vide"
            description={
              estMoi
                ? "Vous n’avez encore ajouté aucune série. Le catalogue vous attend."
                : `${profile.pseudo} n’a encore ajouté aucune série à sa bibliothèque.`
            }
            action={
              estMoi ? (
                <Link href="/catalogue" className="btn-primary">
                  Parcourir le catalogue
                </Link>
              ) : undefined
            }
          />
        ) : (
          <SeriesGrid series={series} adultAllowed={adult} />
        )}
      </section>

      {/* Statistiques */}
      <section className="space-y-4">
        <h2 className="section-title">Statistiques de lecture</h2>

        {!statsPubliques ? (
          <p className="card flex items-center gap-3 p-4 text-sm text-muted">
            <Lock className="size-4 shrink-0" />
            {profile.pseudo} a choisi de rendre ses statistiques privées.
          </p>
        ) : stats ? (
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <StatCard icon={<BookOpen className="size-3.5" />} label="Chapitres lus" value={stats.chapitres_lus} />
            <StatCard icon={<FileText className="size-3.5" />} label="Pages lues" value={stats.pages_lues} />
            <StatCard icon={<Clock3 className="size-3.5" />} label="Temps de lecture estimé" value={duree(stats.minutes_estimes)} />
            <StatCard icon={<Layers className="size-3.5" />} label="Séries terminées" value={stats.series_terminees} />
            <StatCard
              icon={<CalendarDays className="size-3.5" />}
              label="Jours consécutifs"
              value={stats.jours_consecutifs}
            />
          </dl>
        ) : null}
      </section>

      {estMoi && statsPubliques && (
        <p className="text-xs text-muted">
          Ces chiffres sont visibles par tous. Vous pouvez les rendre privés depuis{" "}
          <Link href="/compte" className="link-muted underline">
            Confidentialité
          </Link>
          .
        </p>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="card p-4">
      <dt className="flex items-center gap-2 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-black tracking-tight text-fg">{value}</dd>
    </div>
  );
}
