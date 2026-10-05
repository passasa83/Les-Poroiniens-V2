"use client";

import clsx from "clsx";
import { Heart, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

/** Ligne de chapitre telle que préparée côté serveur (§6.5). */
export type ChapterRow = {
  id: string;
  numero: number;
  titre: string;
  volume: number | null;
  /** Libellé de date déjà formate (relatif sous 7 jours). */
  date: string;
  pages: number;
  likes: number;
  href: string;
  lu: boolean;
  /** Dernière page atteinte, null si le chapitre est inachevé ou inconnu. */
  page: number | null;
};

/**
 * Liste des chapitres : recherche instantanée dans la liste, état lu/non lu
 * avec case à cocher (§6.5) et scroll interne au-delà de 100 chapitres.
 * L'ordre (croissant/décroissant) reste piloté par l'URL.
 */
export function ChapterList({
  chapters,
  seriesId,
  orderHref,
  orderLabel,
  canMark,
}: {
  chapters: ChapterRow[];
  seriesId: string;
  orderHref: string;
  orderLabel: string;
  canMark: boolean;
}) {
  const [query, setQuery] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return chapters;
    return chapters.filter(
      (c) =>
        String(c.numero).includes(needle) ||
        c.titre.toLowerCase().includes(needle),
    );
  }, [chapters, query]);

  const scrollable = chapters.length > 100;

  async function toggle(chapter: ChapterRow, lu: boolean) {
    const previous = overrides[chapter.id] ?? chapter.lu;
    setOverrides((old) => ({ ...old, [chapter.id]: lu }));
    try {
      const res = await fetch("/api/reading/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              chapterId: chapter.id,
              seriesId,
              page: lu ? chapter.pages : 0,
              completed: lu,
            },
          ],
        }),
      });
      if (!res.ok) throw new Error("progression refusée");
    } catch {
      /* Repli sur l'état précédent si l'écriture a échoué. */
      setOverrides((old) => ({ ...old, [chapter.id]: previous }));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un chapitre"
            aria-label="Rechercher un chapitre"
            className="input w-full min-h-11 pl-9"
          />
        </div>
        <Link href={orderHref} className="btn-ghost shrink-0 text-sm">
          {orderLabel}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">Aucun chapitre ne correspond à « {query} ».</p>
      ) : (
        <ul
          className={clsx(
            "divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface",
            scrollable && "max-h-[420px] overflow-y-auto",
          )}
        >
          {rows.map((chapter) => {
            const lu = overrides[chapter.id] ?? chapter.lu;
            return (
              <li key={chapter.id}>
                <div className="flex items-center gap-3 px-4 transition-colors hover:bg-surface2">
                  <span className="w-14 shrink-0 text-sm font-bold text-primary">
                    Ch. {chapter.numero}
                  </span>
                  <Link
                    href={chapter.href}
                    /* py-3 reporté sur le lien : la zone de clic occupe toute
                       la hauteur de la ligne (44 px, §8.1) sans changer la
                       hauteur de la rangée. */
                    className="min-w-0 flex-1 truncate py-3 text-sm text-fg hover:text-primary"
                  >
                    {chapter.titre || `Chapitre ${chapter.numero}`}
                    {chapter.volume !== null && (
                      <span className="ml-2 text-xs text-muted">Vol. {chapter.volume}</span>
                    )}
                  </Link>
                  <span className="hidden shrink-0 text-xs text-muted md:block">
                    {chapter.date}
                  </span>
                  {chapter.likes > 0 && (
                    <span className="hidden shrink-0 items-center gap-1 text-xs text-muted sm:flex">
                      <Heart aria-hidden className="size-3.5" />
                      {chapter.likes}
                    </span>
                  )}
                  <span className="w-14 shrink-0 text-right text-xs text-muted">
                    {chapter.pages} p.
                  </span>
                  {canMark ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={lu}
                        onChange={(event) => toggle(chapter, event.target.checked)}
                        className="size-4 accent-primary"
                        aria-label={`Marquer le chapitre ${chapter.numero} comme lu`}
                      />
                      <span className="hidden sm:inline">{lu ? "Lu" : "Non lu"}</span>
                    </label>
                  ) : (
                    <span className="w-20 shrink-0" aria-hidden />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
