import { Lock, Search, ScrollText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { AccessDenied } from "@/components/ui/access-denied";
import { Badge, Card, EmptyState, Input, Select } from "@/components/ui/kit";
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

/**
 * Restitution lisible d'une valeur d'audit.
 *
 * Le socle Appwrite « revive » les chaînes JSON à la lecture : `avant` /
 * `apres` reviennent donc le plus souvent sous forme d'objet, parfois déjà
 * parsé, parfois encore en chaîne selon l'entrée. On tolère les trois formes
 * pour ne jamais rendre un objet à React.
 */
function pretty(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 0);
    } catch {
      return value;
    }
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Filtrage simple : l'action exacte filtre, le texte fouille acteur/cible. */
function matches(
  entry: { action: string; actor_pseudo: string; cible: string },
  q: string,
  action: string,
): boolean {
  if (action && entry.action !== action) return false;
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    entry.action.toLowerCase().includes(needle) ||
    entry.actor_pseudo.toLowerCase().includes(needle) ||
    entry.cible.toLowerCase().includes(needle)
  );
}

/**
 * Journal d'audit complet : qui, quoi, quand, IP, avant / après.
 * Visible uniquement par le Gérant et non modifiable.
 */
export default async function GerantAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string }>;
}) {
  const user = await getCurrentUser();
  if (!can(user?.role, "full_audit")) {
    return (
      <AccessDenied
        required="owner"
        hint="Le journal d'audit complet est réservé au Gérant."
      />
    );
  }

  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const action = typeof sp.action === "string" ? sp.action : "";

  const entries = await listAudit({ full: true, limit: 300 });
  const actions = [...new Set(entries.map((entry) => entry.action))].sort();
  const filtered = entries.filter((entry) => matches(entry, q, action));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <ScrollText className="size-4 text-primary" /> Journal d&apos;audit
          </h1>
          <p className="mt-1 text-sm text-muted">
            {filtered.length} entrée{filtered.length > 1 ? "s" : ""} affichée
            {filtered.length > 1 ? "s" : ""} sur {entries.length} · traces des actions sensibles.
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-1.5 text-xs text-muted">
          <Lock className="size-3.5" /> Non modifiable — écriture réservée au serveur
        </span>
      </div>

      <form method="get" action="/gerant/audit" className="flex flex-wrap items-end gap-2" role="search">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label className="label" htmlFor="audit-q">
            Rechercher
          </label>
          <Input
            id="audit-q"
            name="q"
            defaultValue={q}
            placeholder="Acteur, action, cible…"
          />
        </div>
        <div className="w-64">
          <label className="label" htmlFor="audit-action">
            Type d&apos;action
          </label>
          <Select id="audit-action" name="action" defaultValue={action}>
            <option value="">Toutes les actions</option>
            {actions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
        <button type="submit" className="btn-secondary shrink-0">
          <Search className="size-4" /> Filtrer
        </button>
        {(q || action) && (
          <a href="/gerant/audit" className="btn-ghost shrink-0">
            Réinitialiser
          </a>
        )}
      </form>

      {filtered.length === 0 ? (
        <EmptyState
          title="Aucune entrée"
          description={
            q || action
              ? "Aucune trace ne correspond à ce filtre dans les 300 dernières entrées."
              : "Aucune action enregistrée pour le moment."
          }
        />
      ) : (
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
              {filtered.map((entry) => (
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
            </tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-muted">
        Le journal est en écriture exclusive côté serveur : aucune route ne permet de modifier ou
        de supprimer une entrée. Les administrateurs n&apos;en voient qu&apos;une version tronquée
        (valeurs avant / après masquées, IP masquée).
      </p>
    </div>
  );
}
