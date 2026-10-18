"use client";

import clsx from "clsx";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Flag,
  ImageOff,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChapterLike } from "./chapter-like";
import { ReaderBottomBar, ReaderTopBar, useReaderChrome } from "./reader-chrome";
import { ReaderHelp } from "./reader-help";
import { ReportDialog } from "./reader-report";
import {
  ReaderProgressTicks,
  ReaderSidebar,
  ReaderSidebarToggle,
  SIDEBAR_WIDTH,
} from "./reader-sidebar";
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
/** Mode : mémorisé par série, avec repli sur la clé globale du site. */
const MODE_KEY = "lp-reader-mode";
const MODE_SERIE_KEY = "lp-reader-mode:";
/** Sens : mémorisé par série (prioritaire sur la préférence du compte). */
const SENS_KEY = "lp-reader-sens:";
const FIT_KEY = "lp-reader-fit";
const FIT_SERIE_KEY = "lp-reader-fit:";
const SOLO_SERIE_KEY = "lp-reader-solo:";
const WIDTH_KEY = "lp-reader-width";
const MAXW_KEY = "lp-reader-maxw";
const MAXH_KEY = "lp-reader-maxh";
const STRETCH_KEY = "lp-reader-stretch";
const LIMITW_KEY = "lp-reader-limit-w";
const LIMITH_KEY = "lp-reader-limit-h";
/** Sidebar repliée ou non (grand écran). */
const SIDEBAR_KEY = "lp-reader-sidebar";
const THEME_KEY = "lp-reader-theme";
const BRIGHT_KEY = "lp-reader-brightness";
const SOLO_KEY = "lp-reader-first-solo";
/** Progression des visiteurs : reprise sans compte. */
const progressKey = (chapterId: string) => `lp-progress:${chapterId}`;

const FITS: ReaderFit[] = ["auto", "originale", "largeur", "hauteur", "perso"];
const THEMES: ReaderTheme[] = ["site", "clair", "noir"];

/** Bornes des limites de l'ajustement « Personnalisé » (ancien lecteur). */
const PX_MIN = 400;
const PX_MAX = 3000;

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
 * Lecteur de scans : colonne de contrôles latérale de 360 px sur grand
 * écran (motif de l'ancien lecteur : chapitre, pages, mode, sens, ajustement
 * et réglages « Personnalisé » complets) avec barre de progression à ticks,
 * barres auto-masquables sur mobile, modes webtoon / page / double page,
 * réglages mémorisés par série (exportables), thème et luminosité, transitions
 * de planche, zones tactiles, molette, raccourcis clavier (+ aide `?`),
 * plein écran, progression (compte ou local), signalement et écran de fin
 * dédié ; le webtoon ajoute une barre de progression fine et un retour en
 * haut.
 */
