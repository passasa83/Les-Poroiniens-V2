"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight, Flag, ImageOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChapterLike } from "./chapter-like";
import { ReaderBottomBar, ReaderTopBar, useReaderChrome } from "./reader-chrome";
import { ReportDialog } from "./reader-report";
import {
  READER_MODES,
  ReaderSettings,
  type ReaderFit,
  type ReaderMode,
  type ReaderSens,
  type ReaderTheme,
} from "./reader-settings";
import { libelleUnite, libelleUniteSingulier, libelleVoisin } from "@/lib/format";
import type { Unite } from "@/lib/types";

/* ── Clés de stockage local (« réglages mémorisés ») ───────────── */
/** Mode : global, le même pour toutes les séries. */
const MODE_KEY = "lp-reader-mode";
/** Sens : mémorisé par série (prioritaire sur la préférence du compte). */
const SENS_KEY = "lp-reader-sens:";
const FIT_KEY = "lp-reader-fit";
const WIDTH_KEY = "lp-reader-width";
const MAXW_KEY = "lp-reader-maxw";
const THEME_KEY = "lp-reader-theme";
const BRIGHT_KEY = "lp-reader-brightness";
const SOLO_KEY = "lp-reader-first-solo";
/** Progression des visiteurs : reprise sans compte. */
const progressKey = (chapterId: string) => `lp-progress:${chapterId}`;

const FITS: ReaderFit[] = ["auto", "largeur", "hauteur", "perso"];
const THEMES: ReaderTheme[] = ["site", "clair", "noir"];

export type ReaderPage = { index: number; url: string; largeur?: number; hauteur?: number };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* stockage indisponible : réglages non mémorisés */
    }
  },
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Lecteur de scans : chrome immersif auto-masquable (barre haute avec
 * sélecteur de chapitre, barre inférieure avec progression), modes webtoon /
 * page / double page, sens mémorisé par série, ajustement, thème et
 * luminosité, zones tactiles, molette, raccourcis clavier, plein écran,
 * progression (compte ou local), signalement et écran de fin dédié.
 */
