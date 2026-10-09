"use client";

import { ArrowUp, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChapterLike } from "./chapter-like";
import { ReaderTopBar, useReaderChrome } from "./reader-chrome";
import { ReportDialog } from "./reader-report";
import {
  LN_DEFAULTS,
  LN_FONT_STACKS,
  LnReaderSettings,
  loadLnSettings,
  normalizeLnSettings,
  saveLnSettings,
  type LnSettings,
} from "./ln-reader-settings";
import { libelleUnite, libelleUniteSingulier, libelleVoisin, titreUnite } from "@/lib/format";
import type { Unite } from "@/lib/types";

/** Position de lecture mémorisée par chapitre (fraction 0–1 du défilement). */
const progressKey = (chapterId: string) => `lp-ln-progress:${chapterId}`;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/**
 * Lecteur de light novel — port du `LNReader` de l'ancien site :
 * colonne de texte centrée (820 px), réglages police / taille / interligne /
 * lettrage / alignement mémorisés (avec migration des réglages du site v1),
 * pagers haut et bas, chapitre précédent / suivant au clavier, bouton
 * « Retour en haut », reprise de position locale.
 *
 * Améliorations sur l'original : navigation par route (pas de rechargement),
 * garde-fous sur les champs de saisie, aucun HTML injecté (paragraphes en
 * React), thème hérité du site (le bouton jour/nuit de l'ancien était mort).
 */
export function LnReader({
  contenu,
  chapterId,
  chapterNumero,
  chapterTitre,
  serieSlug,
  serieTitre,
  unite,
  chapitres,
  initialLikes = 0,
  prevHref = null,
  nextHref = null,
}: {
  /** Paragraphes du chapitre (découpés côté serveur). */
  contenu: string[];
  chapterId: string;
  chapterNumero: number;
  /** Titre propre du chapitre, s'il diffère du libellé par défaut. */
  chapterTitre?: string | null;
  serieSlug: string;
  serieTitre: string;
  unite?: Unite | null;
  chapitres: Array<{ numero: number; href: string }>;
  initialLikes?: number;
  prevHref?: string | null;
  nextHref?: string | null;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<LnSettings>(LN_DEFAULTS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [backTop, setBackTop] = useState(false);
  /** État post-hydration : réglages et reprise lus en différé. */
  const [hydrated, setHydrated] = useState(false);

  const containerRef = useRef<HTMLElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreDoneRef = useRef(false);

  const href = `/serie/${serieSlug}/chapitre-${chapterNumero}`;
  const heading = titreUnite(chapterNumero, chapterTitre ?? null, unite);

  /* ── Chrome immersif : mêmes barres que le lecteur manga ───────────── */
  const { hidden: chromeHidden, inView, reveal } = useReaderChrome(containerRef, settingsOpen);

  useEffect(() => {
    document.body.dataset.readerImmersive = inView ? "on" : "off";
    return () => {
      delete document.body.dataset.readerImmersive;
    };
  }, [inView]);

  /* ── Réglages mémorisés (migration de l'ancien site incluse) ───────── */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSettings(loadLnSettings() ?? LN_DEFAULTS);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const changeSettings = useCallback((next: LnSettings) => {
    setSettings(normalizeLnSettings(next));
    saveLnSettings(next);
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(LN_DEFAULTS);
    saveLnSettings(LN_DEFAULTS);
  }, []);

  /* ── Position de lecture : sauvegarde (debounce 1 s) et reprise ─────── */
  const saveProgress = useCallback(() => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    try {
      localStorage.setItem(progressKey(chapterId), clamp01(window.scrollY / max).toFixed(4));
    } catch {
      /* stockage indisponible : reprise non mémorisée */
    }
  }, [chapterId]);

  useEffect(() => {
    if (!hydrated || restoreDoneRef.current) return;
    restoreDoneRef.current = true;
    let percent = 0;
    try {
      percent = Number(localStorage.getItem(progressKey(chapterId)));
    } catch {
      /* stockage indisponible : lecture depuis le début */
    }
    if (!Number.isFinite(percent) || percent < 0.02) return;
    const apply = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0) window.scrollTo({ top: clamp01(percent) * max, behavior: "auto" });
    };
    // Après peinture du texte : la hauteur du document est stable (aucune image).
    window.requestAnimationFrame(apply);
  }, [hydrated, chapterId]);

  useEffect(() => {
    if (!hydrated) return;
    const onScroll = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(saveProgress, 1000);
      setBackTop(window.scrollY > 400);
    };
    const onHide = () => saveProgress();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onHide);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [hydrated, saveProgress]);

  /* ── Navigation de chapitres ───────────────────────────────────────── */
  const goToChapter = useCallback(
    (target: string | null) => {
      if (target) router.push(target);
    },
    [router],
  );

  const scrollTop = useCallback(() => {
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, []);

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

  // Synchronisation de l'icône quand le plein écran sort (Échap système).
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* ── Raccourcis clavier ────────────────────────────────────────────── */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && settingsOpen) {
        event.preventDefault();
        setSettingsOpen(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          goToChapter(nextHref);
          break;
        case "ArrowLeft":
          event.preventDefault();
          goToChapter(prevHref);
          break;
        case "m":
        case "M":
          event.preventDefault();
          toggleSettings();
          break;
        case "f":
        case "F":
          event.preventDefault();
          toggleFullscreen();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen, nextHref, prevHref, goToChapter, toggleSettings, toggleFullscreen]);

  /* ── Styles de colonne de texte (variables CSS, comme l'ancien) ────── */
  const textStyle = useMemo<React.CSSProperties>(
    () => ({
      fontFamily: LN_FONT_STACKS[settings.font],
      fontSize: `${settings.size}em`,
      lineHeight: settings.leading,
      letterSpacing: `${settings.tracking}px`,
      textAlign: settings.align,
    }),
    [settings],
  );

  return (
    <div className="relative -mx-4">
      <ReaderTopBar
        hidden={chromeHidden}
        serieHref={`/serie/${serieSlug}`}
        serieTitre={serieTitre}
        unite={unite}
        chapitres={chapitres}
        courant={href}
        settingsOpen={settingsOpen}
        onSettings={toggleSettings}
        onReport={() => setReportOpen(true)}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
      />

      <article
        ref={containerRef}
        className="mx-auto w-full max-w-[860px] space-y-6 px-4 py-6"
        data-chapter-id={chapterId}
      >
        <LnPager
          position="haut"
          prevHref={prevHref}
          nextHref={nextHref}
          unite={unite}
          onTop={scrollTop}
        />

        <header className="border-b border-line pb-4">
          <h1 className="text-xl font-bold text-fg">{heading}</h1>
          <p className="mt-1 text-sm text-muted">
            {serieTitre} — {libelleUniteSingulier(unite).toLowerCase()} en lecture continue
          </p>
        </header>

        {/* Aucun HTML injecté : chaque paragraphe est un nœud React, les
            retours à la ligne internes passent par `whitespace-pre-line`. */}
        <div
          className="max-w-[820px] space-y-4 text-fg [overflow-wrap:anywhere]"
          style={textStyle}
        >
          {contenu.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>

        <LnPager
          position="bas"
          prevHref={prevHref}
          nextHref={nextHref}
          unite={unite}
          onTop={scrollTop}
        />

        <section
          className="rounded-xl border border-line bg-surface px-4 py-6 text-center"
          aria-labelledby="ln-fin-titre"
        >
          <p className="section-title" id="ln-fin-titre">
            {libelleUniteSingulier(unite).toLowerCase()} terminé
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
            <button type="button" className="btn-ghost" onClick={() => setReportOpen(true)}>
              <Flag className="size-4" /> Signaler un problème
            </button>
          </div>
        </section>
      </article>

      {/* Retour en haut : visible au-delà de 400 px (comme l'ancien). */}
      <button
        type="button"
        aria-label="Revenir en haut de la page"
        onClick={scrollTop}
        className={
          backTop
            ? "fixed bottom-6 right-4 z-40 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-lg transition-opacity motion-reduce:transition-none"
            : "pointer-events-none fixed bottom-6 right-4 z-40 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-fg opacity-0 shadow-lg transition-opacity motion-reduce:transition-none"
        }
      >
        <ArrowUp className="size-5" />
      </button>

      <LnReaderSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={changeSettings}
        onReset={resetSettings}
      />

      <ReportDialog
        key={`ln-report-${chapterId}`}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        chapterId={chapterId}
        chapterNumero={chapterNumero}
        unite={unite}
        page={null}
      />
    </div>
  );
}