export function Reader({
  pages,
  chapterId,
  chapterNumero,
  chapterTitre,
  chapitreDate,
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
  adult = false,
}: {
  pages: ReaderPage[];
  chapterId: string;
  chapterNumero: number;
  /** Titre du chapitre, affiché dans la sidebar (motif de l'ancien lecteur). */
  chapterTitre?: string;
  /** Date de publication, affichée dans la sidebar (« il y a 3 j »). */
  chapitreDate?: string | null;
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
  /** Série +18 : le webtoon s'affiche sans espacement (motif de l'ancien site). */
  adult?: boolean;
}) {
  const total = pages.length;
  const lastIndex = Math.max(total - 1, 0);

  const [mode, setMode] = useState<ReaderMode>(initialMode ?? "vertical");
  const [sens, setSens] = useState<ReaderSens>(initialSens ?? "ltr");
  const [fit, setFit] = useState<ReaderFit>("auto");
  const [width, setWidth] = useState(100);
  const [maxw, setMaxw] = useState(1200);
  const [maxh, setMaxh] = useState(1080);
  const [stretch, setStretch] = useState(false);
  const [limitW, setLimitW] = useState(true);
  const [limitH, setLimitH] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<ReaderTheme>("site");
  const [brightness, setBrightness] = useState(1);
  const [firstSolo, setFirstSolo] = useState(false);
  const [page, setPage] = useState(() => clamp(initialPage - 1, 0, lastIndex));
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPage, setReportPage] = useState<number | null>(null);
  /** Progression du défilement (0 à 1) et bouton « remonter » (webtoon). */
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);
  /** État post-hydration : les préférences et la reprise sont lues en différé. */
  const [hydrated, setHydrated] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(page);
  const modeRef = useRef(mode);
  const sensRef = useRef(sens);
  const fitRef = useRef(fit);
  const themeRef = useRef(theme);
  const resumeDoneRef = useRef(false);
  const lastSentRef = useRef(0);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pages dont le chargement a échec après reprise, envoyées par lots. */
  const failedRef = useRef<Set<number>>(new Set());
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Dernière page de la planche affichée (fin de chapitre en double page). */
  const endRef = useRef(0);
  /** Premier index de la planche affichée (progression, URL, barre). */
  const startRef = useRef(0);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    sensRef.current = sens;
  }, [sens]);
  useEffect(() => {
    fitRef.current = fit;
  }, [fit]);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

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
        // Mode, ajustement et décalage : local par série > clé globale
        const savedMode = store.get(MODE_SERIE_KEY + serieId) ?? store.get(MODE_KEY);
        if (savedMode === "vertical" || savedMode === "single" || savedMode === "double") {
          setMode(savedMode);
        }
        // Sens : local par série > préférence du compte > défaut
        const savedSens = store.get(SENS_KEY + serieId);
        if (savedSens === "ltr" || savedSens === "rtl") setSens(savedSens);

        const savedFit = store.get(FIT_SERIE_KEY + serieId) ?? store.get(FIT_KEY);
        if (savedFit && FITS.includes(savedFit as ReaderFit)) setFit(savedFit as ReaderFit);

        const savedWidth = Number(store.get(WIDTH_KEY));
        if (savedWidth >= 50 && savedWidth <= 100) setWidth(savedWidth);

        const savedMaxw = Number(store.get(MAXW_KEY));
        if (savedMaxw >= PX_MIN && savedMaxw <= PX_MAX) setMaxw(savedMaxw);
        else if (savedMaxw >= 320 && savedMaxw < PX_MIN) setMaxw(PX_MIN); // ancienne plage

        const savedMaxh = Number(store.get(MAXH_KEY));
        if (savedMaxh >= PX_MIN && savedMaxh <= PX_MAX) setMaxh(savedMaxh);

        if (store.get(STRETCH_KEY) === "1") setStretch(true);
        if (store.get(LIMITW_KEY) === "0") setLimitW(false);
        if (store.get(LIMITH_KEY) === "1") setLimitH(true);
        if (store.get(SIDEBAR_KEY) === "1") setCollapsed(true);

        const savedTheme = store.get(THEME_KEY);
        if (savedTheme && THEMES.includes(savedTheme as ReaderTheme)) {
          setTheme(savedTheme as ReaderTheme);
        }

        const savedBrightness = Number(store.get(BRIGHT_KEY));
        if (savedBrightness >= 0.6 && savedBrightness <= 1.3) setBrightness(savedBrightness);

        const savedSolo = store.get(SOLO_SERIE_KEY + serieId) ?? store.get(SOLO_KEY);
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
      store.set(MODE_SERIE_KEY + serieId, next);
      syncPrefs();
    },
    [serieId, syncPrefs],
  );

  const changeSens = useCallback(
    (next: ReaderSens) => {
      setSens(next);
      store.set(SENS_KEY + serieId, next);
      syncPrefs();
    },
    [serieId, syncPrefs],
  );

  const changeFit = useCallback(
    (next: ReaderFit) => {
      setFit(next);
      store.set(FIT_KEY, next);
      store.set(FIT_SERIE_KEY + serieId, next);
    },
    [serieId],
  );
  const changeWidth = useCallback((next: number) => {
    setWidth(next);
    store.set(WIDTH_KEY, String(next));
  }, []);
  const changeMaxw = useCallback((next: number) => {
    setMaxw(next);
    store.set(MAXW_KEY, String(next));
  }, []);
  const changeMaxh = useCallback((next: number) => {
    setMaxh(next);
    store.set(MAXH_KEY, String(next));
  }, []);
  const changeStretch = useCallback((next: boolean) => {
    setStretch(next);
    store.set(STRETCH_KEY, next ? "1" : "0");
  }, []);
  const changeLimitW = useCallback((next: boolean) => {
    setLimitW(next);
    store.set(LIMITW_KEY, next ? "1" : "0");
  }, []);
  const changeLimitH = useCallback((next: boolean) => {
    setLimitH(next);
    store.set(LIMITH_KEY, next ? "1" : "0");
  }, []);
  const changeCollapsed = useCallback((next: boolean) => {
    setCollapsed(next);
    store.set(SIDEBAR_KEY, next ? "1" : "0");
  }, []);
  const changeTheme = useCallback((next: ReaderTheme) => {
    setTheme(next);
    store.set(THEME_KEY, next);
  }, []);
  const changeBrightness = useCallback((next: number) => {
    setBrightness(next);
    store.set(BRIGHT_KEY, String(next));
  }, []);
  const changeFirstSolo = useCallback(
    (next: boolean) => {
      setFirstSolo(next);
      store.set(SOLO_KEY, next ? "1" : "0");
      store.set(SOLO_SERIE_KEY + serieId, next ? "1" : "0");
    },
    [serieId],
  );

  const cycleMode = useCallback(() => {
    const index = READER_MODES.findIndex((m) => m.key === modeRef.current);
    const next = READER_MODES[(index + 1) % READER_MODES.length].key;
    modeRef.current = next; // optimiste : deux clics rapprochés avant le rendu
    changeMode(next);
  }, [changeMode]);

  /** Bouton cyclique « Ajustement » de la sidebar (motif de l'ancien lecteur). */
  const cycleFit = useCallback(() => {
    const index = FITS.indexOf(fitRef.current);
    const next = FITS[(index + 1) % FITS.length];
    fitRef.current = next;
    changeFit(next);
  }, [changeFit]);

  /** Touche `T` : bascule le thème du lecteur (site → clair → noir → site). */
  const cycleTheme = useCallback(() => {
    const index = THEMES.indexOf(themeRef.current);
    const next = THEMES[(index + 1) % THEMES.length];
    themeRef.current = next;
    changeTheme(next);
  }, [changeTheme]);

  /* ── Navigation ───────────────────────────────────────────────────── */

  /* Double page : planches pré-calculées — une page paysage occupe sa
     planche seule, sinon deux portraits se suivent ; `page` vaut alors le
     premier index de la planche affichée. */
  const spreads = useMemo(
    () => (mode === "double" ? buildSpreads(pages, firstSolo) : []),
    [mode, pages, firstSolo],
  );

  const spreadIndexAt = useCallback(
    (index: number) => {
      for (let i = 0; i < spreads.length; i++) {
        if (index >= spreads[i].start && index < spreads[i].start + spreads[i].length) return i;
      }
      return -1;
    },
    [spreads],
  );

  /** Planche affichée : en double page, la planche contenant `page`. */
  const spread = useMemo(() => {
    if (mode !== "double") return { start: page, length: 1 };
    const at = spreadIndexAt(page);
    return at >= 0 ? spreads[at] : { start: clamp(page, 0, lastIndex), length: 1 };
  }, [mode, spreads, spreadIndexAt, page, lastIndex]);

  const goTo = useCallback(
    (target: number) => {
      if (mode === "double") {
        const at = spreadIndexAt(clamp(target, 0, lastIndex));
        const planche = at >= 0 ? spreads[at] : undefined;
        setPage(planche ? planche.start : clamp(target, 0, lastIndex));
        return;
      }
      const next = clamp(target, 0, lastIndex);
      setPage(next);
      if (mode === "vertical") scrollToPage(next);
    },
    [mode, lastIndex, spreads, spreadIndexAt, scrollToPage],
  );

  /* Planches de navigation : les planches réelles en mode double, sinon une
     planche par page — sert à la barre de ticks et au sélecteur de la sidebar. */
  const planches = useMemo(
    () => (mode === "double" ? spreads : pages.map((_, index) => ({ start: index, length: 1 }))),
    [mode, spreads, pages],
  );
  const plancheIndex = mode === "double" ? Math.max(spreadIndexAt(page), 0) : page;

  const goToPlanche = useCallback(
    (index: number) => {
      const planche = planches[clamp(index, 0, planches.length - 1)];
      if (planche) goTo(planche.start);
    },
    [planches, goTo],
  );

  const plancheLabels = useMemo(
    () =>
      planches.map((p) =>
        p.length > 1 ? `Page ${p.start + 1}-${p.start + p.length}` : `Page ${p.start + 1}`,
      ),
    [planches],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (mode === "double") {
        const at = spreadIndexAt(pageRef.current);
        const planche = spreads[clamp(at + direction, 0, spreads.length - 1)];
        if (planche) setPage(planche.start);
        return;
      }
      goTo(pageRef.current + direction);
    },
    [mode, spreads, spreadIndexAt, goTo],
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
      // Échap : aide > tiroir > modale > plein écran
      if (event.key === "Escape") {
        if (helpOpen) {
          event.preventDefault();
          setHelpOpen(false);
          return;
        }
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

      // `?` (Shift + é sur AZERTY) : aide aux raccourcis
      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

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
        case "Home":
          event.preventDefault();
          goTo(0);
          break;
        case "End":
          event.preventDefault();
          goTo(lastIndex);
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
        case "t":
        case "T":
          event.preventDefault();
          cycleTheme();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    sens,
    step,
    goTo,
    lastIndex,
    toggleFullscreen,
    toggleSettings,
    cycleMode,
    cycleTheme,
    helpOpen,
    settingsOpen,
    reportOpen,
  ]);

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
      if (event.deltaY > 0 ? endRef.current >= lastIndex : index <= 0) return;
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

  /* ── Suivi du scroll en mode vertical ───────────────────────────────
     Suit aussi la progression (0-1, arrondie au % pour limiter les rendus)
     et l'affichage du bouton « remonter » du webtoon. */
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

        // Barre de progression mobile et bouton « remonter »
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
        const pct = Math.round(ratio * 100);
        setScrollProgress((current) => (current === pct ? current : pct));
        setShowTop(window.scrollY > window.innerHeight * 0.8);
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
    try {
      await fetch("/api/reading/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: [
            {
              chapterId,
              page: startRef.current + 1,
              completed: endRef.current >= lastIndex,
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
    store.set(progressKey(chapterId), String(startRef.current + 1));
  }, [chapterId]);

  useEffect(() => {
    const timer = window.setTimeout(saveLocalProgress, 2000);
    return () => window.clearTimeout(timer);
  }, [page, saveLocalProgress]);

  useEffect(() => {
    window.addEventListener("pagehide", saveLocalProgress);
    return () => window.removeEventListener("pagehide", saveLocalProgress);
  }, [saveLocalProgress]);

  /* ── URL : `?page=N` (replaceState, debounce 150 ms) ─────────────────
     Le lien de lecture reste partageable ; `page=1` est retiré (défaut). */
  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      try {
        const url = new URL(window.location.href);
        const numero = spread.start + 1;
        if (numero <= 1) url.searchParams.delete("page");
        else url.searchParams.set("page", String(numero));
        const next = `${url.pathname}${url.search}${url.hash}`;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (next !== current) window.history.replaceState(window.history.state, "", next);
      } catch {
        /* URL indisponible : la lecture n'en dépend pas */
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [spread.start, hydrated]);

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
  /** Une planche paysage (ou la première page, si demandé) tient seule. */
  const soloSpread = spread.length === 1;
  const spreadEnd = spread.start + spread.length - 1;
  const isLast = spreadEnd >= lastIndex;
  const showEnd = mode === "vertical" || isLast;
  /** Ajustement « hauteur » : une planche tient dans la fenêtre (page / double). */
  const fitHeight = fit === "hauteur" && mode !== "vertical";
  /** Ajustement « Originale » : taille native, zone scrollable horizontalement. */
  const fitOriginale = fit === "originale";
  /** Double page : pages gauche / droite (en D → G, la page paire est à gauche). */
  const doubleLeft = sens === "rtl" ? spread.start + 1 : spread.start;
  const doubleRight = sens === "rtl" ? spread.start : spread.start + 1;
  /** Position de la planche dans le chapitre (placement des pages seules). */
  const spreadPosition = mode === "double" ? Math.max(spreadIndexAt(page), 0) : 0;
  /** Planche paysage : image seule, centrée, sans placeholder (ancien lecteur). */
  const soloLandscape = soloSpread && isLandscape(pages[spread.start]);
  /** Page seule : comme l'ancien lecteur, la première planche part d'un bord
      de la grille et les suivantes de l'autre (un placeholder occupe l'autre
      moitié), en fonction du sens de lecture. */
  const soloImageFirst = sens === "rtl" ? spreadPosition === 0 : spreadPosition !== 0;

  /* Premier index de la planche : progression, URL et barre inférieure. */
  useEffect(() => {
    startRef.current = spread.start;
  }, [spread.start]);

  /* Dernière page de la planche : fin de chapitre et complétion. */
  useEffect(() => {
    endRef.current = spreadEnd;
  }, [spreadEnd]);

  const contentStyle = useMemo<React.CSSProperties>(() => {
    if (fit === "originale") return { width: "auto", maxWidth: "none" };
    if (fit === "perso") {
      return {
        width: "100%",
        maxWidth: limitW ? `${clamp(maxw, PX_MIN, PX_MAX)}px` : undefined,
      };
    }
    if (fit === "largeur") return { width: `${clamp(width, 50, 100)}%` };
    return { width: "100%" };
  }, [fit, maxw, width, limitW]);

  /** Ajustement « Personnalisé » : borne de hauteur (motif de l'ancien site). */
  const imageStyle = useMemo<React.CSSProperties | undefined>(
    () =>
      fit === "perso" && limitH ? { maxHeight: `${clamp(maxh, PX_MIN, PX_MAX)}px` } : undefined,
    [fit, limitH, maxh],
  );

  const zoneStyle = useMemo<React.CSSProperties>(() => {
    const style: React.CSSProperties = {};
    if (fitHeight) style.height = "calc(100dvh - 11rem)";
    if (fitOriginale) {
      // Centrage « safe » : passé la largeur des pages, on colle à gauche
      // plutôt que de rogner le début (défilement horizontal conservé).
      style.justifyContent = "safe center" as React.CSSProperties["justifyContent"];
    }
    if (brightness !== 1) style.filter = `brightness(${brightness})`;
    return style;
  }, [fitHeight, fitOriginale, brightness]);

  const imageClass = fitHeight
    ? "h-full w-full object-contain select-none bg-surface2"
    : fitOriginale
      ? "max-w-none select-none bg-surface2"
      : stretch && mode !== "vertical"
        /* « Étirer les petites pages » : la page remplit sa boîte (contenue),
           bornée par la limite de hauteur si elle est active. */
        ? "h-full w-full object-contain select-none bg-surface2"
        : "w-full select-none bg-surface2";

  /* Double page collée : grille de deux moitiés qui se rejoignent au centre,
     placeholder sur l'autre moitié pour une page portrait seule (motifs de
     l'ancien lecteur, `reader.css` .double-mode). */
  const placeholderEl = (
    <div aria-hidden="true" className={clsx("h-full w-full", fitOriginale && "flex-none")} />
  );
  const soloImageSlot = (
    <div
      className={clsx(
        "flex",
        soloImageFirst ? "justify-end" : "justify-start",
        fitHeight && "h-full",
        fitOriginale && "flex-none",
      )}
    >
      {pages[spread.start] && (
        <ReaderImage
          key={`${spread.start}:${pages[spread.start].url}`}
          page={pages[spread.start]}
          index={spread.start}
          chapterNumero={chapterNumero} unite={unite}
          eager
          onFailed={onPageFailed}
          onReport={openReport}
          imageClass={imageClass}
          imageStyle={imageStyle}
        />
      )}
    </div>
  );

  return (
    <div
      data-theme={theme === "site" ? undefined : theme === "clair" ? "light" : "dark"}
      data-reader-theme={theme}
      /* Grand écran : sidebar de contrôles (360 px, repliable) + colonne de
         lecture ; mobile : colonne seule avec les barres auto-masquables. */
      className="relative -mx-4 lg:grid lg:grid-cols-[var(--reader-sidebar-w)_1fr] lg:transition-[grid-template-columns] lg:duration-300 lg:ease-in-out lg:motion-reduce:transition-none"
      style={{ "--reader-sidebar-w": `${collapsed ? 0 : SIDEBAR_WIDTH}px` } as React.CSSProperties}
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
        mobileOnly
      />

      <ReaderSidebar
        collapsed={collapsed}
        serieHref={`/serie/${serieSlug}`}
        serieTitre={serieTitre}
        unite={unite}
        chapitres={chapitres}
        courant={`/serie/${serieSlug}/chapitre-${chapterNumero}`}
        chapterNumero={chapterNumero}
        chapterTitre={chapterTitre}
        chapitreDate={chapitreDate}
        likes={initialLikes}
        chapterId={chapterId}
        plancheLabels={plancheLabels}
        plancheIndex={plancheIndex}
        onSeekPlanche={goToPlanche}
        onFirst={() => goTo(0)}
        onPrevPage={() => step(-1)}
        onNextPage={() => step(1)}
        onLast={() => goTo(lastIndex)}
        hasPrev={spread.start > 0}
        hasNext={!isLast}
        prevHref={prevHref}
        nextHref={nextHref}
        mode={mode}
        onMode={changeMode}
        sens={sens}
        onSens={changeSens}
        fit={fit}
        onFitCycle={cycleFit}
        firstSolo={firstSolo}
        onFirstSolo={changeFirstSolo}
        stretch={stretch}
        onStretch={changeStretch}
        limitW={limitW}
        onLimitW={changeLimitW}
        maxw={maxw}
        onMaxw={changeMaxw}
        limitH={limitH}
        onLimitH={changeLimitH}
        maxh={maxh}
        onMaxh={changeMaxh}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
        onReport={() => openReport(null)}
        onHelp={() => setHelpOpen(true)}
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
          className={clsx(
            "relative flex items-center justify-center py-4",
            fitOriginale && "overflow-x-auto",
          )}
          style={zoneStyle}
        >
          {mode === "vertical" && (
            <div className={adult ? "space-y-0" : "space-y-[26px]"} style={contentStyle}>
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
              {/* Deux planches d'avance, en plus du chargement paresseux natif */}
              <Prefetch pages={pages} from={page + 3} count={2} />
            </div>
          )}

          {mode === "single" && pages[page] && (
            <div
              key={page}
              className={clsx("w-full reader-page-enter", fitHeight && "h-full")}
              style={contentStyle}
            >
              <ReaderImage
                key={`${page}:${pages[page].url}`}
                page={pages[page]}
                index={page}
                chapterNumero={chapterNumero} unite={unite}
                eager
                onFailed={onPageFailed}
                onReport={openReport}
                imageClass={imageClass}
                imageStyle={imageStyle}
              />
              <Prefetch pages={pages} from={page + 1} />
            </div>
          )}

          {mode === "double" && (
            <div
              key={spread.start}
              className={clsx(
                "w-full reader-page-enter",
                fitHeight && "h-full",
                soloSpread && soloLandscape
                  ? "flex items-center justify-center"
                  : "grid grid-cols-2 items-start",
              )}
              style={contentStyle}
            >
              {soloSpread ? (
                soloLandscape ? (
                  pages[spread.start] && (
                    <ReaderImage
                      key={`${spread.start}:${pages[spread.start].url}`}
                      page={pages[spread.start]}
                      index={spread.start}
                      chapterNumero={chapterNumero} unite={unite}
                      eager
                      onFailed={onPageFailed}
                      onReport={openReport}
                      imageClass={imageClass}
                      imageStyle={imageStyle}
                    />
                  )
                ) : (
                  <>
                    {soloImageFirst ? soloImageSlot : placeholderEl}
                    {soloImageFirst ? placeholderEl : soloImageSlot}
                  </>
                )
              ) : (
                <>
                  <div
                    className={clsx(
                      "flex justify-end",
                      fitOriginale ? "flex-none" : "w-full",
                      fitHeight && "h-full",
                    )}
                  >
                    {pages[doubleLeft] && (
                      <ReaderImage
                        key={`${doubleLeft}:${pages[doubleLeft].url}`}
                        page={pages[doubleLeft]}
                        index={doubleLeft}
                        chapterNumero={chapterNumero} unite={unite}
                        eager={spread.start <= 2}
                        onFailed={onPageFailed}
                        onReport={openReport}
                        imageClass={imageClass}
                        imageStyle={imageStyle}
                      />
                    )}
                  </div>
                  <div
                    className={clsx(
                      "flex justify-start",
                      fitOriginale ? "flex-none" : "w-full",
                      fitHeight && "h-full",
                    )}
                  >
                    {pages[doubleRight] && (
                      <ReaderImage
                        key={`${doubleRight}:${pages[doubleRight].url}`}
                        page={pages[doubleRight]}
                        index={doubleRight}
                        chapterNumero={chapterNumero} unite={unite}
                        eager={spread.start <= 2}
                        onFailed={onPageFailed}
                        onReport={openReport}
                        imageClass={imageClass}
                        imageStyle={imageStyle}
                      />
                    )}
                  </div>
                </>
              )}
              <Prefetch pages={pages} from={spread.start + spread.length} />
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

        {/* Navigation de pages sous la lecture : mobile uniquement (grand
            écran, la sidebar reprend ces contrôles, comme l'ancien lecteur). */}
        <div className="flex items-center justify-between gap-2 px-3 pb-3 lg:hidden">
          <div className="flex items-center gap-2">
            <NavButton
              href={null}
              onClick={() => goTo(0)}
              label="Première page"
              icon={<ChevronsLeft className="size-4" />}
              disabled={spread.start <= 0}
              iconOnly
            />
            <NavButton
              href={spread.start > 0 ? null : prevHref}
              onClick={() => step(-1)}
              label={spread.start > 0 ? "Page précédente" : libelleVoisin("précédent", unite)}
              icon={<ChevronLeft className="size-4" />}
              disabled={spread.start <= 0 && !prevHref}
            />
          </div>
          <span className="text-xs tabular-nums text-muted">
            Page {spread.start + 1} / {total}
          </span>
          <div className="flex items-center gap-2">
            <NavButton
              href={isLast ? nextHref : null}
              onClick={() => step(1)}
              label={isLast ? libelleVoisin("suivant", unite) : "Page suivante"}
              icon={<ChevronRight className="size-4" />}
              disabled={!isLast ? false : nextHref === null}
              align="right"
            />
            <NavButton
              href={null}
              onClick={() => goTo(lastIndex)}
              label="Dernière page"
              icon={<ChevronsRight className="size-4" />}
              disabled={isLast}
              iconOnly
            />
          </div>
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

      <ReaderSidebarToggle
        collapsed={collapsed}
        onToggle={() => changeCollapsed(!collapsed)}
      />
      <ReaderProgressTicks
        planches={planches.length}
        current={plancheIndex}
        rtl={sens === "rtl"}
        onSeek={goToPlanche}
        left={collapsed ? 0 : SIDEBAR_WIDTH}
      />

      {/* Webtoon : barre de progression fine en bas (visible sur mobile où
          la barre à ticks est réservée au grand écran). */}
      {mode === "vertical" && (
        <div className="fixed inset-x-0 bottom-0 z-[65] h-[3px] lg:hidden" aria-hidden="true">
          <div
            className="h-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
            style={{ width: `${scrollProgress}%` }}
          />
        </div>
      )}

      {/* Webtoon : retour en haut après un écran de défilement. */}
      {mode === "vertical" && showTop && (
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
            reveal();
          }}
          className="fixed bottom-20 right-4 z-40 flex size-11 items-center justify-center rounded-full border border-line bg-surface/90 text-fg shadow-lg backdrop-blur hover:text-primary lg:bottom-10"
          aria-label="Revenir en haut de la page"
        >
          <ArrowUp className="size-5" />
        </button>
      )}

      <ReaderBottomBar
        hidden={chromeHidden}
        page={spread.start}
        total={total}
        onSeek={goTo}
        prevHref={prevHref}
        nextHref={nextHref}
        unite={unite}
        mobileOnly
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
        stretch={stretch}
        onStretch={changeStretch}
        limitW={limitW}
        onLimitW={changeLimitW}
        limitH={limitH}
        onLimitH={changeLimitH}
        maxh={maxh}
        onMaxh={changeMaxh}
      />

      <ReportDialog
        key={`report-${reportPage ?? "manual"}`}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        chapterId={chapterId}
        chapterNumero={chapterNumero} unite={unite}
        page={reportPage}
      />

      <ReaderHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
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
    "group pointer-events-auto flex min-h-11 flex-1 touch-manipulation items-center justify-center text-fg transition-colors active:bg-fg/10 motion-reduce:transition-none";
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

/** Préchargement des prochaines pages (mode page / double / webtoon). */
function Prefetch({
  pages,
  from,
  count = 3,
}: {
  pages: ReaderPage[];
  from: number;
  count?: number;
}) {
  const next = pages.slice(from, from + count);
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
 * Double page : planches à afficher, dans l'ordre de lecture. Une page
 * paysage occupe toujours sa planche ; sinon deux pages portrait se
 * suivent (motif de l'ancien site `buildSpreads`) ; `firstSolo` isole la
 * première page (réglage « première page seule »).
 */
function buildSpreads(
  pages: ReaderPage[],
  firstSolo: boolean,
): Array<{ start: number; length: number }> {
  const planches: Array<{ start: number; length: number }> = [];
  let i = 0;
  if (firstSolo && pages.length > 0) {
    planches.push({ start: 0, length: 1 });
    i = 1;
  }
  while (i < pages.length) {
    if (isLandscape(pages[i])) {
      planches.push({ start: i, length: 1 });
      i += 1;
    } else if (i + 1 < pages.length && !isLandscape(pages[i + 1])) {
      planches.push({ start: i, length: 2 });
      i += 2;
    } else {
      planches.push({ start: i, length: 1 });
      i += 1;
    }
  }
  return planches;
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
  imageStyle,
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
  /** Ajustement « Personnalisé » : borne de hauteur (ancien lecteur). */
  imageStyle?: React.CSSProperties;
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
      style={imageStyle}
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
  iconOnly = false,
}: {
  href: string | null;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  align?: "left" | "right";
  /** Variante sans texte : bouton carré étiqueté pour les lecteurs d'écran. */
  iconOnly?: boolean;
}) {
  const content = iconOnly ? (
    icon
  ) : align === "right" ? (
    <>
      {label} {icon}
    </>
  ) : (
    <>
      {icon} {label}
    </>
  );
  const aria = iconOnly ? { "aria-label": label, title: label } : {};

  if (href) {
    return (
      <Link href={href} className={clsx("btn-secondary text-sm", iconOnly && "px-2.5")} {...aria}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={clsx("btn-secondary text-sm", iconOnly && "px-2.5")}
      onClick={onClick}
      disabled={disabled}
      {...aria}
    >
      {content}
    </button>
  );
}
