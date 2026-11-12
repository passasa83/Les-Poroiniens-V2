"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/kit";
import type { SeriesLite } from "./reco-utils";

/* ── Sélecteur de série (recherche par titre) ─────────────────────────── */

export function SeriesSelector({
  value,
  onChange,
  seriesById,
}: {
  value: string;
  onChange: (id: string) => void;
  seriesById: Record<string, SeriesLite>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SeriesLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      // différé d'un tick : évite un setState synchrone dans l'effet
      const clear = window.setTimeout(() => setResults([]), 0);
      return () => window.clearTimeout(clear);
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/catalogue/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((data: unknown) => {
          if (cancelled) return;
          const list = Array.isArray(data) ? data : [];
          setResults(list as SeriesLite[]);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  const selected = seriesById[value];

  return (
    <div className="space-y-2">
      {selected ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.couverture}
            alt=""
            width={40}
            height={60}
            loading="lazy"
            className="h-15 w-10 rounded object-cover"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
            {selected.titre}
          </span>
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => {
              onChange("");
              setQuery("");
            }}
          >
            Changer
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une série par titre…"
              aria-label="Rechercher une série"
            />
            <Search className="size-4 shrink-0 text-muted" />
          </div>
          {loading && <p className="mt-1 text-xs text-muted">Recherche…</p>}
          {results.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-surface p-1 shadow-lg">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-fg hover:bg-surface2"
                    onClick={() => {
                      onChange(item.id);
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.couverture}
                      alt=""
                      width={24}
                      height={36}
                      loading="lazy"
                      className="h-9 w-6 rounded object-cover"
                    />
                    <span className="truncate">{item.titre}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && !loading && results.length === 0 && (
            <p className="mt-1 text-xs text-muted">Aucun résultat.</p>
          )}
        </div>
      )}
    </div>
  );
}
