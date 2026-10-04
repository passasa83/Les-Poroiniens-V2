import Link from "next/link";
import { CalendarClock, FolderUp, HardHat, ScrollText, Settings, TriangleAlert } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card } from "@/components/ui/kit";
import { listImportJobs } from "@/lib/data/moderation";
import type { ImportJob } from "@/lib/types";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<ImportJob["type"], string> = {
  upload: "Upload direct",
  nas: "Depuis le NAS",
  drive: "Google Drive",
  batch: "Import par lot",
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

/** Tableau de bord des imports (§10.3 : file d'attente, progression, erreurs). */
export default async function GerantHomePage() {
  const user = await getCurrentUser();
  if (!can(user?.role, "import_chapters")) {
    return (
      <AccessDenied required="owner" hint="Cet espace est réservé au Gérant." />
    );
  }

  const jobs = await listImportJobs(30);
  const enErreur = jobs.filter((j) => j.statut === "erreur");
  const enCours = jobs.filter((j) => j.statut === "cours" || j.statut === "attente");

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

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">En cours / en attente</p>
          <p className="mt-1 text-3xl font-bold text-fg">{enCours.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">En erreur</p>
          <p className={`mt-1 text-3xl font-bold ${enErreur.length > 0 ? "text-adult" : "text-ok"}`}>
            {enErreur.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted">Terminés</p>
          <p className="mt-1 text-3xl font-bold text-fg">
            {jobs.filter((j) => j.statut === "termine").length}
          </p>
        </Card>
      </div>

      {enErreur.length > 0 && (
        <div className="rounded-xl border border-adult/40 bg-adult/10 px-4 py-3 text-sm text-adult">
          <TriangleAlert className="mr-2 inline size-4" />
          {enErreur.length} import{enErreur.length > 1 ? "s" : ""} en échec : ouvrez le détail
          ci-dessous pour lire le message.
        </div>
      )}

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
                <td className="px-4 py-3 whitespace-nowrap text-muted">{formatDate(job.created_at)}</td>
                <td className="px-4 py-3 text-fg">{TYPE_LABELS[job.type] ?? job.type}</td>
                <td className="px-4 py-3">
                  <Badge tone={statutTone(job.statut)}>{job.statut}</Badge>
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
            {jobs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Aucun import pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="section-title flex items-center gap-2">
            <HardHat className="size-4 text-primary" /> Règles en vigueur
          </h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>• Cadence éditoriale : environ <span className="text-fg">10 chapitres / semaine</span>.</li>
            <li>• Brouillon → Programmé → Publié : seul le Gérant publie, dépublie ou supprime.</li>
            <li>• Google Drive ne sert qu&apos;aux ressources de séries (couvertures, métadonnées) — jamais aux pages de scans.</li>
            <li>• Les pages de scans vivent sur le NAS, servies par le CDN ; aucun octet ne passe par Vercel.</li>
            <li>• Chaque action sensible est tracée au journal d&apos;audit (non modifiable).</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="section-title">Accès rapides</h2>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link href="/gerant/import" className="btn-secondary justify-start">
              <FolderUp className="size-4" /> Import de contenu (upload / NAS / Drive)
            </Link>
            <Link href="/gerant/audit" className="btn-secondary justify-start">
              <ScrollText className="size-4" /> Journal d&apos;audit complet
            </Link>
            <Link href="/gerant/parametres" className="btn-secondary justify-start">
              <Settings className="size-4" /> Paramètres et connexions
            </Link>
            <Link href="/gerant/audit" className="btn-secondary justify-start">
              <CalendarClock className="size-4" /> Historique des publications
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
