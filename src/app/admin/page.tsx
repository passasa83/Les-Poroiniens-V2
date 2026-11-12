import Link from "next/link";
import { imageEnv } from "@/lib/media";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  CircleCheck,
  CircleX,
  Clock3,
  ExternalLink,
  Server,
} from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card } from "@/components/ui/kit";
import { appwriteEnabled, dataMode, getDb, TABLES } from "@/server/db";
import { adminDashboard, type Triplet } from "@/lib/data/dashboard";
import { libelleCourt } from "@/lib/format";
import { Header, HealthRow, QuickAction } from "./_components/dashboard-parts";

export const dynamic = "force-dynamic";

function n(value: number): string {
  return value.toLocaleString("fr-FR");
}

/** Tableau de bord du back-office. */
export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!atLeast(user?.role, "admin")) return <AccessDenied required="admin" />;

  const d = await adminDashboard();
  const openReports = d.signalementsOuverts;
  const failedJobs = d.jobsEnErreur;
  const fixe = (v: number): Triplet => [v, v, v];

  const kpis: Array<{ label: string; values: Triplet; global?: boolean }> = [
    { label: "Séries ajoutées", values: d.seriesAjoutees },
    { label: "Contenus publiés", values: d.chapitresPublies },
    { label: "Contenus en brouillon", values: fixe(d.brouillons), global: true },
    { label: "Commentaires", values: d.commentaires },
    { label: "Inscriptions", values: d.inscriptions },
    { label: "Signalements ouverts", values: fixe(openReports.length), global: true },
    { label: "Vues totales", values: fixe(d.vuesTotales), global: true },
  ];

  const mode = dataMode();
  let appwriteState: "ok" | "ko" | "absent" = "absent";
  if (appwriteEnabled()) {
    try {
      await getDb().list(TABLES.series, { limit: 1 });
      appwriteState = "ok";
    } catch {
      appwriteState = "ko";
    }
  }
  const driveConfigured = Boolean(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT);
  const nasConfigured = Boolean(imageEnv().nasApiBase);

  return (
    <div className="space-y-8">
      <Header title="Tableau de bord" subtitle="Activité du site et santé des services." />

      {/* Actions rapides */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <QuickAction
          href="/moderation"
          label="Signalements"
          value={openReports.length}
          hint="Modération en attente"
          tone={openReports.length > 0 ? "warn" : "ok"}
        />
        <QuickAction
          href="/admin/users"
          label="Utilisateurs"
          value={n(d.utilisateurs)}
          hint="Comptes et rôles"
        />
        <QuickAction
          href="/admin/series"
          label="Catalogue"
          value={n(d.seriesActives)}
          hint={`${d.seriesArchivees} archivée(s)`}
        />
        <QuickAction
          href="/admin/recommandations"
          label="Recommandations"
          hint="Mises en avant de la home"
          value="Gérer"
        />
      </div>

      {mode === "demo" && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn">
          Mode démonstration : Appwrite n&apos;est pas encore configuré (clé API absente). Les
          compteurs proviennent du jeu de données local.
        </div>
      )}

      {/* KPI */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-4 py-3 font-semibold">Indicateur</th>
              <th className="px-4 py-3 text-right font-semibold">Aujourd&apos;hui</th>
              <th className="px-4 py-3 text-right font-semibold">7 jours</th>
              <th className="px-4 py-3 text-right font-semibold">30 jours</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((kpi) => (
              <tr key={kpi.label} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-fg">
                  {kpi.label}
                  {kpi.global && (
                    <span
                      className="ml-2 text-xs text-muted"
                      title="Valeur cumulée, indépendante de la période"
                    >
                      (cumul)
                    </span>
                  )}
                </td>
                {kpi.values.map((value, i) => (
                  <td key={i} className="px-4 py-3 text-right font-semibold tabular-nums text-fg">
                    {n(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Top séries */}
        <Card className="p-5">
          <h2 className="section-title flex items-center gap-2">
            <Activity className="size-4 text-primary" /> Top séries (vues)
          </h2>
          <ol className="mt-4 space-y-3">
            {d.topSeries.map((s, i) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-muted">{i + 1}.</span>
                  <Link href={`/admin/series/${s.id}`} className="truncate link-muted">
                    {s.titre}
                  </Link>
                  {s.classification === "adult" && <Badge tone="adult">+18</Badge>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-fg">{n(s.vues)}</span>
              </li>
            ))}
            {d.topSeries.length === 0 && <li className="text-sm text-muted">Aucune série.</li>}
          </ol>
          <Link href="/admin/series" className="mt-4 inline-block text-sm link-muted">
            Consulter le catalogue →
          </Link>
        </Card>

        {/* Dernières publications */}
        <Card className="p-5">
          <h2 className="section-title flex items-center gap-2">
            <BookOpen className="size-4 text-primary" /> Dernières publications
          </h2>
          <ul className="mt-4 space-y-3">
            {d.derniersChapitres.map(({ chapter, serie }) => {
              const statut = chapter.statut;
              return (
                <li key={chapter.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate link-muted">{serie?.titre ?? "Série supprimée"}</span>
                    <span className="shrink-0 text-muted">
                      {libelleCourt(chapter.numero, serie?.unite)}
                    </span>
                  </span>
                  <Badge
                    tone={
                      statut === "published" ? "ok" : statut === "scheduled" ? "warn" : "neutral"
                    }
                  >
                    {statut === "published"
                      ? "Publié"
                      : statut === "scheduled"
                        ? "Planifié"
                        : "Brouillon"}
                  </Badge>
                </li>
              );
            })}
            {d.derniersChapitres.length === 0 && (
              <li className="text-sm text-muted">Aucune publication.</li>
            )}
          </ul>
        </Card>

        {/* Qualité des images */}
        <Card className="p-5">
          <h2 className="section-title">Taux d&apos;erreur des images</h2>
          <p className="mt-4 text-4xl font-bold text-fg">{mode === "demo" ? "N/A" : "0 %"}</p>
          <p className="mt-3 text-xs text-muted">
            {mode === "demo"
              ? "Mesure indisponible en mode démonstration (aucun trafic réel, aucun CDN)."
              : "Valeur par défaut : la mesure détaillée sera alimentée par le CDN devant le NAS, avec alerte au-delà du seuil configuré. En attendant, l’affichage reste à 0 %."}
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Santé système */}
        <Card className="p-5">
          <h2 className="section-title flex items-center gap-2">
            <Server className="size-4 text-primary" /> Santé système
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            <HealthRow
              label="Mode de données"
              value={mode === "appwrite" ? "Appwrite" : "Démo (mémoire)"}
              tone={mode === "appwrite" ? "ok" : "warn"}
            />
            <HealthRow
              label="Appwrite"
              value={
                appwriteState === "ok" ? "OK" : appwriteState === "ko" ? "KO" : "Non configuré"
              }
              tone={appwriteState === "ok" ? "ok" : appwriteState === "ko" ? "adult" : "neutral"}
            />
            <HealthRow
              label="Google Drive (ressources séries)"
              value={driveConfigured ? "Configuré" : "Non connecté"}
              tone={driveConfigured ? "ok" : "neutral"}
            />
            <HealthRow
              label="Quota Drive / espace disque"
              value="Non connecté"
              tone="neutral"
              hint="Aucune API de quota n'est branchée : voir variables GOOGLE_DRIVE_* et NAS_API_BASE."
            />
            <HealthRow
              label="NAS / espace de stockage"
              value={nasConfigured ? "Configuré" : "Non connecté"}
              tone={nasConfigured ? "ok" : "neutral"}
            />
            <HealthRow
              label="Dernier backup"
              value="Non planifié"
              tone="warn"
              hint="Sauvegarde quotidienne à mettre en place."
            />
          </ul>
        </Card>

        {/* Alertes */}
        <Card className="p-5">
          <h2 className="section-title flex items-center gap-2">
            <AlertTriangle className="size-4 text-warn" /> Alertes
          </h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {openReports.length > 0 ? (
                  <AlertTriangle className="size-4 text-warn" />
                ) : (
                  <CircleCheck className="size-4 text-ok" />
                )}
                Signalements en attente
              </span>
              <span className="flex items-center gap-3">
                <Badge tone={openReports.length > 0 ? "warn" : "ok"}>{openReports.length}</Badge>
                <Link href="/moderation" className="link-muted text-xs">
                  Traiter <ExternalLink className="inline size-3" />
                </Link>
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                {failedJobs.length > 0 ? (
                  <CircleX className="size-4 text-adult" />
                ) : (
                  <CircleCheck className="size-4 text-ok" />
                )}
                Imports en erreur
              </span>
              <span className="flex items-center gap-3">
                <Badge tone={failedJobs.length > 0 ? "adult" : "ok"}>{failedJobs.length}</Badge>
                {can(user?.role, "import_chapters") && (
                  <Link href="/gerant" className="link-muted text-xs">
                    Voir les jobs <ExternalLink className="inline size-3" />
                  </Link>
                )}
              </span>
            </li>
            <li className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Clock3 className="size-4 text-muted" />
                Contenus planifiés
              </span>
              <Badge tone="neutral">{d.planifies}</Badge>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
