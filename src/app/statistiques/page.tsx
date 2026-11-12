import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, CalendarCheck, Clock3, FileText, Layers, Lock, Unlock } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { readingProfile } from "@/lib/data/stats";
import { getProfile } from "@/lib/data/users";
import { duree } from "@/lib/format";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, EmptyState } from "@/components/ui/kit";
import { Graphique } from "./_components/graphique";
import { Gouts } from "./_components/gouts";
import { RegulariteSection } from "./_components/regularite";
import {
  computeRegularite,
  PERIODES,
  pointsJours,
  pointsMois,
  type Periode,
} from "./_lib/periodes";

export const metadata: Metadata = {
  title: "Statistiques de lecture",
  robots: { index: false, follow: false },
};

export default async function StatistiquesPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion?next=/statistiques");
  if (!atLeast(user.role, "membre")) return <AccessDenied required="membre" />;

  const { periode: periodeDemandee } = await searchParams;
  const periode: Periode = PERIODES.some((p) => p.cle === periodeDemandee)
    ? (periodeDemandee as Periode)
    : "mois";
  const courante = PERIODES.find((p) => p.cle === periode) ?? PERIODES[1];

  const [profil, profile] = await Promise.all([readingProfile(user.id), getProfile(user.id)]);
  const { stats } = profil;
  const publiques = profile?.confidentialite?.statsPubliques ?? true;

  // Série du graphique choisi (semaine / mois / année)
  const points =
    periode === "annee"
      ? pointsMois(stats.par_jour)
      : pointsJours(stats.par_jour, periode === "semaine" ? 7 : 30);
  const regularite = computeRegularite(stats.par_jour);

  const cartes = [
    { label: "Chapitres lus", value: String(stats.chapitres_lus), icon: BookOpen },
    { label: "Pages lues", value: String(stats.pages_lues), icon: FileText },
    { label: "Temps de lecture estimé", value: duree(stats.minutes_estimes), icon: Clock3 },
    {
      label: "Séries terminées / suivies",
      value: `${stats.series_terminees} / ${stats.series_suivies}`,
      icon: Layers,
    },
    {
      label: "Jours consécutifs de lecture",
      value: String(stats.jours_consecutifs),
      icon: CalendarCheck,
    },
  ];

  return (
    <div className="container-site space-y-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Statistiques</h1>
          <p className="text-sm text-muted">Vos chiffres de lecture personnels.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={publiques ? "ok" : "neutral"}>
            {publiques ? (
              <>
                <Unlock className="size-3" aria-hidden /> Publiques
              </>
            ) : (
              <>
                <Lock className="size-3" aria-hidden /> Privées
              </>
            )}
          </Badge>
          <Link href="/compte?section=confidentialite" className="btn-secondary text-sm">
            Régler la confidentialité
          </Link>
        </div>
      </header>

      {!publiques && (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Ces statistiques ne sont visibles que par vous : elles n&apos;apparaissent pas sur votre{" "}
          <Link href="/compte?section=confidentialite" className="link-muted underline">
            profil public
          </Link>{" "}
          (réglage « Statistiques publiques »).
        </p>
      )}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {cartes.map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-4">
            <dt className="flex items-center gap-2 text-xs text-muted">
              <Icon className="size-3.5" aria-hidden />
              {label}
            </dt>
            <dd className="mt-1 text-2xl font-black tracking-tight text-fg">{value}</dd>
          </div>
        ))}
      </dl>

      {stats.chapitres_lus === 0 ? (
        <EmptyState
          title="Pas encore de lecture à analyser"
          description="Lisez quelques chapitres : vous verrez ici votre rythme, votre régularité, vos genres favoris et vos séries terminées."
          action={
            <Link href="/catalogue" className="btn-primary">
              Parcourir le catalogue
            </Link>
          }
        />
      ) : (
        <>
          {/* Onglets de période : de vrais liens, utilisables sans JavaScript. */}
          <nav aria-label="Période des graphiques" className="flex flex-wrap gap-2">
            {PERIODES.map((item) => (
              <Link
                key={item.cle}
                href={`/statistiques?periode=${item.cle}`}
                aria-current={item.cle === periode ? "page" : undefined}
                className={item.cle === periode ? "chip chip-active" : "chip"}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Graphique points={points} periode={periode} detail={courante.detail} />

          <RegulariteSection regularite={regularite} joursConsecutifs={stats.jours_consecutifs} />
        </>
      )}

      {/* Genres et série la plus lue : affichés même sans lecture (état vide inclus). */}
      <Gouts genres={profil.genres.slice(0, 6)} seriePreferee={profil.seriePreferee} />

      <p className="text-xs text-muted">
        Les graphiques sont dessinés côté serveur : ils restent lisibles sans JavaScript, et les
        animations sont désactivées si votre système demande un mouvement réduit.
        <Link href="/historique" className="link-muted underline">
          {" "}
          Voir mon historique de lecture
        </Link>
        .
      </p>
    </div>
  );
}
