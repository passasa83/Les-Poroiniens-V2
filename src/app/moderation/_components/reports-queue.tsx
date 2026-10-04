"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { Badge, Card } from "@/components/ui/kit";
import type { Report } from "@/lib/types";

export type EnrichedReport = {
  report: Report;
  reporter: string;
  cibleLabel: string;
  cibleHref: string | null;
  auteurPseudo: string | null;
  extrait: string | null;
  cibleStatut: string | null;
};

type Filter = "tous" | "ouvert" | "traite" | "rejete";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "tous", label: "Tous" },
  { value: "ouvert", label: "Ouverts" },
  { value: "traite", label: "Traités" },
  { value: "rejete", label: "Rejetés" },
];

const TYPE_LABELS: Record<Report["type"], string> = {
  comment: "Commentaire",
  chapter: "Chapitre",
  series: "Série",
};

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

/** File de signalements + historique des décisions (§9.4). */
export function ReportsQueue({
  items,
  initialStatut,
}: {
  items: EnrichedReport[];
  initialStatut: Filter | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>(initialStatut ?? "tous");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hideComment, setHideComment] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState(items);

  const counts = useMemo(
    () => ({
      tous: local.length,
      ouvert: local.filter((i) => i.report.statut === "ouvert").length,
      traite: local.filter((i) => i.report.statut === "traite").length,
      rejete: local.filter((i) => i.report.statut === "rejete").length,
    }),
    [local],
  );

  const visible = useMemo(
    () => (filter === "tous" ? local : local.filter((i) => i.report.statut === filter)),
    [local, filter],
  );

  async function decide(item: EnrichedReport, statut: "traite" | "rejete") {
    setBusyId(item.report.id);
    setError(null);
    const masquerCommentaire = hideComment.has(item.report.id);
    try {
      const res = await fetch(`/api/moderation/reports/${item.report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut, masquerCommentaire }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Action impossible.");
        return;
      }
      setLocal((prev) =>
        prev.map((entry) =>
          entry.report.id === item.report.id
            ? {
                ...entry,
                report: { ...entry.report, statut },
                cibleStatut:
                  masquerCommentaire && entry.report.type === "comment"
                    ? "supprime"
                    : entry.cibleStatut,
              }
            : entry,
        ),
      );
      setHideComment((prev) => {
        const next = new Set(prev);
        next.delete(item.report.id);
        return next;
      });
      router.refresh();
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={filter === f.value ? "chip-active chip" : "chip"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
            <span className="ml-1.5 tabular-nums">{counts[f.value]}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-xl border border-adult/40 bg-adult/10 px-3 py-2 text-sm text-adult">
          {error}
        </p>
      )}

      {visible.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted">
          Aucun signalement dans cette vue.
        </Card>
      )}

      <div className="space-y-4">
        {visible.map((item) => {
          const { report } = item;
          const open = report.statut === "ouvert";
          return (
            <Card key={report.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="primary">{TYPE_LABELS[report.type]}</Badge>
                  <Badge tone={open ? "warn" : report.statut === "traite" ? "ok" : "neutral"}>
                    {open ? "Ouvert" : report.statut === "traite" ? "Traité" : "Rejeté"}
                  </Badge>
                  {report.type === "comment" && item.cibleStatut === "supprime" && (
                    <Badge tone="adult">Commentaire masqué</Badge>
                  )}
                </div>
                <span className="text-xs text-muted">{formatDate(report.created_at)}</span>
              </div>

              <div className="text-sm">
                <p className="font-semibold text-fg">{item.cibleLabel}</p>
                {item.cibleHref && (
                  <a
                    href={item.cibleHref}
                    className="mt-0.5 inline-flex items-center gap-1 text-xs link-muted"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir la cible <ExternalLink className="size-3" />
                  </a>
                )}
                {item.extrait && (
                  <blockquote className="mt-2 border-l-2 border-line pl-3 text-muted">
                    {item.extrait}
                  </blockquote>
                )}
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted">Raison : </span>
                  <span className="text-fg">{report.raison}</span>
                </p>
                <p>
                  <span className="text-muted">Signalé par : </span>
                  <span className="text-fg">{item.reporter}</span>
                </p>
                {report.details && (
                  <p className="sm:col-span-2">
                    <span className="text-muted">Détails : </span>
                    <span className="text-fg">{report.details}</span>
                  </p>
                )}
                {item.auteurPseudo && (
                  <p className="sm:col-span-2">
                    <span className="text-muted">Auteur du contenu : </span>
                    <span className="text-fg">{item.auteurPseudo}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                {report.type === "comment" && open && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={hideComment.has(report.id)}
                      onChange={(e) => {
                        const next = new Set(hideComment);
                        if (e.target.checked) next.add(report.id);
                        else next.delete(report.id);
                        setHideComment(next);
                      }}
                      className="size-4 accent-[var(--primary)]"
                    />
                    <EyeOff className="size-4" /> Masquer le commentaire signalé
                  </label>
                )}
                {open ? (
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      className="btn-primary px-3 py-1.5 text-xs"
                      disabled={busyId === report.id}
                      onClick={() => decide(item, "traite")}
                    >
                      <ShieldCheck className="size-3" /> Traiter
                    </button>
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs"
                      disabled={busyId === report.id}
                      onClick={() => decide(item, "rejete")}
                    >
                      <XCircle className="size-3" /> Rejeter
                    </button>
                  </div>
                ) : (
                  <span className="ml-auto text-xs text-muted">
                    Décision enregistrée au journal d&apos;audit.
                  </span>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
