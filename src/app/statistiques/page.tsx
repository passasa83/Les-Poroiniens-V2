import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  CalendarCheck,
  Clock3,
  FileText,
  Layers,
  Lock,
  Unlock,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { computeStats, libraryWithSeries, listHistory } from "@/lib/data/library";
import { getSeriesById } from "@/lib/data/series";
import { getProfile } from "@/lib/data/users";
import { duree } from "@/lib/format";
import { atLeast } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, EmptyState } from "@/components/ui/kit";
import type { Series } from "@/lib/types";

export const metadata: Metadata = {
  title: "Statistiques de lecture",
  robots: { index: false, follow: false },
};

/* ── Périodes des graphiques (§6.8 : « graphiques semaine / mois / année ») ─ */

type Periode = "semaine" | "mois" | "annee";

const PERIODES: Array<{ cle: Periode; label: string; detail: string }> = [
  { cle: "semaine", label: "Semaine", detail: "7 derniers jours" },
  { cle: "mois", label: "Mois", detail: "30 derniers jours" },
  { cle: "annee", label: "Année", detail: "12 derniers mois" },
];

const MOIS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 4 octobre 2026 » — calculé depuis la chaîne ISO, jamais via le fuseau. */
function dateLongue(cle: string): string {
  const jour = Number(cle.slice(8, 10));
  const mois = MOIS_FR[Number(cle.slice(5, 7)) - 1] ?? "";
  return `${jour} ${mois} ${cle.slice(0, 4)}`;
}

/** « octobre 2026 » pour les agrégats mensuels. */
function moisLong(cle: string): string {
  const mois = MOIS_FR[Number(cle.slice(5, 7)) - 1] ?? "";
  return `${mois} ${cle.slice(0, 4)}`;
}

type Point = {
  /** Clé unique : `AAAA-MM-JJ` (jours) ou `AAAA-MM` (mois). */
  cle: string;
  /** Libellé court sous l'axe : « 05/10 » ou « 10/26 ». */
  libelle: string;
  /** Intitulé complet : survol, tableau de valeurs, lecteur d'écran. */
  intitule: string;
  pages: number;
  chapitres: number;
};

type ParJour = Array<{ date: string; pages: number; chapitres: number }>;

/** `n` jours consécutis se terminant aujourd'hui, trous compris. */
function pointsJours(parJour: ParJour, n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const cle = new Date(Date.now() - (n - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const trouve = parJour.find((d) => d.date === cle);
    return {
      cle,
      libelle: `${cle.slice(8, 10)}/${cle.slice(5, 7)}`,
      intitule: dateLongue(cle),
      pages: trouve?.pages ?? 0,
      chapitres: trouve?.chapitres ?? 0,
    };
  });
}

/** 12 mois consécutifs se terminant sur le mois en cours. */
function pointsMois(parJour: ParJour): Point[] {
  const maintenant = new Date();
  const annee = maintenant.getUTCFullYear();
  const mois = maintenant.getUTCMonth();
  return Array.from({ length: 12 }, (_, i) => {
    const cle = new Date(Date.UTC(annee, mois - (11 - i), 1)).toISOString().slice(0, 7);
    let pages = 0;
    let chapitres = 0;
    for (const jour of parJour) {
      if (jour.date.slice(0, 7) !== cle) continue;
      pages += jour.pages;
      chapitres += jour.chapitres;
    }
    return {
      cle,
      libelle: `${cle.slice(5, 7)}/${cle.slice(2, 4)}`,
      intitule: moisLong(cle),
      pages,
      chapitres,
    };
  });
}

/* ── Formatage ─────────────────────────────────────────────────────────── */

