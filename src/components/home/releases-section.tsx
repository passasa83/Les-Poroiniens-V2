"use client";

import clsx from "clsx";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/kit";
import { libelleUnite, relativeTime } from "@/lib/format";
import type { ReleaseDto } from "@/lib/dto";
import type { SeriesType, Unite } from "@/lib/types";

type Tab = "" | SeriesType;

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "", label: "Tout" },
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
];

type ReleaseCard = {
  key: string;
  slug: string;
  titre: string;
  cover: string;
  isAdult: boolean;
  /** Chapitres ou tomes : « Tome 3 » sur chaque ligne. */
  unite: Unite;
  publishAt: string | null;
  chapters: Array<{ id: string; numero: number }>;
};

/** Les chapitres arrivent triés du plus récent au plus ancien : on fusionne
 *  par série (une seule carte par œuvre, 3 derniers chapitres au maximum),
 * y compris entre les pages de « Charger plus » et les onglets. */
function groupReleases(items: ReleaseDto[]): ReleaseCard[] {
  const MAX_CHAPITRES = 3;
  const cartes = new Map<string, ReleaseCard>();
  for (const it of items) {
    const carte = cartes.get(it.series.slug);
    if (carte) {
      if (carte.chapters.length < MAX_CHAPITRES) {
        carte.chapters.push({ id: it.id, numero: it.numero });
      }
      continue;
    }
    cartes.set(it.series.slug, {
      key: it.series.slug,
      slug: it.series.slug,
      titre: it.series.titre,
      cover: it.series.couverture,
      isAdult: it.series.classification === "adult" || it.classification === "adult",
      unite: it.series.unite,
      publishAt: it.publishAt,
      chapters: [{ id: it.id, numero: it.numero }],
    });
  }
  return [...cartes.values()];
}

/**
 * « Dernières sorties » : onglets [Tout][Manga][Manhwa][Manhua] et
 * « Charger plus (n / total) ». L'état initial est rendu côté serveur, les
 * pages suivantes passent par GET /api/home/releases.
 */
export function ReleasesSection({
  initialItems,
  initialTotal,
  adultAllowed,
}: {
  initialItems: ReleaseDto[];
  initialTotal: number;
  adultAllowed: boolean;
}) {
  const [type, setType] = useState<Tab>("");
  const [items, setItems] = useState<ReleaseDto[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  async function load(nextType: Tab, nextPage: number) {
    const id = ++request.current;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/home/releases?type=${encodeURIComponent(nextType)}&page=${nextPage}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        items: ReleaseDto[];
        total: number;
        page: number;
      };
      if (request.current !== id) return; // réponse d'une requête antérieure
      setItems((prev) => (nextPage === 1 ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
      setPage(data.page);
      setType(nextType);
    } catch {
      if (request.current === id) {
        setError("Chargement impossible : réessayez dans un instant.");
      }
    } finally {
      if (request.current === id) setBusy(false);
    }
  }

  const cards = groupReleases(items).filter((c) => adultAllowed || !c.isAdult);

  return (
    <section aria-busy={busy}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="section-title">Dernières sorties</h2>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par format">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={clsx("chip", type === tab.value && "chip-active")}
              aria-pressed={type === tab.value}
              disabled={busy}
              onClick={() => {
                if (tab.value !== type && !busy) void load(tab.value, 1);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={clsx(
          "mt-4 grid grid-cols-2 gap-4 transition-opacity duration-200 sm:grid-cols-3 lg:grid-cols-4",
          busy && "opacity-60",
        )}
      >
        {cards.map((card) => (
          <article key={card.key} className="card overflow-hidden p-0">
            <Link
              href={`/serie/${card.slug}`}
              className="group block overflow-hidden"
              aria-label={card.titre}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.cover}
                alt=""
                width={600}
                height={900}
                loading="lazy"
                decoding="async"
                className="aspect-[2/3] w-full bg-surface2 object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </Link>
            <div className="space-y-1.5 p-3">
              <Link
                href={`/serie/${card.slug}`}
                className="flex min-h-11 items-center truncate text-sm font-semibold text-fg hover:text-primary"
              >
                {card.titre}
              </Link>
              <p className="meta">{relativeTime(card.publishAt)}</p>
              <ul className="space-y-0.5">
                {card.chapters.map((ch) => (
                  <li key={ch.id}>
                    <Link
                      href={`/serie/${card.slug}/chapitre-${ch.numero}`}
                      className="meta underline-offset-2 hover:text-fg hover:underline"
                    >
                      {libelleUnite(ch.numero, card.unite)}
                    </Link>
                  </li>
                ))}
              </ul>
              {card.isAdult && <Badge tone="adult">+18</Badge>}
            </div>
          </article>
        ))}
      </div>

      {error && (
        <p className="mt-4 text-sm text-adult" role="alert">
          {error}
        </p>
      )}

      {items.length < total && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => void load(type, page + 1)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Charger plus ({items.length} / {total})
          </button>
        </div>
      )}
    </section>
  );
}
