import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { libelleUnite } from "@/lib/format";
import type { Unite } from "@/lib/types";
import type { BatchRow } from "./types";

/** Barre de progression du lot et rapport ligne par ligne. */
export function BatchProgress({
  busy,
  runIndex,
  total,
  unite,
  rows,
}: {
  busy: boolean;
  runIndex: number;
  total: number;
  unite: Unite;
  rows: BatchRow[];
}) {
  return (
    <>
      {busy && (
        <div className="space-y-2">
          {(() => {
            const pct = total ? (Math.max(runIndex, 0) / total) * 100 : 0;
            return (
              <>
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>
                    {libelleUnite(Math.min(runIndex + 1, total), unite)} / {total}
                  </span>
                  <span className="tabular-nums">{Math.round(pct)}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-surface2"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                >
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </>
            );
          })()}
        </div>
      )}

      {rows.length > 0 && (
        <ol className="max-h-72 space-y-1 overflow-auto rounded-xl border border-line text-sm">
          {rows.map((row, index) => (
            <li
              key={`${row.name}-${index}`}
              className="flex items-center gap-2 border-b border-line px-3 py-2 last:border-0"
            >
              {row.statut === "cours" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : row.statut === "ok" ? (
                <CheckCircle2 className="size-4 shrink-0 text-ok" />
              ) : (
                <CircleAlert className="size-4 shrink-0 text-adult" />
              )}
              <span className="tabular-nums text-muted">n°{row.numero}</span>
              <span className="truncate text-fg">{row.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">
                {row.statut === "cours"
                  ? "indexation…"
                  : row.statut === "ok"
                    ? `${row.pages ?? 0} page(s)`
                    : (row.message ?? "erreur")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
