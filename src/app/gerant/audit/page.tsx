import { ScrollText, Lock } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card } from "@/components/ui/kit";
import { listAudit } from "@/lib/data/moderation";

export const dynamic = "force-dynamic";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pretty(value: string | null): string {
  if (!value) return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 0);
  } catch {
    return value;
  }
}

/**
 * Journal d'audit complet (§9.5) : qui, quoi, quand, IP, avant / après.
 * Visible uniquement par le Gérant et non modifiable.
 */
export default async function GerantAuditPage() {
  const user = await getCurrentUser();
  if (!can(user?.role, "full_audit")) {
    return (
      <AccessDenied
        required="owner"
        hint="Le journal d'audit complet est réservé au Gérant."
      />
    );
  }

  const entries = await listAudit({ full: true, limit: 300 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <ScrollText className="size-4 text-primary" /> Journal d&apos;audit
          </h1>
          <p className="mt-1 text-sm text-muted">
            {entries.length} entrée{entries.length > 1 ? "s" : ""} · traces des actions sensibles
            (§9.5).
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-1.5 text-xs text-muted">
          <Lock className="size-3.5" /> Non modifiable — écriture réservée au serveur
        </span>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[56rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Acteur</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Cible</th>
              <th className="px-4 py-3 font-semibold">Avant</th>
              <th className="px-4 py-3 font-semibold">Après</th>
              <th className="px-4 py-3 font-semibold">IP</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-line align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted">
                  {formatDate(entry.created_at)}
                </td>
                <td className="px-4 py-3 font-medium text-fg">{entry.actor_pseudo}</td>
                <td className="px-4 py-3">
                  <Badge tone="primary">{entry.action}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{entry.cible}</td>
                <td className="max-w-40 px-4 py-3">
                  <span className="block truncate font-mono text-xs text-muted" title={pretty(entry.avant)}>
                    {pretty(entry.avant)}
                  </span>
                </td>
                <td className="max-w-40 px-4 py-3">
                  <span className="block truncate font-mono text-xs text-muted" title={pretty(entry.apres)}>
                    {pretty(entry.apres)}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">{entry.ip}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  Aucune action enregistrée pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted">
        Le journal est en écriture exclusive côté serveur : aucune route ne permet de modifier ou
        de supprimer une entrée. Les administrateurs n&apos;en voient qu&apos;une version tronquée
        (valeurs avant / après masquées, IP masquée).
      </p>
    </div>
  );
}
