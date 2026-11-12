import type { PageEntry } from "./types";

/* ── Aperçu des pages ────────────────────────────────────────────────── */

export function EntryList({ entries, onClear }: { entries: PageEntry[]; onClear: () => void }) {
  if (entries.length === 0) return null;
  const previews = entries.filter((e) => e.preview).slice(0, 12);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-fg">
          {entries.length} page{entries.length > 1 ? "s" : ""} · tri naturel appliqué
        </p>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onClear}>
          Vider
        </button>
      </div>

      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {previews.map((entry) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={entry.name}
              src={entry.preview ?? ""}
              alt={entry.name}
              width={64}
              height={96}
              loading="lazy"
              className="h-24 w-16 rounded-lg border border-line object-cover"
            />
          ))}
          {entries.length > previews.length && (
            <span className="flex h-24 items-center px-2 text-xs text-muted">
              +{entries.length - previews.length}
            </span>
          )}
        </div>
      )}

      <ol className="max-h-40 overflow-auto rounded-xl border border-line text-xs">
        {entries.map((entry, i) => (
          <li
            key={`${entry.name}-${i}`}
            className="flex gap-3 border-b border-line px-3 py-1.5 last:border-0"
          >
            <span className="tabular-nums text-muted">{i + 1}.</span>
            <span className="truncate text-fg">{entry.name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