/** Virgule décimale française sans dépendre du fuseau du navigateur. */
function decimal(valeur: number): string {
  return valeur.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

/* ── Régularité (§6.8 « … régularité ») ─────────────────────────────────── */

type Regularite = {
  /** Jours avec au moins une page, sur les 30 derniers jours. */
  joursActifs30: number;
  /** Jours avec au moins une page, sur les 12 derniers mois. */
  joursActifs12Mois: number;
  /** Plus longue série ininterrompue de jours de lecture. */
  meilleureSerie: number;
  derniereLecture: string | null;
  /** 30 derniers jours, pour la grille visuelle (détail en texte à côté). */
  grille: Array<{ date: string; actif: boolean }>;
};

function computeRegularite(parJour: ParJour): Regularite {
  const limite30 = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const limiteAn = new Date(Date.now() - 364 * 86_400_000).toISOString().slice(0, 10);
  const actifs = new Set(parJour.map((j) => j.date));

  let joursActifs30 = 0;
  let joursActifs12Mois = 0;
  for (const date of actifs) {
    if (date >= limite30) joursActifs30 += 1;
    if (date >= limiteAn) joursActifs12Mois += 1;
  }

  // Meilleure série de jours consécutifs : `par_jour` est trié par date.
  let meilleureSerie = 0;
  let courante = 0;
  let precedent: string | null = null;
  for (const jour of parJour) {
    const ecart =
      precedent === null
        ? Number.NaN
        : Date.parse(`${jour.date}T00:00:00Z`) - Date.parse(`${precedent}T00:00:00Z`);
    courante = ecart === 86_400_000 ? courante + 1 : 1;
    if (courante > meilleureSerie) meilleureSerie = courante;
    precedent = jour.date;
  }

  const grille = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    return { date, actif: actifs.has(date) };
  });

  return {
    joursActifs30,
    joursActifs12Mois,
    meilleureSerie,
    derniereLecture: parJour.length > 0 ? parJour[parJour.length - 1].date : null,
    grille,
  };
}

/* ── Graphique (rendu serveur : lisible sans JavaScript) ────────────────── */

