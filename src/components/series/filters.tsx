"use client";

import clsx from "clsx";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import { SERIES_STATUT_LABELS, type SeriesStatus, type SeriesType } from "@/lib/types";

type SortKey = "popularite" | "nouveautes" | "alpha" | "note" | "maj";

const STATUTS: SeriesStatus[] = ["en_cours", "termine", "hiatus", "abandonne"];
const TYPES: SeriesType[] = ["manga", "manhwa", "manhua"];
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "popularite", label: "Popularité" },
  { key: "nouveautes", label: "Nouveautés" },
  { key: "alpha", label: "A → Z" },
  { key: "note", label: "Note" },
  { key: "maj", label: "Mise à jour" },
];

/**
 * Panneau de filtres du catalogue : chaque clic met à jour l'URL
 * (push avec `scroll: false`) afin que la navigation reste dans la page.
 */
export function Filters({ genres, years }: { genres: string[]; years: number[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");

  const value = (key: string) => searchParams.get(key) ?? "";

  function apply(key: string, next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!next) params.delete(key);
    else params.set(key, next);
    params.delete("page"); // un changement de filtre repart à la page 1
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function reset() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["q", "genre", "tag", "statut", "type", "annee", "sort", "page"]) {
      params.delete(key);
    }
    const qs = params.toString();
    setQ("");
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    apply("q", q.trim() || null);
  }

  const hasFilters = ["q", "genre", "tag", "statut", "type", "annee"].some((k) => value(k));

  return (
    <div className="card space-y-4 p-4">
      <form onSubmit={onSearch} className="flex gap-2">
        <input
          type="search"
          className="input"
          placeholder="Filtrer par titre, auteur…"
          aria-label="Filtrer le catalogue"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={120}
        />
        <button type="submit" className="btn-secondary shrink-0">
          Filtrer
        </button>
      </form>

      <FilterGroup label="Genre">
        <Chip active={!value("genre")} onClick={() => apply("genre", null)}>
          Tous
        </Chip>
        {genres.map((g) => (
          <Chip key={g} active={value("genre") === g} onClick={() => apply("genre", value("genre") === g ? null : g)}>
            {g}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="Statut">
        <Chip active={!value("statut")} onClick={() => apply("statut", null)}>
          Tous
        </Chip>
        {STATUTS.map((s) => (
          <Chip key={s} active={value("statut") === s} onClick={() => apply("statut", value("statut") === s ? null : s)}>
            {SERIES_STATUT_LABELS[s]}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="Type">
        <Chip active={!value("type")} onClick={() => apply("type", null)}>
          Tous
        </Chip>
        {TYPES.map((t) => (
          <Chip key={t} active={value("type") === t} onClick={() => apply("type", value("type") === t ? null : t)}>
            {t === "manhwa" ? "Manhwa" : t === "manhua" ? "Manhua" : "Manga"}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="Année">
        <Chip active={!value("annee")} onClick={() => apply("annee", null)}>
          Toutes
        </Chip>
        {years.map((y) => (
          <Chip key={y} active={value("annee") === String(y)} onClick={() => apply("annee", value("annee") === String(y) ? null : String(y))}>
            {y}
          </Chip>
        ))}
      </FilterGroup>

      <FilterGroup label="Trier par">
        {SORTS.map((s) => (
          <Chip
            key={s.key}
            active={(value("sort") || "popularite") === s.key}
            onClick={() => apply("sort", s.key === "popularite" ? null : s.key)}
          >
            {s.label}
          </Chip>
        ))}
      </FilterGroup>

      {hasFilters && (
        <div className="flex justify-end">
          <button type="button" className="btn-ghost text-xs" onClick={reset}>
            Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx("chip", active && "chip-active")}
    >
      {children}
    </button>
  );
}
