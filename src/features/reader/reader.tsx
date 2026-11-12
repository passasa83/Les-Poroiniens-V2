"use client";

import clsx from "clsx";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { useFailureReport } from "./images/use-failure-report";
import { NextChapterPrefetch } from "./images/prefetch";
import { TouchZones } from "./input/touch-zones";
import { useReaderKeyboard } from "./input/use-keyboard";
import { useSwipe } from "./input/use-swipe";
import { useWheelPaging } from "./input/use-wheel-paging";
import { ReaderBottomBar, ReaderTopBar, useReaderChrome } from "./layout/chrome";
import { EndOfChapter } from "./layout/end-of-chapter";
import { ReaderHelp } from "./layout/help";
import { useColumnInset, useFullscreen, useImmersive } from "./layout/hooks";
import { BackToTop, MobilePageNav, WebtoonProgressLine } from "./layout/mobile-nav";
import { ReportDialog } from "./layout/report-dialog";
import { ReaderSettings } from "./layout/settings-drawer";
import { ReaderProgressTicks, ReaderSidebarReexpand } from "./layout/progress-ticks";
import { ReaderSidebar, SIDEBAR_WIDTH } from "./layout/sidebar";
import { fitLayout } from "./modes/fit";
import { useVerticalTracking } from "./modes/use-vertical-tracking";
import { DoublePage, SinglePage, VerticalStrip, type PageProps } from "./modes/views";
import { useResume } from "./progress/use-resume";
import { useReadingProgress } from "./progress/use-reading-progress";
import type { ReaderProps } from "./reader-props";
import { ReaderSettingsProvider, useReaderSettingsState } from "./settings/context";
import { useReaderNavigation } from "./state/use-navigation";
import { prefersReducedMotion, type ReaderPage } from "./types";

export type { ReaderPage };

