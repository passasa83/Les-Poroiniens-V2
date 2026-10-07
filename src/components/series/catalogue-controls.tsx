"use client";

import clsx from "clsx";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  SERIES_STATUT_LABELS,
  SERIES_TYPE_LABELS,
  type SeriesStatus,
  type SeriesType,
} from "@/lib/types";

type Patch = Record<string, string | undefined>;

/** Lecture/écriture des filtres du catalogue directement dans l'URL. */
function useCatalogueUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const set = (patch: Patch) => {
    const next = new URLSearchParams(sp.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === "") next.delete(key);
      else next.set(key, value);
    }
    // Tout changement de filtre repart de la première page.
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return { sp, set };
}

const SORTS: Array<{ key: string; label: string }> = [
  { key: "alpha", label: "A → Z" },
  { key: "popularite", label: "Popularité" },
  { key: "nouveautes", label: "Nouveautés" },
  { key: "note", label: "Note" },
  { key: "maj", label: "Mise à jour" },
];

const TYPES: SeriesType[] = ["manga", "manhwa", "manhua"];
const STATUTS: SeriesStatus[] = ["en_cours", "termine", "hiatus", "abandonne"];

/** Menu déroulant « Tri » : contour fin, ordre A → Z en tête. */
export function SortMenu() {
  const { sp, set } = useCatalogueUrl();
  const sort = sp.get("sort") || "popularite";

  return (
    <div className="relative">
      <label htmlFor="catalogue-tri" className="sr-only">
        Trier le catalogue
      </label>
      <select
        id="catalogue-tri"
        value={sort}
        onChange={(event) => set({ sort: event.target.value })}
        className="input h-11 min-h-11 w-auto cursor-pointer appearance-none pr-8 text-sm font-medium"
      >
        {SORTS.map((option) => (
          <option key={option.key} value={option.key}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted"
      />
    </div>
  );
}

/**
 * Menu « Filtrer » : dropdown sur grand écran, tiroir plein écran sur mobile,
 * avec compteur de résultats et bouton « Réinitialiser ».
 */
export function FilterDrawer({
  genres,
  years,
  langues,
  total,
  adultAllowed,
  adultHref,
  keepQuery = false,
}: {
  genres: string[];
  years: number[];
  langues: string[];
  total: number;
  adultAllowed: boolean;
  adultHref: string;
  /** Sur /recherche : « Réinitialiser » retire les filtres sans le mot-clé. */
  keepQuery?: boolean;
}) {
  const { sp, set } = useCatalogueUrl();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const selectedGenres = (sp.get("genre") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const type = sp.get("type") ?? "";
  const statut = sp.get("statut") ?? "";
  const annee = sp.get("annee") ?? "";
  const langue = sp.get("langue") ?? "";
  const activeCount =
    selectedGenres.length + [type, statut, annee, langue].filter(Boolean).length;

  const toggleGenre = (genre: string) => {
    const next = selectedGenres.includes(genre)
      ? selectedGenres.filter((value) => value !== genre)
      : [...selectedGenres, genre];
    set({ genre: next.join(",") });
  };
  const toggle = (key: "type" | "statut" | "annee", value: string) =>
    set({ [key]: value === "" ? undefined : value });

  const group = (
    legend: string,
    children: React.ReactNode,
    key: string,
  ) => (
    <fieldset key={key}>
      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      key={label}
      onClick={onClick}
      aria-pressed={active}
      className={clsx("chip", active && "chip-active")}
    >
      {label}
    </button>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="catalogue-filtres"
        onClick={() => setOpen((value) => !value)}
        className="btn-secondary text-sm"
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filtrer
        {activeCount > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-primaryfg">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[65] bg-black/40 md:bg-transparent"
          />
          <div
            ref={panelRef}
            id="catalogue-filtres"
            role="dialog"
            aria-modal="true"
            aria-label="Filtres du catalogue"
            tabIndex={-1}
            className="fixed inset-0 z-[70] flex flex-col bg-surface outline-none md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:max-h-[75vh] md:w-80 md:rounded-lg md:border md:border-line md:shadow-xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
              <p className="font-semibold text-fg">Filtres</p>
              <button
                type="button"
                aria-label="Fermer les filtres"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="inline-flex size-11 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-fg"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              {group(
                "Genre",
                genres.map((genre) =>
                  chip(genre, selectedGenres.includes(genre), () => toggleGenre(genre)),
                ),
                "genres",
              )}

              {group(
                "Type",
                TYPES.map((value) =>
                  chip(
                    SERIES_TYPE_LABELS[value],
                    type === value,
                    () => toggle("type", type === value ? "" : value),
                  ),
                ),
                "types",
              )}

              {group(
                "Statut",
                STATUTS.map((value) =>
                  chip(
                    SERIES_STATUT_LABELS[value],
                    statut === value,
                    () => toggle("statut", statut === value ? "" : value),
                  ),
                ),
                "statuts",
              )}

              {group(
                "Année",
                years.map((year) =>
                  chip(
                    String(year),
                    annee === String(year),
                    () => toggle("annee", annee === String(year) ? "" : String(year)),
                  ),
                ),
                "annees",
              )}

              <div>
                <label htmlFor="catalogue-langue" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">
                  Langue
                </label>
                <select
                  id="catalogue-langue"
                  value={langue}
                  onChange={(event) => set({ langue: event.target.value })}
                  className="input h-11 min-h-11 w-full appearance-none text-sm"
                >
                  <option value="">Toutes</option>
                  {langues.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  Contenu
                </p>
                {adultAllowed ? (
                  <p className="text-sm text-muted">Contenu +18 affiché.</p>
                ) : (
                  <Link href={adultHref} className="btn-secondary text-sm">
                    Afficher le contenu +18
                  </Link>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p aria-live="polite" className="text-sm text-muted">
                Voir {total} {total > 1 ? "résultats" : "résultat"}
              </p>
              <button
                type="button"
                onClick={() =>
                  set({
                    genre: undefined,
                    type: undefined,
                    statut: undefined,
                    annee: undefined,
                    langue: undefined,
                    tag: undefined,
                    ...(keepQuery ? {} : { q: undefined }),
                  })
                }
                className="btn-secondary text-sm"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
