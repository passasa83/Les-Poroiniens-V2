import { FolderTree } from "lucide-react";
import { Badge } from "@/components/ui/kit";
import type { PreviewData } from "./types";

/* ── Aperçu d'un dossier NAS avant indexation ──────────────────── */

export function PreviewPanel({ preview }: { preview: PreviewData }) {
  const clean = preview.anomalies.length === 0;
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <FolderTree className="size-4 text-primary" />
          <span className="truncate">{preview.path}</span>
          <span className="text-muted">· {preview.count} page(s)</span>
        </p>
        <Badge tone={clean ? "ok" : "warn"}>
          {clean ? "Aucune anomalie" : `${preview.anomalies.length} point(s) à vérifier`}
        </Badge>
      </div>

      {preview.missing.length > 0 && (
        <p className="text-xs text-warn">
          Numéros manquants dans la séquence : {preview.missing.join(", ")}
        </p>
      )}

      {preview.duplicates.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-warn">Contenus identiques (doublons probables) :</p>
          <ul className="space-y-0.5 text-xs text-muted">
            {preview.duplicates.map((group, index) => (
              <li key={index}>• {group.join(", ")}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.anomalies.length > 0 && (
        <ul className="max-h-32 space-y-1 overflow-auto text-xs text-muted">
          {preview.anomalies.map((anomaly, index) => (
            <li key={index}>
              • <span className="text-fg">{anomaly.name}</span> — {anomaly.reason}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted">
        Ces points n&apos;empêchent pas l&apos;indexation : ils sont à vérifier avant publication.
      </p>
    </div>
  );
}