/**
 * Lecteur de scans : colonne de contrôles latérale de 360 px sur grand
 * écran (chapitre, pages, mode, sens, ajustement) avec barre de progression
 * à ticks, barres auto-masquables sur mobile, modes webtoon / page / double
 * page, réglages mémorisés par série (exportables), thème et luminosité,
 * zones tactiles, molette, raccourcis clavier (+ aide `?`), plein écran,
 * progression (compte ou local), signalement et écran de fin.
 *
 * Ce composant ne fait qu'assembler : état des réglages (`settings/`),
 * position (`state/`), entrées (`input/`), images (`images/`), suivi
 * (`progress/`), modes (`modes/`) et habillage (`layout/`).
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
}: ReaderProps) {
  const settings = useReaderSettingsState({ serieId, initialMode, initialSens, canSync });
  const { prefs, update, cycleMode, cycleTheme } = settings;
  const { mode, sens, collapsed, theme } = prefs;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const { ref: rootRef, inset } = useColumnInset();

  const nav = useReaderNavigation({
    pages,
    mode,
    firstSolo: prefs.firstSolo,
    initialIndex: initialPage - 1,
    containerRef,
  });
  const { page, setPage, lastIndex, spread, isLast, step, goTo, goToPlanche } = nav;

  /* ── Couches ouvertes (tiroir, aide, signalement) ───────────────────── */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [report, setReport] = useState<{ open: boolean; page: number | null }>({
    open: false,
    page: null,
  });

  const {
    hidden: chromeHidden,
    inView,
    reveal,
    hide,
  } = useReaderChrome(containerRef, settingsOpen);
  useImmersive(inView);
  const { fullscreen, toggleFullscreen } = useFullscreen(containerRef);

  const toggleSettings = useCallback(() => {
    setSettingsOpen((open) => !open);
    reveal();
  }, [reveal]);

  const openReport = useCallback((index?: number | null) => {
    setSettingsOpen(false);
    setReport({ open: true, page: typeof index === "number" ? index : null });
  }, []);

  /* ── Hydration : réglages de l'appareil puis reprise de lecture ─────── */
  const hydrated = useResume({
    hydrate: settings.hydrate,
    setPage,
    chapterId,
    initialPage,
    lastIndex,
    page,
    mode,
    containerRef,
    reveal,
  });

  /* ── Suivi ─────────────────────────────────────────────────────────── */
  useReadingProgress({
    chapterId,
    page: spread.start,
    lastIndex,
    startRef: nav.startRef,
    endRef: nav.endRef,
    canProgress,
    hydrated,
  });
  const onPageFailed = useFailureReport(chapterId);
  const { scrollProgress, showTop } = useVerticalTracking({
    containerRef,
    // Après hydration seulement : une mesure faite avant la reprise
    // (défilement encore en haut) écraserait la page reprise.
    enabled: hydrated && mode === "vertical",
    onPage: setPage,
  });

  /* ── Entrées ───────────────────────────────────────────────────────── */
  useReaderKeyboard({
    sens,
    step,
    first: () => goTo(0),
    last: () => goTo(lastIndex),
    toggleFullscreen,
    toggleSettings,
    cycleMode,
    cycleTheme,
    toggleHelp: () => setHelpOpen((open) => !open),
    escape: () => {
      if (helpOpen) {
        setHelpOpen(false);
        return "closed";
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return "closed";
      }
      return report.open ? "ignored" : null; // la modale se ferme elle-même
    },
  });

  const { startRef, endRef } = nav;
  useWheelPaging({
    zoneRef: pagesRef,
    enabled: mode !== "vertical",
    step,
    atStart: useCallback(() => startRef.current <= 0, [startRef]),
    atEnd: useCallback(() => endRef.current >= lastIndex, [endRef, lastIndex]),
  });
  const swipe = useSwipe(sens, step);

  /* ── Rendu ────────────────────────────────────────────────────────── */
  const layout = useMemo(() => fitLayout(prefs), [prefs]);
  const pageProps: PageProps = {
    pages,
    chapterNumero,
    unite,
    layout,
    onFailed: onPageFailed,
    onReport: openReport,
  };
  const serieHref = `/serie/${serieSlug}`;
  const courant = `${serieHref}/chapitre-${chapterNumero}`;

  return (
    <ReaderSettingsProvider value={settings}>
      <div
        ref={rootRef}
        data-theme={theme === "site" ? undefined : theme === "clair" ? "light" : "dark"}
        data-reader-theme={theme}
        /* Grand écran : sidebar de contrôles (360 px, repliable) + colonne de
           lecture ; mobile : colonne seule avec les barres auto-masquables. */
        className="relative -mx-4 lg:grid lg:grid-cols-[var(--reader-sidebar-w)_1fr] lg:transition-[grid-template-columns] lg:duration-300 lg:ease-in-out lg:motion-reduce:transition-none"
        style={{ "--reader-sidebar-w": `${collapsed ? 0 : SIDEBAR_WIDTH}px` } as CSSProperties}
      >
        <ReaderTopBar
          hidden={chromeHidden}
          serieHref={serieHref}
          serieTitre={serieTitre}
          unite={unite}
          chapitres={chapitres}
          courant={courant}
          settingsOpen={settingsOpen}
          onSettings={toggleSettings}
          onReport={() => openReport(null)}
          fullscreen={fullscreen}
          onFullscreen={toggleFullscreen}
          mobileOnly
        />

        <ReaderSidebar
          collapsed={collapsed}
          serieHref={serieHref}
          serieTitre={serieTitre}
          unite={unite}
          chapitres={chapitres}
          courant={courant}
          chapterNumero={chapterNumero}
          chapterTitre={chapterTitre}
          chapitreDate={chapitreDate}
          likes={initialLikes}
          chapterId={chapterId}
          plancheLabels={nav.plancheLabels}
          plancheIndex={nav.plancheIndex}
          onSeekPlanche={goToPlanche}
          onFirst={() => goTo(0)}
          onPrevPage={() => step(-1)}
          onNextPage={() => step(1)}
          onLast={() => goTo(lastIndex)}
          hasPrev={spread.start > 0}
          hasNext={!isLast}
          prevHref={prevHref}
          nextHref={nextHref}
          fullscreen={fullscreen}
          onFullscreen={toggleFullscreen}
          onReport={() => openReport(null)}
          onHelp={() => setHelpOpen(true)}
          onCollapse={() => update({ collapsed: true })}
        />

        <div
          ref={containerRef}
          className="relative overflow-x-clip bg-bg"
          {...swipe}
          data-chapter-id={chapterId}
        >
          <div
            ref={pagesRef}
            className={clsx(
              "relative flex items-center justify-center py-4",
              layout.fitOriginale && "overflow-x-auto",
            )}
            style={layout.zoneStyle}
          >
            {mode === "vertical" && <VerticalStrip {...pageProps} page={page} adult={adult} />}
            {mode === "single" && <SinglePage {...pageProps} page={page} />}
            {mode === "double" && (
              <DoublePage {...pageProps} spread={spread} position={nav.plancheIndex} sens={sens} />
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

          <MobilePageNav
            start={spread.start}
            total={pages.length}
            isLast={isLast}
            unite={unite}
            prevHref={prevHref}
            nextHref={nextHref}
            onFirst={() => goTo(0)}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onLast={() => goTo(lastIndex)}
          />

          {(mode === "vertical" || isLast) && (
            <EndOfChapter
              serieSlug={serieSlug}
              serieTitre={serieTitre}
              chapterId={chapterId}
              chapterNumero={chapterNumero}
              unite={unite}
              initialLikes={initialLikes}
              prevHref={prevHref}
              nextHref={nextHref}
              onReport={() => openReport(null)}
            />
          )}
        </div>

        {/* Replié, la barre de pied a disparu avec la colonne : ce bouton
            en bas à gauche suffit à rouvrir les contrôles. */}
        {collapsed && <ReaderSidebarReexpand onToggle={() => update({ collapsed: false })} />}
        {/* Barre de progression : seulement dans la zone de lecture (aucune
            barre sur les commentaires ou les suggestions de fin). */}
        {inView && (
          <ReaderProgressTicks
            planches={nav.planches.length}
            current={nav.plancheIndex}
            rtl={sens === "rtl"}
            onSeek={goToPlanche}
            left={inset.left + (collapsed ? 0 : SIDEBAR_WIDTH)}
            right={inset.right}
          />
        )}

        {mode === "vertical" && inView && <WebtoonProgressLine percent={scrollProgress} />}
        {mode === "vertical" && showTop && (
          <BackToTop
            onClick={() => {
              window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
              reveal();
            }}
          />
        )}

        <ReaderBottomBar
          hidden={chromeHidden}
          page={spread.start}
          total={pages.length}
          onSeek={goTo}
          prevHref={prevHref}
          nextHref={nextHref}
          unite={unite}
          mobileOnly
        />

        <ReaderSettings open={settingsOpen} onClose={() => setSettingsOpen(false)} />

        <ReportDialog
          key={`report-${report.page ?? "manual"}`}
          open={report.open}
          onClose={() => setReport((r) => ({ ...r, open: false }))}
          chapterId={chapterId}
          chapterNumero={chapterNumero}
          unite={unite}
          page={report.page}
        />

        <ReaderHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    </ReaderSettingsProvider>
  );
}
