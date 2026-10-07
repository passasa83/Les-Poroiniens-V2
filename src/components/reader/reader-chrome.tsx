"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Flag, Maximize, Minimize, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Délai d’inactivité avant le masquage automatique des barres. */
const IDLE_MS = 2600;
/** Distance de défilement (px) nécessaire pour changer d’avis sur la visibilité. */
const SCROLL_STEP = 24;

/**
 * Visibilité des barres du lecteur : visible au mouvement de souris ou de
 * doigt et au retour de défilement, masquée pendant la lecture après le délai
 * d’inactivité, et toujours masquée quand le lecteur sort du champ (le site
 * reprend alors la main). `prefers-reduced-motion` neutralise la transition
 * via les règles globales et `motion-reduce:*`.
 */
export function useReaderChrome(
  zoneRef: RefObject<HTMLElement | null>,
  hold: boolean,
): { hidden: boolean; inView: boolean; reveal: () => void; hide: () => void } {
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inViewRef = useRef(true);

  const stop = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const reveal = useCallback(() => {
    if (!inViewRef.current) return;
    setVisible(true);
    stop();
    timer.current = setTimeout(() => setVisible(false), IDLE_MS);
  }, [stop]);

  const hide = useCallback(() => {
    stop();
    setVisible(false);
  }, [stop]);

  // Mouvement souris / tactile / clavier : on montre les barres, puis on repart en veille.
  useEffect(() => {
    window.addEventListener("pointermove", reveal, { passive: true });
    window.addEventListener("touchstart", reveal, { passive: true });
    window.addEventListener("keydown", reveal);
    reveal();
    return () => {
      stop();
      window.removeEventListener("pointermove", reveal);
      window.removeEventListener("touchstart", reveal);
      window.removeEventListener("keydown", reveal);
    };
  }, [reveal, stop]);

  // Défilement : masqué vers le bas, révélé au retour vers le haut (motif de header-shell).
  useEffect(() => {
    let anchor = window.scrollY;
    let ticking = false;

    const measure = () => {
      ticking = false;
      const y = window.scrollY;
      if (y <= 120) {
        anchor = y;
        reveal();
      } else if (y > anchor + SCROLL_STEP) {
        anchor = y;
        hide();
      } else if (y < anchor - SCROLL_STEP) {
        anchor = y;
        reveal();
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [reveal, hide]);

  // Hors du champ : plus de barres, le site reprend la main.
  useEffect(() => {
    const el = zoneRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        inViewRef.current = entry.isIntersecting;
        setInView(entry.isIntersecting);
        if (entry.isIntersecting) reveal();
        else hide();
      },
      { threshold: 0.02 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [zoneRef, reveal, hide]);

  // Un tiroir ouvert force la présence des barres.
  return { hidden: hold ? false : !visible, inView, reveal, hide };
}

/** Barre supérieure : retour à la série, titre + sélecteur de chapitre, réglages, signalement. */
export function ReaderTopBar({
  hidden,
  serieHref,
  serieTitre,
  chapitres,
  courant,
  settingsOpen,
  onSettings,
  onReport,
  fullscreen,
  onFullscreen,
}: {
  hidden: boolean;
  serieHref: string;
  serieTitre: string;
  chapitres: Array<{ numero: number; href: string }>;
  courant: string;
  settingsOpen: boolean;
  onSettings: () => void;
  onReport: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}) {
  const router = useRouter();

  return (
    <header
      data-hidden={hidden ? "true" : "false"}
      data-reader-bar="haut"
      className="fixed inset-x-0 top-0 z-50 h-16 border-b border-line bg-header/95 text-fg backdrop-blur transition-transform duration-200 motion-reduce:transition-none data-[hidden=true]:-translate-y-full"
    >
      <div className="mx-auto flex h-full w-full max-w-7xl items-center gap-2 px-3 sm:px-6 lg:px-8">
        <Link
          href={serieHref}
          className="btn-ghost shrink-0 px-2"
          aria-label={`Retour à la série ${serieTitre}`}
        >
          <ArrowLeft className="size-4" />
          <span className="hidden sm:inline">Retour</span>
        </Link>

        <p className="hidden min-w-0 truncate text-sm font-semibold text-fg md:block">{serieTitre}</p>

        <select
          className="min-h-11 min-w-0 max-w-[9rem] rounded-lg border border-line bg-surface2 px-2 text-xs font-semibold text-fg sm:max-w-none"
          aria-label="Sélecteur de chapitre"
          value={courant}
          onChange={(e) => {
            const href = e.target.value;
            if (href) router.push(href);
          }}
        >
          {chapitres.map((c) => (
            <option key={c.numero} value={c.href}>
              Chapitre {c.numero}
            </option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            className="btn-ghost px-2"
            aria-label="Réglages du lecteur"
            aria-expanded={settingsOpen}
            onClick={onSettings}
          >
            <Settings2 className="size-4" />
          </button>
          <button
            type="button"
            className="btn-ghost px-2"
            aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
            onClick={onFullscreen}
          >
            {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
          </button>
          <button
            type="button"
            className="btn-ghost px-2 text-xs"
            aria-label="Signaler une erreur"
            onClick={onReport}
          >
            <Flag className="size-4" />
            <span className="hidden sm:inline">Signaler</span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** Barre inférieure : numéro de page, progression cliquable, chapitre précédent / suivant. */
export function ReaderBottomBar({
  hidden,
  page,
  total,
  onSeek,
  prevHref,
  nextHref,
}: {
  hidden: boolean;
  page: number;
  total: number;
  onSeek: (index: number) => void;
  prevHref: string | null;
  nextHref: string | null;
}) {
  return (
    <footer
      data-hidden={hidden ? "true" : "false"}
      data-reader-bar="bas"
      className="fixed inset-x-0 bottom-0 z-50 h-14 border-t border-line bg-header/95 text-fg backdrop-blur transition-transform duration-200 motion-reduce:transition-none data-[hidden=true]:translate-y-full"
    >
      <div className="mx-auto flex h-full w-full max-w-7xl items-center gap-3 px-3 sm:px-6 lg:px-8">
        <span className="shrink-0 text-xs font-semibold tabular-nums text-fg" aria-hidden="true">
          {page + 1} / {total}
        </span>
        <span className="sr-only">
          Page {page + 1} sur {total}
        </span>

        <input
          type="range"
          className="reader-progress min-h-11 w-full flex-1 accent-primary"
          min={0}
          max={Math.max(total - 1, 0)}
          step={1}
          value={page}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="Progression de lecture"
        />

        {prevHref ? (
          <Link href={prevHref} className="btn-ghost shrink-0 px-2" aria-label="Chapitre précédent">
            <ChevronLeft className="size-4" />
            <span className="hidden md:inline">Précédent</span>
          </Link>
        ) : (
          <button
            type="button"
            className="btn-ghost shrink-0 px-2"
            aria-label="Chapitre précédent"
            disabled
          >
            <ChevronLeft className="size-4" />
            <span className="hidden md:inline">Précédent</span>
          </button>
        )}

        {nextHref ? (
          <Link href={nextHref} className="btn-ghost shrink-0 px-2" aria-label="Chapitre suivant">
            <span className="hidden md:inline">Suivant</span>
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <button
            type="button"
            className="btn-ghost shrink-0 px-2"
            aria-label="Chapitre suivant"
            disabled
          >
            <span className="hidden md:inline">Suivant</span>
            <ChevronRight className="size-4" />
          </button>
        )}
      </div>
    </footer>
  );
}
