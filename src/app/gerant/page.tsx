import Link from "next/link";
import {
  CircleAlert,
  Database,
  FolderPlus,
  FolderUp,
  HardHat,
  ListChecks,
  Loader2,
  ScrollText,
  Settings,
  Server,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card, EmptyState } from "@/components/ui/kit";
import { listImportJobs } from "@/lib/data/moderation";
import { listSeries } from "@/lib/data/series";
import { nasConfigured, nasHealth } from "@/lib/nas";
import { getDb, TABLES } from "@/lib/db";
import type { Chapter, ImportJob } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<ImportJob["type"], string> = {
  upload: "Upload direct",
  nas: "Depuis le NAS",
  imgchest: "Depuis ImgChest",
  drive: "Google Drive",
  batch: "Import par lot",
};

const STATUT_LABELS: Record<ImportJob["statut"], string> = {
  attente: "En attente",
  cours: "En cours",
  termine: "Terminé",
  erreur: "En erreur",
};

function statutTone(statut: ImportJob["statut"]): "ok" | "warn" | "adult" | "neutral" {
  if (statut === "termine") return "ok";
  if (statut === "erreur") return "adult";
  if (statut === "cours") return "warn";
  return "neutral";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Kpi({
  label,
  value,
  hint,
  tone = "fg",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "fg" | "adult" | "ok" | "warn";
}) {
  const color =
    tone === "adult"
      ? "text-adult"
      : tone === "ok"
        ? "text-ok"
        : tone === "warn"
          ? "text-warn"
          : "text-fg";
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

/**
 * Tableau de bord du Gérant : état de l'import, santé du NAS,
 * catalogue et raccourcis — la lecture d'ensemble avant de travailler.
 */
export default async function GerantHomePage() {
  const user = await getCurrentUser();
  if (!can(user?.role, "import_chapters")) {
    return <AccessDenied required="owner" hint="Cet espace est réservé au Gérant." />;
  }

  const [jobs, catalog, chapters, health] = await Promise.all([
    listImportJobs(30),
    listSeries({ perPage: 1, includeAdult: true, includeArchived: true }),
    getDb().list<Chapter>(TABLES.chapters, { limit: 5000 }),
    nasConfigured()
      ? nasHealth().catch(() => ({ ok: false, reason: "injoignable" } as const))
      : Promise.resolve({ ok: false, reason: "non configuré" } as const),
  ]);

  const enErreur = jobs.filter((j) => j.statut === "erreur");
  const enCours = jobs.filter((j) => j.statut === "cours" || j.statut === "attente");
  const enAttente = chapters.items.filter((c) => c.statut !== "published");
  const publies = chapters.items.filter((c) => c.statut === "published");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title">Suivi des imports</h1>
          <p className="text-sm text-muted">
            {jobs.length} job{jobs.length > 1 ? "s" : ""} enregistré{jobs.length > 1 ? "s" : ""} ·
            cadence prévue : ~10 chapitres / semaine
          </p>
        </div>
        <Link href="/gerant/import" className="btn-primary">
          <FolderUp className="size-4" /> Lancer un import
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Séries au catalogue"
          value={catalog.total}
          hint="Archivées incluses"
        />
        <Kpi
          label="Chapitres en attente"
          value={enAttente.length}
          hint={`${publies.length} publié(s)`}
          tone={enAttente.length > 0 ? "warn" : "fg"}
        />
        <Kpi label="Imports en cours" value={enCours.length} tone={enCours.length ? "warn" : "fg"} />
        <Kpi
          label="Imports en erreur"
          value={enErreur.length}
          hint={enErreur.length ? "voir le détail ci-dessous" : "tout est propre"}
          tone={enErreur.length ? "adult" : "ok"}
        />
      </div>

      <Card
        className={`flex flex-wrap items-center gap-4 p-4 ${
          health.ok ? "" : "border-warn/40"
        }`}
      >
        <Server className={health.ok ? "size-5 text-ok" : "size-5 text-warn"} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-fg">
            NAS — {health.ok ? "en ligne" : "indisponible"}
          </p>
          <p className="text-xs text-muted">
            {!nasConfigured()
              ? "Renseignez NAS_API_BASE pour activer l'import et le catalogue d'images."
              : health.ok
                ? `Latence ${health.latencyMs ?? "?"} ms · espace libre ${
                    health.diskFreePct ?? "?"
                  } %`
                : (health.reason ?? "L'API du NAS ne répond pas.")}
          </p>
        </div>
        <Badge tone={health.ok ? "ok" : "warn"}>
          {health.ok ? "Opérationnel" : "À vérifier"}
        </Badge>
        <Link href="/gerant/import" className="btn-secondary ml-auto">
          <ListChecks className="size-4" /> Importer
        </Link>
      </Card>

      {enErreur.length > 0 && (
        <div className="rounded-xl border border-adult/40 bg-adult/10 px-4 py-3 text-sm text-adult">
          <CircleAlert className="mr-2 inline size-4" />
          {enErreur.length} import{enErreur.length > 1 ? "s" : ""} en échec : le message et les
          erreurs détaillées figurent dans le journal ci-dessous.
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Journal des imports</h2>
          <Link href="/gerant/audit" className="link-muted text-sm">
            Journal d&apos;audit complet →
          </Link>
        </div>

        {jobs.length === 0 ? (
          <EmptyState
            title="Aucun import pour le moment"
            description="Lancez votre premier import : un dossier de série entier (import par lot) ou un chapitre précis."
            action={
              <Link href="/gerant/import" className="btn-primary">
                <FolderUp className="size-4" /> Lancer un import
              </Link>
            }
          />
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold">Progression</th>
                  <th className="px-4 py-3 font-semibold">Message</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {formatDate(job.created_at)}
                    </td>
                    <td className="px-4 py-3 text-fg">{TYPE_LABELS[job.type] ?? job.type}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statutTone(job.statut)}>{STATUT_LABELS[job.statut]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface2">
                          <div
                            className={`h-full ${job.statut === "erreur" ? "bg-adult" : "bg-primary"}`}
                            style={{ width: `${Math.min(100, Math.max(0, job.progression))}%` }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-muted">{job.progression}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {job.statut === "cours" && (
                        <Loader2 className="mr-1.5 inline size-3.5 animate-spin text-primary" />
                      )}
                      {job.message}
                      {job.erreurs.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-xs text-adult">
                          {job.erreurs.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="section-title">Accès rapides</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link href="/gerant/series" className="btn-secondary justify-start">
              <Database className="size-4" /> Répertoire des séries
            </Link>
            <Link href="/gerant/series/nouvelle" className="btn-secondary justify-start">
              <FolderPlus className="size-4" /> Créer une série
            </Link>
            <Link href="/gerant/import" className="btn-secondary justify-start">
              <FolderUp className="size-4" /> Import de contenu (NAS)
            </Link>
            <Link href="/gerant/parametres" className="btn-secondary justify-start">
              <Settings className="size-4" /> Paramètres et connexions
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="section-title flex items-center gap-2">
            <HardHat className="size-4 text-primary" /> Règles en vigueur
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>• Cadence éditoriale : environ <span className="text-fg">10 chapitres / semaine</span>.</li>
            <li>• Brouillon → Programmé → Publié : seul le Gérant publie, dépublie ou supprime.</li>
            <li>• Archiver retire une série du catalogue sans rien supprimer ; la suppression définitive exige la saisie du titre.</li>
            <li>• Les planches vivent sur le NAS, servies par le CDN ; aucun octet ne passe par le site.</li>
            <li>• Chaque action sensible est tracée au journal d&apos;audit (non modifiable).</li>
          </ul>
          <Link href="/gerant/audit" className="link-muted mt-4 inline-flex items-center gap-1.5 text-sm">
            <ScrollText className="size-4" /> Ouvrir le journal d&apos;audit
          </Link>
        </Card>
      </div>
    </div>
  );
}