function Graphique({
  points,
  periode,
  detail,
}: {
  points: Point[];
  periode: Periode;
  detail: string;
}) {
  const maxPages = Math.max(1, ...points.map((p) => p.pages));
  const totalPages = points.reduce((somme, p) => somme + p.pages, 0);
  const totalChapitres = points.reduce((somme, p) => somme + p.chapitres, 0);
  const moyenne = totalPages / points.length;
  const base = 130;
  const pas = 600 / points.length;
  const largeurBarre = Math.max(4, pas - (points.length > 16 ? 4 : 8));
  const pasLibelle = points.length <= 12 ? 1 : Math.ceil(points.length / 6);

  return (
    <section className="card space-y-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="section-title">Pages lues — {detail}</h2>
        <p className="text-xs text-muted">pages par jour ou par mois</p>
      </div>

      {/* Chiffres clés en toutes lettres : lisibles avant même le graphique. */}
      <p className="text-sm text-fg">
        Total : <strong>{totalPages}</strong> page{totalPages > 1 ? "s" : ""} ·{" "}
        <strong>{totalChapitres}</strong> chapitre{totalChapitres > 1 ? "s" : ""} · moyenne de{" "}
        {decimal(moyenne)} page{moyenne > 1 ? "s" : ""} par{" "}
        {periode === "annee" ? "mois" : "jour"} · maximum {maxPages} page
        {maxPages > 1 ? "s" : ""} sur une même période
      </p>

      <svg
        viewBox="0 0 600 170"
        className="mt-1 w-full"
        role="img"
        aria-label={`Pages lues sur les ${detail} : ${totalPages} pages au total, maximum ${maxPages} pages sur une même période`}
      >
        <line x1="0" y1={base + 0.5} x2="600" y2={base + 0.5} stroke="var(--line)" strokeWidth="1" />
        {points.map((point, i) => {
          const hauteur = (point.pages / maxPages) * 118;
          const x = i * pas + (pas - largeurBarre) / 2;
          const y = base - hauteur;
          const estLibelle =
            i % pasLibelle === 0 || i === points.length - 1 || points.length <= 12;
          return (
            <g key={point.cle}>
              <rect
                className="chart-bar"
                style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }}
                x={x}
                y={y}
                width={largeurBarre}
                height={Math.max(point.pages > 0 ? 2 : 0, hauteur)}
                rx="2"
                fill={point.pages > 0 ? "var(--primary)" : "var(--surface2)"}
              >
                <title>{`${point.intitule} : ${point.pages} page(s), ${point.chapitres} chapitre(s)`}</title>
              </rect>
              {estLibelle && (
                <text
                  x={x + largeurBarre / 2}
                  y={base + 18}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--muted)"
                >
                  {point.libelle}
                </text>
              )}
            </g>
          );
        })}
        <text x="0" y="165" fontSize="10" fill="var(--muted)">
          Maximum : {maxPages} page(s) / {periode === "annee" ? "mois" : "jour"}
        </text>
      </svg>

      {/* Le tableau reste consultable sans JavaScript et pour les lecteurs
          d'écran : chaque valeur du graphique existe aussi en texte. */}
      <details className="rounded-xl border border-line bg-surface2 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-fg">
          Voir les valeurs en tableau
        </summary>
        <table className="mt-3 w-full text-left text-sm">
          <caption className="sr-only">
            Pages et chapitres lus, {detail}
          </caption>
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="py-1 pr-4 font-medium">
                Période
              </th>
              <th scope="col" className="py-1 pr-4 font-medium">
                Pages
              </th>
              <th scope="col" className="py-1 font-medium">
                Chapitres
              </th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.cle} className="border-t border-line/60">
                <th scope="row" className="py-1 pr-4 font-medium text-fg">
                  {point.intitule}
                </th>
                <td className="py-1 pr-4 text-fg">{point.pages}</td>
                <td className="py-1 text-fg">{point.chapitres}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────── */

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

  const [stats, profile, library, history] = await Promise.all([
    computeStats(user.id),
    getProfile(user.id),
    libraryWithSeries(user.id),
    listHistory(user.id, 1000),
  ]);
  const publiques = profile?.confidentialite?.statsPubliques ?? true;

  // Série du graphique choisi (semaine / mois / année)
  const points =
    periode === "annee" ? pointsMois(stats.par_jour) : pointsJours(stats.par_jour, periode === "semaine" ? 7 : 30);
  const regularite = computeRegularite(stats.par_jour);

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

  const joursRestants = 30 - regularite.joursActifs30;
  const regularite30 = Math.round((regularite.joursActifs30 / 30) * 100);

  return (
    <div className="container-site space-y-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">Statistiques</h1>
          <p className="text-sm text-muted">Vos chiffres de lecture personnels (§6.8).</p>
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

          <section className="card space-y-4 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-title">Régularité</h2>
              <p className="text-xs text-muted">jours de lecture sur les 30 derniers jours</p>
            </div>

            <div
              className="flex flex-wrap gap-1"
              role="img"
              aria-label={`${regularite.joursActifs30} jours de lecture sur les 30 derniers jours`}
            >
              {regularite.grille.map((jour) => (
                <span
                  key={jour.date}
                  title={`${dateLongue(jour.date)} : ${jour.actif ? "lecture" : "aucune lecture"}`}
                  aria-hidden
                  className={`size-3.5 rounded-[3px] border border-line ${
                    jour.actif ? "bg-primary" : "bg-surface2"
                  }`}
                />
              ))}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-line bg-surface2 px-4 py-3">
                <dt className="text-xs text-muted">Jours de lecture (30 jours)</dt>
                <dd className="mt-1 text-xl font-black text-fg">
                  {regularite.joursActifs30} / 30
                </dd>
                <dd className="text-xs text-muted">
                  {regularite30} % du mois · {joursRestants} jour
                  {joursRestants > 1 ? "s" : ""} sans lecture
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-surface2 px-4 py-3">
                <dt className="text-xs text-muted">Jours consécutifs (en cours)</dt>
                <dd className="mt-1 text-xl font-black text-fg">{stats.jours_consecutifs}</dd>
                <dd className="text-xs text-muted">
                  {stats.jours_consecutifs > 0
                    ? `une lecture chaque jour depuis ${stats.jours_consecutifs} jour${
                        stats.jours_consecutifs > 1 ? "s" : ""
                      }`
                    : "aucune série en cours"}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-surface2 px-4 py-3">
                <dt className="text-xs text-muted">Meilleure série de jours</dt>
                <dd className="mt-1 text-xl font-black text-fg">{regularite.meilleureSerie}</dd>
                <dd className="text-xs text-muted">
                  plus longue suite ininterrompue de lectures
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-surface2 px-4 py-3">
                <dt className="text-xs text-muted">Jours de lecture (12 mois)</dt>
                <dd className="mt-1 text-xl font-black text-fg">
                  {regularite.joursActifs12Mois} / 365
                </dd>
                <dd className="text-xs text-muted">
                  {regularite.derniereLecture
                    ? `dernière lecture : ${dateLongue(regularite.derniereLecture)}`
                    : "aucune lecture enregistrée"}
                </dd>
              </div>
            </dl>
          </section>
        </>
      )}

      {/* Genres et série la plus lue : affichés même sans lecture (état vide inclus). */}
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
                      <div
                        className="mt-1 h-2 overflow-hidden rounded-full bg-surface2"
                        role="progressbar"
                        aria-label={`Séries du genre ${genre}`}
                        aria-valuemin={0}
                        aria-valuemax={maxGenre}
                        aria-valuenow={total}
                      >
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
                    decoding="async"
                    className="h-24 w-16 rounded-lg object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-fg">{seriePreferee.titre}</span>
                    <span className="block text-xs text-muted">
                      {seriePreferee.genres.slice(0, 3).join(", ") || "sans genre"}
                    </span>
                  </span>
                </Link>
              ) : (
                <p className="text-sm text-muted">Aucune donnée pour le moment.</p>
              )}
            </section>
      </div>

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
