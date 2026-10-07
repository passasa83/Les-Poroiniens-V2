"use client";

import clsx from "clsx";
import Link from "next/link";
import { Bookmark, BookOpen, Check, Loader2, Pause, Play } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/kit";
import { libelleUnite } from "@/lib/format";
import type { Unite } from "@/lib/types";

export type HeroSlide = {
  id: string;
  slug: string;
  titre: string;
  cover: string;
  typeLabel: string;
  genres: string[];
  synopsis: string;
  /** Numéro du premier chapitre publié, ou `null` si la série n'en a pas. */
  chapitre: number | null;
  /** Chapitres ou tomes : « Lire le tome 3 ». */
  unite: Unite;
  isAdult: boolean;
  /** Série déjà présente dans la bibliothèque du membre connecté. */
  followed: boolean;
};

/* `matchMedia` n'est accessible que côté client : le snapshot serveur renvoie
   `false`, l'état réel est lu à l'hydratation. */
function subscribeReduced(listener: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", listener);
  return () => mq.removeEventListener("change", listener);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * Héros « À la une » : visuel, titre, genres, synopsis court, accès au
 * premier chapitre et suivi. Défilement automatique toutes les 7 s, en pause au
 * survol / au focus, désactivé sous `prefers-reduced-motion` et par le bouton
 * de pause.
 */
export function Hero({ slides, authed }: { slides: HeroSlide[]; authed: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(slides.map((s) => [s.id, s.followed])),
  );
  const reduced = usePrefersReducedMotion();
  const total = slides.length;

  useEffect(() => {
    if (total < 2 || paused || !auto || reduced) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % total), 7000);
    return () => window.clearInterval(timer);
  }, [total, paused, auto, reduced]);

  if (total === 0) return null;

  async function toggleFollow(target: HeroSlide) {
    if (busy) return;
    setBusy(target.id);
    try {
      const res = await fetch("/api/reading/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seriesId: target.id,
          statut: followed[target.id] ? null : "en_cours",
        }),
      });
      if (res.ok) setFollowed((prev) => ({ ...prev, [target.id]: !followed[target.id] }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="À la une"
      aria-roledescription="carrousel"
      className="relative overflow-hidden rounded-xl border border-line bg-surface"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative h-[360px] sm:h-[400px] lg:h-[440px]">
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={s.id}
              aria-hidden={!active}
              inert={!active}
              className={clsx(
                "absolute inset-0 transition-opacity duration-500",
                active ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.cover}
                alt=""
                width={1280}
                height={720}
                loading={i === 0 ? "eager" : "lazy"}
                /* LCP de l'accueil : la première diapositive est
                   prioritaire, les suivantes sont différées. */
                fetchPriority={i === 0 ? "high" : "auto"}
                decoding={i === 0 ? "sync" : "async"}
                className="absolute inset-0 size-full object-cover object-top"
              />
              {/* Voile dégradé : le texte reste lisible sur n'importe quelle image */}
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/85 to-bg/25" />
              <div className="absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/40 to-transparent" />

              <div className="absolute inset-0 flex items-end">
                <div className="container-site w-full pb-14 sm:pb-16">
                  <div className="max-w-2xl space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{s.typeLabel}</Badge>
                      {s.genres.slice(0, 3).map((g) => (
                        <span key={g} className="meta">
                          {g}
                        </span>
                      ))}
                      {s.isAdult && <Badge tone="adult">+18</Badge>}
                    </div>

                    <h2 className="text-2xl font-bold leading-tight text-fg sm:text-3xl">
                      {s.titre}
                    </h2>
                    {s.synopsis && (
                      <p className="line-clamp-2 text-sm text-muted sm:line-clamp-3">
                        {s.synopsis}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {s.chapitre !== null && (
                        <Link href={`/serie/${s.slug}/chapitre-${s.chapitre}`} className="btn-primary">
                          <BookOpen className="size-4" />
                          Lire {libelleUnite(s.chapitre, s.unite)}
                        </Link>
                      )}
                      {authed ? (
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={busy === s.id}
                          aria-pressed={followed[s.id]}
                          onClick={() => toggleFollow(s)}
                        >
                          {busy === s.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : followed[s.id] ? (
                            <Check className="size-4" />
                          ) : (
                            <Bookmark className="size-4" />
                          )}
                          {followed[s.id] ? "Suivie" : "Suivre"}
                        </button>
                      ) : (
                        <Link href="/inscription" className="btn-secondary">
                          <Bookmark className="size-4" />
                          Suivre
                        </Link>
                      )}
                      <Link href={`/serie/${s.slug}`} className="btn-ghost">
                        Voir la fiche
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {total > 1 && (
        <div className="absolute bottom-2 right-3 z-10 flex items-center">
          {/* Sans rotation automatique (mouvement réduit), inutile de proposer une pause */}
          {!reduced && (
            <button
              type="button"
              className="grid h-11 w-11 place-items-center text-muted hover:text-fg"
              aria-pressed={!auto}
              aria-label={auto ? "Mettre le défilement automatique en pause" : "Reprendre le défilement automatique"}
              title={auto ? "Pause" : "Lecture"}
              onClick={() => setAuto((v) => !v)}
            >
              {auto ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
          )}
          <div className="flex items-center" role="group" aria-label="Choisir une diapositive">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="grid h-11 w-11 place-items-center"
                aria-label={`${i + 1} sur ${total} : ${s.titre}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
              >
                <span
                  className={clsx(
                    "block size-2 rounded-full transition-colors",
                    i === index ? "bg-accent" : "bg-muted/70",
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