/** Pager haut / bas : précédent, « Haut », suivant (bornes désactivées). */
function LnPager({
  position,
  prevHref,
  nextHref,
  unite,
  onTop,
}: {
  position: "haut" | "bas";
  prevHref: string | null;
  nextHref: string | null;
  unite?: Unite | null;
  onTop: () => void;
}) {
  return (
    <nav
      aria-label={position === "haut" ? "Navigation de lecture (haut)" : "Navigation de lecture (bas)"}
      className="flex items-center justify-between gap-2"
    >
      {prevHref ? (
        <Link href={prevHref} className="btn-secondary text-sm">
          <ChevronLeft className="size-4" /> {libelleVoisin("précédent", unite)}
        </Link>
      ) : (
        <button type="button" className="btn-secondary text-sm" disabled>
          <ChevronLeft className="size-4" /> {libelleVoisin("précédent", unite)}
        </button>
      )}

      {position === "haut" || position === "bas" ? (
        <button type="button" className="btn-ghost text-sm" onClick={onTop}>
          Haut
        </button>
      ) : null}

      {nextHref ? (
        <Link href={nextHref} className="btn-secondary text-sm">
          {libelleVoisin("suivant", unite)} <ChevronRight className="size-4" />
        </Link>
      ) : (
        <button type="button" className="btn-secondary text-sm" disabled>
          {libelleVoisin("suivant", unite)} <ChevronRight className="size-4" />
        </button>
      )}
    </nav>
  );
}
