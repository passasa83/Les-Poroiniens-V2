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
import { getCurrentUser } from "@/lib/auth";
import { atLeast, can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card } from "@/components/ui/kit";
import { appwriteEnabled, dataMode, getDb, TABLES } from "@/lib/db";
import { listImportJobs, listReports } from "@/lib/data/moderation";
import type { Comment, Profile, Series } from "@/lib/types";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
const WINDOWS: Array<{ label: string; ms: number }> = [
  { label: "Jour", ms: DAY },
  { label: "Semaine", ms: 7 * DAY },
  { label: "Mois", ms: 30 * DAY },
];

type RawRow = Record<string, unknown>;

function rowsSince(rows: unknown[], field: string, ms: number): number {
  const from = Date.now() - ms;
  return rows.filter((r) => {
    const value = (r as RawRow)[field];
    if (typeof value !== "string") return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && time >= from;
  }).length;
}

function total(rows: unknown[]): number {
  return rows.length;
}

function n(value: number): string {
  return value.toLocaleString("fr-FR");
}

/** Tableau de bord du back-office (§9.1). */
export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!atLeast(user?.role, "admin")) return <AccessDenied required="admin" />;

  const [seriesRes, chapterRows, commentRes, profileRes, reports, jobs] = await Promise.all([
    getDb().list<Series>(TABLES.series, {
      order: { field: "vues", dir: "desc" },
      limit: 5000,
    }),
    getDb().list<RawRow>(TABLES.chapters, { order: { field: "created_at", dir: "desc" }, limit: 5000 }),
    getDb().list<Comment>(TABLES.comments, { limit: 5000 }),
    getDb().list<Profile>(TABLES.profiles, { limit: 5000 }),
    listReports(),
    listImportJobs(50),
  ]);

  const series = seriesRes.items;
  const chapters = chapterRows.items;
  const publishedChapters = chapters.filter((c) => c.statut === "published");
  const draftChapters = chapters.filter((c) => c.statut === "draft");
  const openReports = reports.filter((r) => r.statut === "ouvert");
  const failedJobs = jobs.filter((j) => j.statut === "erreur");
  const totalViews = series.reduce((sum, s) => sum + (Number(s.vues) || 0), 0);

  const kpis: Array<{
    label: string;
    values: [number, number, number];
    global?: boolean;
  }> = [
    {
      label: "Séries ajoutées",
      values: WINDOWS.map((w) => rowsSince(series, "created_at", w.ms)) as [number, number, number],
    },
    {
      label: "Chapitres publiés",
      values: WINDOWS.map((w) => rowsSince(publishedChapters, "publish_at", w.ms)) as [
        number,
        number,
        number,
      ],
    },
    { label: "Chapitres en brouillon", values: [total(draftChapters), total(draftChapters), total(draftChapters)], global: true },
    {
      label: "Commentaires",
      values: WINDOWS.map((w) => rowsSince(commentRes.items, "created_at", w.ms)) as [
        number,
        number,
        number,
      ],
    },
    {
      label: "Inscriptions",
      values: WINDOWS.map((w) => rowsSince(profileRes.items, "date_inscription", w.ms)) as [
        number,
        number,
        number,
      ],
    },
    {
      label: "Signalements ouverts",
      values: [openReports.length, openReports.length, openReports.length],
      global: true,
    },
    { label: "Vues totales", values: [totalViews, totalViews, totalViews], global: true },
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

  const recentChapters = chapters.slice(0, 8);
  const seriesById = new Map(series.map((s) => [s.id, s] as const));

  return (
    <div className="space-y-8">
      <Header title="Tableau de bord" subtitle="Activité du site et santé des services." />

      {mode === "demo" && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn">
          Mode démonstration : Appwrite n&apos;est pas encore configuré (clé API absente).
          Les compteurs proviennent du jeu de données local.
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
                    <span className="ml-2 text-xs text-muted" title="Valeur cumulée, indépendante de la période">
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
            {series.slice(0, 5).map((s, i) => (
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
            {series.length === 0 && <li className="text-sm text-muted">Aucune série.</li>}
          </ol>
          <Link href="/admin/series" className="mt-4 inline-block text-sm link-muted">
            Gérer le catalogue →
          </Link>
        </Card>

        {/* Derniers chapitres */}
        <Card className="p-5">
          <h2 className="section-title flex items-center gap-2">
            <BookOpen className="size-4 text-primary" /> Derniers chapitres
          </h2>
          <ul className="mt-4 space-y-3">
            {recentChapters.map((chapter) => {
              const serie = seriesById.get(String(chapter.series_id));
              const statut = String(chapter.statut);
              return (
                <li key={String(chapter.id)} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate link-muted">{serie?.titre ?? "Série supprimée"}</span>
                    <span className="shrink-0 text-muted">
                      ch. {String(chapter.numero)}
                    </span>
                  </span>
                  <Badge tone={statut === "published" ? "ok" : statut === "scheduled" ? "warn" : "neutral"}>
                    {statut === "published" ? "Publié" : statut === "scheduled" ? "Planifié" : "Brouillon"}
                  </Badge>
                </li>
              );
            })}
            {recentChapters.length === 0 && <li className="text-sm text-muted">Aucun chapitre.</li>}
          </ul>
        </Card>

        {/* Qualité des images */}
        <Card className="p-5">
          <h2 className="section-title">Taux d&apos;erreur des images</h2>
          <p className="mt-4 text-4xl font-bold text-fg">
            {mode === "demo" ? "N/A" : "0 %"}
          </p>
          <p className="mt-3 text-xs text-muted">
            {mode === "demo"
              ? "Mesure indisponible en mode démonstration (aucun trafic réel, aucun CDN)."
              : "Valeur par défaut : la mesure détaillée sera alimentée par le CDN devant le NAS (§5.3), avec alerte au-delà du seuil configuré. En attendant, l’affichage reste à 0 %."}
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
              value={appwriteState === "ok" ? "OK" : appwriteState === "ko" ? "KO" : "Non configuré"}
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
            <HealthRow label="Dernier backup" value="Non planifié" tone="warn" hint="Sauvegarde quotidienne à mettre en place (§5.5)." />
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
                Chapitres planifiés
              </span>
              <Badge tone="neutral">
                {chapters.filter((c) => c.statut === "scheduled").length}
              </Badge>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="section-title">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

function HealthRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "adult" | "neutral";
  hint?: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-muted">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted/80">{hint}</span>}
      </span>
      <Badge tone={tone}>{value}</Badge>
    </li>
  );
}