export function Reader({
  pages,
  chapterId,
  chapterNumero,
  serieId,
  serieSlug,
  serieTitre,
  unite,
  chapitres,
  initialMode,
  initialSens,
  initialPage = 1,
  canProgress = false,
  canSync = false,
  initialLikes = 0,
  prevHref = null,
  nextHref = null,
  nextChapterId = null,
}: {
  pages: ReaderPage[];
  chapterId: string;
  chapterNumero: number;
  serieId: string;
  serieSlug: string;
  serieTitre: string;
  /** Organisation de la série : « Tome 3 » au lieu de « Chapitre 3 ». */
  unite?: Unite | null;
  /** Chapitres de la série, pour le sélecteur de la barre haute. */
  chapitres: Array<{ numero: number; href: string }>;
  initialMode?: ReaderMode;
  initialSens?: ReaderSens;
  initialPage?: number;
  canProgress?: boolean;
  /** Envoi des préférences au compte (fire-and-forget, debouncé). */
  canSync?: boolean;
  initialLikes?: number;
  prevHref?: string | null;
  nextHref?: string | null;
  /** Sert au préchargement de la première page du chapitre suivant. */
  nextChapterId?: string | null;
}) {
  const total = pages.length;
  const lastIndex = Math.max(total - 1, 0);

  const [mode, setMode] = useState<ReaderMode>(initialMode ?? "vertical");
  const [sens, setSens] = useState<ReaderSens>(initialSens ?? "rtl");
  const [fit, setFit] = useState<ReaderFit>("auto");
  const [width, setWidth] = useState(100);
  const [maxw, setMaxw] = useState(900);
  const [theme, setTheme] = useState<ReaderTheme>("site");
  const [brightness, setBrightness] = useState(1);
  const [firstSolo, setFirstSolo] = useState(false);
  const [page, setPage] = useState(() => clamp(initialPage - 1, 0, lastIndex));
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPage, setReportPage] = useState<number | null>(null);
  /** État post-hydration : les préférences et la reprise sont lues en différé. */
  const [hydrated, setHydrated] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(page);
  const modeRef = useRef(mode);
  const sensRef = useRef(sens);
  const resumeDoneRef = useRef(false);
  const lastSentRef = useRef(0);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pages dont le chargement a échec après reprise, envoyées par lots. */
  const failedRef = useRef<Set<number>>(new Set());
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    sensRef.current = sens;
  }, [sens]);

  /* ── Chrome immersif : visible au mouvement, masqué en lecture ─────── */
  const { hidden: chromeHidden, inView, reveal, hide } = useReaderChrome(
    containerRef,
    settingsOpen,
  );

  useEffect(() => {
    // Le site entier bascule en immersion tant que le lecteur est à l'écran :
    // l'en-tête du site se masque (motif de `layout/header-shell.tsx`).
    document.body.dataset.readerImmersive = inView ? "on" : "off";
    return () => {
      delete document.body.dataset.readerImmersive;
    };
  }, [inView]);

  /* ── Préférences mémorisées côté client (après hydration) ─────────── */
  useEffect(() => {
    // différé d'un tick : un setState synchrone dans un effet provoquerait
    // un rendu en cascade au montage
    const timer = window.setTimeout(() => {
      let resumeIndex = -1;
      try {
        const savedMode = store.get(MODE_KEY);
        if (savedMode === "vertical" || savedMode === "single" || savedMode === "double") {
          setMode(savedMode);
        }
        // Sens : local par série > préférence du compte > défaut
        const savedSens = store.get(SENS_KEY + serieId);
        if (savedSens === "ltr" || savedSens === "rtl") setSens(savedSens);

        const savedFit = store.get(FIT_KEY);
        if (savedFit && FITS.includes(savedFit as ReaderFit)) setFit(savedFit as ReaderFit);

        const savedWidth = Number(store.get(WIDTH_KEY));
        if (savedWidth >= 50 && savedWidth <= 100) setWidth(savedWidth);

        const savedMaxw = Number(store.get(MAXW_KEY));
        if (savedMaxw >= 320 && savedMaxw <= 1600) setMaxw(savedMaxw);

        const savedTheme = store.get(THEME_KEY);
        if (savedTheme && THEMES.includes(savedTheme as ReaderTheme)) {
          setTheme(savedTheme as ReaderTheme);
        }

        const savedBrightness = Number(store.get(BRIGHT_KEY));
        if (savedBrightness >= 0.6 && savedBrightness <= 1.3) setBrightness(savedBrightness);

        const savedSolo = store.get(SOLO_KEY);
        if (savedSolo === "1" || savedSolo === "0") setFirstSolo(savedSolo === "1");

        // Reprise : l'historique du compte l'emporte, sinon la progression locale
        resumeIndex = clamp(initialPage - 1, 0, lastIndex);
        if (initialPage <= 1) {
          const local = Number(store.get(progressKey(chapterId)));
          if (Number.isFinite(local) && local >= 1) resumeIndex = clamp(local - 1, 0, lastIndex);
        }
      } catch {
        /* stockage indisponible : on garde les préférences du profil */
      }
      if (resumeIndex > 0) setPage(resumeIndex);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [serieId, chapterId, initialPage, lastIndex]);

  /* ── Défilement vers une page (le mode réduit supprime l’animation) ── */
  const scrollToPage = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current?.querySelector(`#reader-page-${index}`);
    const reduce = prefersReducedMotion();
    el?.scrollIntoView({ behavior: reduce ? "auto" : behavior, block: "start" });
  }, []);

  /* ── Reprise à la page exacte ───────────────────────────────── */
  useEffect(() => {
    if (!hydrated || resumeDoneRef.current || page <= 0) return;
    resumeDoneRef.current = true;
    if (mode !== "vertical") return; // en mode page, la bonne planche est déjà affichée
    scrollToPage(page, "auto");
    const timer = window.setTimeout(reveal, 400);
    return () => window.clearTimeout(timer);
  }, [hydrated, page, mode, scrollToPage, reveal]);

  /* ── Préférences : local + compte ──────────────────────────────────── */
  const syncPrefs = useCallback(() => {
    if (!canSync) return;
    if (prefsTimer.current) clearTimeout(prefsTimer.current);
    // Fire-and-forget : la synchro n'est jamais bloquante.
    prefsTimer.current = setTimeout(() => {
      void fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode_lecture: modeRef.current,
          sens_lecture: sensRef.current,
        }),
        keepalive: true,
      }).catch(() => undefined);
    }, 800);
  }, [canSync]);

  const changeMode = useCallback(
    (next: ReaderMode) => {
      setMode(next);
      store.set(MODE_KEY, next);
      syncPrefs();
    },
    [syncPrefs],
  );

  const changeSens = useCallback(
    (next: ReaderSens) => {
      setSens(next);
      store.set(SENS_KEY + serieId, next);
      syncPrefs();
    },
    [serieId, syncPrefs],
  );

  const changeFit = useCallback((next: ReaderFit) => {
    setFit(next);
    store.set(FIT_KEY, next);
  }, []);
  const changeWidth = useCallback((next: number) => {
    setWidth(next);
    store.set(WIDTH_KEY, String(next));
  }, []);
  const changeMaxw = useCallback((next: number) => {
    setMaxw(next);
    store.set(MAXW_KEY, String(next));
  }, []);
  const changeTheme = useCallback((next: ReaderTheme) => {
    setTheme(next);
    store.set(THEME_KEY, next);
  }, []);
  const changeBrightness = useCallback((next: number) => {
    setBrightness(next);
    store.set(BRIGHT_KEY, String(next));
  }, []);
  const changeFirstSolo = useCallback((next: boolean) => {
    setFirstSolo(next);
    store.set(SOLO_KEY, next ? "1" : "0");
  }, []);

  const cycleMode = useCallback(() => {
    const index = READER_MODES.findIndex((m) => m.key === modeRef.current);
    const next = READER_MODES[(index + 1) % READER_MODES.length].key;
    changeMode(next);
  }, [changeMode]);

  /* ── Navigation ───────────────────────────────────────────────────── */

  const goTo = useCallback(
    (target: number) => {
      if (mode === "double") {
        setPage(clamp(Math.round(target / 2) * 2, 0, lastIndex));
        return;
      }
      const next = clamp(target, 0, lastIndex);
      setPage(next);
      if (mode === "vertical") scrollToPage(next);
    },
    [mode, lastIndex, scrollToPage],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      const delta = mode === "double" ? 2 : 1;
      goTo(pageRef.current + direction * delta);
    },
    [mode, goTo],
  );

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  }, []);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => !open);
    reveal();
  }, [reveal]);

  const openReport = useCallback(
    (index?: number | null) => {
      setSettingsOpen(false);
      setReportPage(typeof index === "number" ? index : null);
      setReportOpen(true);
    },
    [],
  );

  /* ── Raccourcis clavier ─────────────────────────────────────── */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Échap : tiroir > modale > plein écran
      if (event.key === "Escape") {
        if (settingsOpen) {
          event.preventDefault();
          setSettingsOpen(false);
          return;
        }
        if (reportOpen) return; // la modale se ferme elle-même
        if (document.fullscreenElement) void document.exitFullscreen();
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const forward: 1 | -1 = sens === "rtl" ? -1 : 1;
      const backward: 1 | -1 = sens === "rtl" ? 1 : -1;

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          step(forward);
          break;
        case "ArrowLeft":
          event.preventDefault();
          step(backward);
          break;
        case "ArrowDown":
          event.preventDefault();
          step(1);
          break;
        case "ArrowUp":
          event.preventDefault();
          step(-1);
          break;
        case " ":
          event.preventDefault();
          step(1);
          break;
        case "f":
        case "F":
          event.preventDefault();
          toggleFullscreen();
          break;
        case "m":
        case "M":
          event.preventDefault();
          toggleSettings();
          break;
        case "d":
        case "D":
          event.preventDefault();
          cycleMode();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sens, step, toggleFullscreen, toggleSettings, cycleMode, settingsOpen, reportOpen]);

  /* ── Plein écran ──────────────────────────────────────────────────── */
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* ── Molette : une page par cran, débouncée à 250 ms ───────── */
  useEffect(() => {
    const el = pagesRef.current;
    if (!el || mode === "vertical") return;
    let locked = false;
    let lockTimer: number | null = null;

    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaY) < 8) return;
      const index = pageRef.current;
      // Aux extrémités, on laisse défiler normalement (fin de chapitre, commentaires).
      if (event.deltaY > 0 ? index >= lastIndex : index <= 0) return;
      event.preventDefault();
      if (locked) return;
      locked = true;
      lockTimer = window.setTimeout(() => {
        locked = false;
        lockTimer = null;
      }, 250);
      step(event.deltaY > 0 ? 1 : -1);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (lockTimer !== null) window.clearTimeout(lockTimer);
    };
  }, [mode, step, lastIndex]);

  /* ── Suivi du scroll en mode vertical ─────────────────────────────── */
  useEffect(() => {
    if (mode !== "vertical") return;
    let frame: number | null = null;
    function onScroll() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        let best = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        containerRef.current
          ?.querySelectorAll("[id^='reader-page-']")
          .forEach((el, index) => {
          if (!el) return;
          const dist = Math.abs(el.getBoundingClientRect().top - 72);
          if (dist < bestDist) {
            bestDist = dist;
            best = index;
          }
        });
        setPage((current) => (current === best ? current : best));
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [mode]);

  /* ── Sauvegarde de la progression (lots, debounce 2 s, max 1/10 s) ─ */
  const send = useCallback(async () => {
    lastSentRef.current = Date.now();
    const current = pageRef.current;
    try {
      await fetch("/api/reading/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              chapterId,
              page: current + 1,
              completed: current >= lastIndex,
            },
          ],
        }),
        keepalive: true,
      });
    } catch {
      /* échec silencieux : la progression n’est pas bloquante */
    }
  }, [chapterId, lastIndex]);

  useEffect(() => {
    if (!canProgress) return;
    if (sendTimer.current) clearTimeout(sendTimer.current);
    if (throttleTimer.current) clearTimeout(throttleTimer.current);

    sendTimer.current = setTimeout(() => {
      const wait = Math.max(0, 10_000 - (Date.now() - lastSentRef.current));
      if (wait > 0) {
        throttleTimer.current = setTimeout(() => void send(), wait);
      } else {
        void send();
      }
    }, 2000);

    return () => {
      if (sendTimer.current) clearTimeout(sendTimer.current);
      if (throttleTimer.current) clearTimeout(throttleTimer.current);
    };
  }, [page, canProgress, send]);

  useEffect(() => {
    if (!canProgress) return;
    const onHide = () => void send();
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [canProgress, send]);

  /* ── Progression locale des visiteurs (« reprise ») ───────────── */
  const saveLocalProgress = useCallback(() => {
    store.set(progressKey(chapterId), String(pageRef.current + 1));
  }, [chapterId]);

  useEffect(() => {
    const timer = window.setTimeout(saveLocalProgress, 2000);
    return () => window.clearTimeout(timer);
  }, [page, saveLocalProgress]);

  useEffect(() => {
    window.addEventListener("pagehide", saveLocalProgress);
    return () => window.removeEventListener("pagehide", saveLocalProgress);
  }, [saveLocalProgress]);

  /* ── Échecs de chargement : remontée groupée ─────────────────── */
  const flushFailures = useCallback(async () => {
    const indexes = [...failedRef.current];
    if (indexes.length === 0) return;
    failedRef.current.clear();
    try {
      await fetch("/api/telemetry/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId, indexes }),
        keepalive: true,
      });
    } catch {
      /* la télémétrie n'est jamais bloquante */
    }
  }, [chapterId]);

  const onPageFailed = useCallback(
    (index: number) => {
      failedRef.current.add(index);
      if (failTimer.current) clearTimeout(failTimer.current);
      failTimer.current = setTimeout(() => void flushFailures(), 2000);
    },
    [flushFailures],
  );

  useEffect(
    () => () => {
      if (failTimer.current) clearTimeout(failTimer.current);
      if (prefsTimer.current) clearTimeout(prefsTimer.current);
    },
    [],
  );

  /* ── Swipe tactile ────────────────────────────────────────────────── */
  const touch = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(event: React.TouchEvent) {
    const t = event.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(event: React.TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return;
    const forward: 1 | -1 = sens === "rtl" ? -1 : 1;
    step(dx < 0 ? forward : sens === "rtl" ? 1 : -1);
  }

  /* ── Rendu ────────────────────────────────────────────────────────── */
  const isLast = page >= lastIndex;
  const showEnd = mode === "vertical" || isLast;
  /** Une planche paysage s'affiche seule ; la première page aussi si demandé. */
  const soloSpread = useMemo(
    () => isLandscape(pages[page]) || (firstSolo && page === 0),
    [pages, page, firstSolo],
  );
  /** Ajustement « hauteur » : une planche tient dans la fenêtre (page / double). */
  const fitHeight = fit === "hauteur" && mode !== "vertical";

  const contentStyle = useMemo<React.CSSProperties>(() => {
    if (fit === "perso") {
      return { width: "100%", maxWidth: `${clamp(maxw, 320, 2000)}px` };
    }
    if (fit === "largeur") return { width: `${clamp(width, 50, 100)}%` };
    return { width: "100%" };
  }, [fit, maxw, width]);

  const zoneStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {};
    if (fitHeight) style.height = "calc(100dvh - 11rem)";
    if (brightness !== 1) style.filter = `brightness(${brightness})`;
    return style;
  }, [fitHeight, brightness]);

  const imageClass = fitHeight ? "h-full w-full object-contain select-none" : "w-full select-none";

  return (
    <div
      data-theme={theme === "site" ? undefined : theme === "clair" ? "light" : "dark"}
      data-reader-theme={theme}
      className="relative -mx-4"
    >
      <ReaderTopBar
        hidden={chromeHidden}
        serieHref={`/serie/${serieSlug}`}
        serieTitre={serieTitre}
        unite={unite}
        chapitres={chapitres}
        courant={`/serie/${serieSlug}/chapitre-${chapterNumero}`}
        settingsOpen={settingsOpen}
        onSettings={toggleSettings}
        onReport={() => openReport(null)}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
      />

      <div
        ref={containerRef}
        className="relative overflow-x-clip bg-bg"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        data-chapter-id={chapterId}
      >
        <div
          ref={pagesRef}
          className={clsx("relative flex items-center justify-center py-4")}
          style={zoneStyle}
        >
          {mode === "vertical" && (
            <div className="space-y-2" style={contentStyle}>
              {pages.map((item, index) => (
                <ReaderImage
                  key={`${index}:${item.url}`}
                  page={item}
                  index={index}
                  chapterNumero={chapterNumero} unite={unite}
                  eager={index === 0}
                  onFailed={onPageFailed}
                  onReport={openReport}
                  imageClass={imageClass}
                />
              ))}
            </div>
          )}

          {mode === "single" && pages[page] && (
            <div className={clsx("w-full", fitHeight && "h-full")} style={contentStyle}>
              <ReaderImage
                key={`${page}:${pages[page].url}`}
                page={pages[page]}
                index={page}
                chapterNumero={chapterNumero} unite={unite}
                eager
                onFailed={onPageFailed}
                onReport={openReport}
                imageClass={imageClass}
              />
              <Prefetch pages={pages} from={page + 1} />
            </div>
          )}

          {mode === "double" && (
            <div
              className={clsx(
                soloSpread ? "w-full" : "flex w-full items-start justify-center gap-1",
                fitHeight && "h-full items-stretch",
              )}
              style={contentStyle}
            >
              {soloSpread ? (
                <ReaderImage
                  key={`${page}:${pages[page]?.url ?? ""}`}
                  page={pages[page]}
                  index={page}
                  chapterNumero={chapterNumero} unite={unite}
                  eager
                  onFailed={onPageFailed}
                  onReport={openReport}
                  imageClass={imageClass}
                />
              ) : (
                <>
                  <div className={clsx("w-1/2", fitHeight && "h-full")}>
                    {pages[sens === "rtl" ? page + 1 : page] && (
                      <ReaderImage
                        key={`${sens === "rtl" ? page + 1 : page}:${
                          pages[sens === "rtl" ? page + 1 : page].url
                        }`}
                        page={pages[sens === "rtl" ? page + 1 : page]}
                        index={sens === "rtl" ? page + 1 : page}
                        chapterNumero={chapterNumero} unite={unite}
                        eager={page <= 2}
                        onFailed={onPageFailed}
                        onReport={openReport}
                        imageClass={imageClass}
                      />
                    )}
                  </div>
                  <div className={clsx("w-1/2", fitHeight && "h-full")}>
                    {pages[sens === "rtl" ? page : page + 1] && (
                      <ReaderImage
                        key={`${sens === "rtl" ? page : page + 1}:${
                          pages[sens === "rtl" ? page : page + 1].url
                        }`}
                        page={pages[sens === "rtl" ? page : page + 1]}
                        index={sens === "rtl" ? page : page + 1}
                        chapterNumero={chapterNumero} unite={unite}
                        eager={page <= 2}
                        onFailed={onPageFailed}
                        onReport={openReport}
                        imageClass={imageClass}
                      />
                    )}
                  </div>
                  <Prefetch pages={pages} from={page + 2} />
                </>
              )}
            </div>
          )}

          {/* Zones tactiles gauche / centre / droite : ignorées en webtoon. */}
          {mode !== "vertical" && (
            <TouchZones
              sens={sens}
              onPrev={() => step(-1)}
              onNext={() => step(1)}
              onToggleChrome={() => (chromeHidden ? reveal() : hide())}
            />
          )}
        </div>

        <NextChapterPrefetch chapterId={nextChapterId} active={isLast} />

        <div className="flex items-center justify-between gap-2 px-3 pb-3">
          <NavButton
            href={page > 0 ? null : prevHref}
            onClick={() => step(-1)}
            label={page > 0 ? "Page précédente" : libelleVoisin("précédent", unite)}
            icon={<ChevronLeft className="size-4" />}
            disabled={page <= 0 && !prevHref}
          />
          <span className="text-xs tabular-nums text-muted">
            Page {page + 1} / {total}
          </span>
          <NavButton
            href={isLast ? nextHref : null}
            onClick={() => step(1)}
            label={isLast ? libelleVoisin("suivant", unite) : "Page suivante"}
            icon={<ChevronRight className="size-4" />}
            disabled={!isLast ? false : nextHref === null}
            align="right"
          />
        </div>

        {showEnd && (
          <section
            className="border-t border-line bg-surface px-4 py-6 text-center"
            aria-labelledby="reader-fin-titre"
          >
            <p className="section-title" id="reader-fin-titre">
              {libelleUniteSingulier(unite)} terminé
            </p>
            <p className="mt-1 text-sm text-muted">
              {serieTitre} — {libelleUnite(chapterNumero, unite).toLowerCase()}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {nextHref ? (
                <Link href={nextHref} className="btn-primary">
                  {libelleVoisin("suivant", unite)} <ChevronRight className="size-4" />
                </Link>
              ) : (
                <span className="btn-primary opacity-50" aria-disabled="true">
                  Dernier {libelleUniteSingulier(unite).toLowerCase()}
                </span>
              )}
              {prevHref ? (
                <Link href={prevHref} className="btn-secondary">
                  <ChevronLeft className="size-4" /> {libelleVoisin("précédent", unite)}
                </Link>
              ) : (
                <span className="btn-secondary opacity-50" aria-disabled="true">
                  {libelleVoisin("précédent", unite)}
                </span>
              )}
              <a href="#commentaires" className="btn-ghost">
                Commentaires du {libelleUniteSingulier(unite).toLowerCase()}
              </a>
              <ChapterLike chapterId={chapterId} initialLikes={initialLikes} unite={unite} />
              <button type="button" className="btn-ghost" onClick={() => openReport(null)}>
                <Flag className="size-4" /> Signaler un problème
              </button>
            </div>
          </section>
        )}
      </div>

      <ReaderBottomBar
        hidden={chromeHidden}
        page={page}
        total={total}
        onSeek={goTo}
        prevHref={prevHref}
        nextHref={nextHref}
        unite={unite}
      />

      <ReaderSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        mode={mode}
        onMode={changeMode}
        sens={sens}
        onSens={changeSens}
        fit={fit}
        onFit={changeFit}
        width={width}
        onWidth={changeWidth}
        maxw={maxw}
        onMaxw={changeMaxw}
        theme={theme}
        onTheme={changeTheme}
        brightness={brightness}
        onBrightness={changeBrightness}
        firstSolo={firstSolo}
        onFirstSolo={changeFirstSolo}
      />

      <ReportDialog
        key={`report-${reportPage ?? "manual"}`}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        chapterId={chapterId}
        chapterNumero={chapterNumero} unite={unite}
        page={reportPage}
      />
    </div>
  );
}

/**
 * Zones tactiles gauche / centre / droite : les côtés tournent les
 * pages (sens inversé en lecture droite-à-gauche), le centre montre ou masque
 * les commandes. Cibles de 44 px minimum, étiquetées pour le clavier.
 */
function TouchZones({
  sens,
  onPrev,
  onNext,
  onToggleChrome,
}: {
  sens: ReaderSens;
  onPrev: () => void;
  onNext: () => void;
  onToggleChrome: () => void;
}) {
  const leftIsNext = sens === "rtl";
  const zone =
    "group pointer-events-auto flex min-h-11 flex-1 items-center justify-center text-fg";
  const icon =
    "size-8 opacity-0 transition-opacity group-hover:opacity-70 group-focus-visible:opacity-100 motion-reduce:transition-none";

  return (
    <div className="absolute inset-0 z-20 flex" role="group" aria-label="Zones tactiles de lecture">
      <button
        type="button"
        className={zone}
        onClick={leftIsNext ? onNext : onPrev}
        aria-label={leftIsNext ? "Zone gauche : page suivante" : "Zone gauche : page précédente"}
      >
        {leftIsNext ? (
          <ChevronRight className={icon} aria-hidden="true" />
        ) : (
          <ChevronLeft className={icon} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={zone}
        onClick={onToggleChrome}
        aria-label="Zone centre : afficher ou masquer les commandes"
      />
      <button
        type="button"
        className={zone}
        onClick={leftIsNext ? onPrev : onNext}
        aria-label={leftIsNext ? "Zone droite : page précédente" : "Zone droite : page suivante"}
      >
        {leftIsNext ? (
          <ChevronLeft className={icon} aria-hidden="true" />
        ) : (
          <ChevronRight className={icon} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

/** Préchargement des 2 à 3 pages suivantes en mode page / double page. */
function Prefetch({ pages, from }: { pages: ReaderPage[]; from: number }) {
  const next = pages.slice(from, from + 3);
  if (next.length === 0) return null;
  return (
    <div className="hidden" aria-hidden>
      {next.map((item) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={item.index} src={item.url} alt="" loading="eager" />
      ))}
    </div>
  );
}

/** Une page est paysage quand sa largeur dépasse sa hauteur. */
function isLandscape(page: ReaderPage | undefined): boolean {
  return Boolean(page?.largeur && page.hauteur && page.largeur > page.hauteur);
}

/**
 * Page de scan avec reprise : 2 nouvelles tentatives avec délai
 * croissant, puis une page de remplacement avec bouton « Signaler un
 * problème ». Dimensions toujours transmises au DOM : aucune surprise de
 * mise en page (CLS < 0,05).
 */
const MAX_RETRIES = 2;

function ReaderImage({
  page,
  index,
  chapterNumero,
  unite,
  eager,
  onFailed,
  onReport,
  imageClass = "w-full select-none",
}: {
  page: ReaderPage;
  index: number;
  chapterNumero: number;
  /** Organisation de la série (texte alternatif : « du tome 3 »). */
  unite?: Unite | null;
  eager: boolean;
  onFailed: (index: number) => void;
  onReport: (index: number) => void;
  imageClass?: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // L'état est réinitialisé par le `key` du parent quand l'URL change :
  // aucun effet de remise à zéro nécessaire.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const src =
    attempt === 0 ? page.url : `${page.url}${page.url.includes("?") ? "&" : "?"}retry=${attempt}`;
  const alt = `Page ${index + 1} du ${libelleUnite(chapterNumero, unite).toLowerCase()}`;

  function onError() {
    if (failed || timerRef.current) return;
    if (retriesRef.current < MAX_RETRIES) {
      const delay = 400 * 2 ** retriesRef.current;
      retriesRef.current += 1;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setAttempt((current) => current + 1);
      }, delay);
      return;
    }
    setFailed(true);
    onFailed(index);
  }

  if (failed) {
    return (
      <div
        id={`reader-page-${index}`}
        style={
          page.largeur && page.hauteur
            ? { aspectRatio: `${page.largeur} / ${page.hauteur}` }
            : { minHeight: "50vh" }
        }
        className="relative z-30 flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface2 p-6 text-center"
      >
        <ImageOff className="size-6 text-muted" />
        <p className="text-sm font-semibold text-fg">Page {index + 1} indisponible</p>
        <p className="max-w-xs text-xs text-muted">
          Le fichier n&apos;a pas pu être chargé malgré les reprises automatiques.
        </p>
        <button type="button" className="btn-secondary text-sm" onClick={() => onReport(index)}>
          <Flag className="size-4" /> Signaler un problème
        </button>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      id={`reader-page-${index}`}
      src={src}
      alt={alt}
      width={page.largeur}
      height={page.hauteur}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding={eager ? undefined : "async"}
      onError={onError}
      className={imageClass}
      draggable={false}
    />
  );
}

/** Préchargement de la première page du chapitre suivant en fin de lecture. */
function NextChapterPrefetch({ chapterId, active }: { chapterId: string | null; active: boolean }) {
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active || !chapterId || doneRef.current) return;
    doneRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/chapters/${encodeURIComponent(chapterId)}/pages`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { pages?: { url?: string }[] };
        const url = data.pages?.[0]?.url;
        if (url) {
          const img = new Image();
          img.src = url;
        }
      } catch {
        /* préchargement best effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, chapterId]);

  return null;
}

function NavButton({
  href,
  onClick,
  label,
  icon,
  disabled,
  align = "left",
}: {
  href: string | null;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  align?: "left" | "right";
}) {
  const content =
    align === "right" ? (
      <>
        {label} {icon}
      </>
    ) : (
      <>
        {icon} {label}
      </>
    );

  if (href) {
    return (
      <Link href={href} className="btn-secondary text-sm">
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className="btn-secondary text-sm" onClick={onClick} disabled={disabled}>
      {content}
    </button>
  );
}
