"use client";

import { ChevronLeft, ChevronRight, Flag, ImageOff, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { ReaderControls, type ReaderMode, type ReaderSens } from "./reader-controls";

const MODE_KEY = "lp-reader-mode";
const SENS_KEY = "lp-reader-sens";

const REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: "page_manquante", label: "Page manquante" },
  { value: "mauvaise_qualite", label: "Mauvaise qualité" },
  { value: "mauvais_ordre", label: "Mauvais ordre" },
  { value: "autre", label: "Autre" },
];

export type ReaderPage = { index: number; url: string; largeur?: number; hauteur?: number };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Lecteur de scans (§6.4) : vertical / page / double page, sens gauche-droite
 * ou droite-gauche, plein écran, raccourcis clavier, swipe tactile,
 * progression sauvegardée par lots et signalement de problème.
 */
export function Reader({
  pages,
  chapterId,
  chapterNumero,
  serieTitre,
  initialMode,
  initialSens,
  initialPage = 1,
  canProgress = false,
  prevHref = null,
  nextHref = null,
  nextChapterId = null,
}: {
  pages: ReaderPage[];
  chapterId: string;
  chapterNumero: number;
  serieTitre: string;
  initialMode?: ReaderMode;
  initialSens?: ReaderSens;
  initialPage?: number;
  canProgress?: boolean;
  prevHref?: string | null;
  nextHref?: string | null;
  /** Sert au préchargement de la première page du chapitre suivant (§7.2). */
  nextChapterId?: string | null;
}) {
  const total = pages.length;
  const lastIndex = Math.max(total - 1, 0);

  const [mode, setMode] = useState<ReaderMode>(initialMode ?? "vertical");
  const [sens, setSens] = useState<ReaderSens>(initialSens ?? "rtl");
  const [width, setWidth] = useState(100);
  const [page, setPage] = useState(() => clamp(initialPage - 1, 0, lastIndex));
  const [fullscreen, setFullscreen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportPage, setReportPage] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(page);
  const lastSentRef = useRef(0);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Pages dont le chargement a échec après reprise (§9.1), envoyées par lots. */
  const failedRef = useRef<Set<number>>(new Set());
  const failTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  /* ── Préférences mémorisées côté client (après hydration) ─────────── */
  useEffect(() => {
    // différé d'un tick : un setState synchrone dans un effet provoquerait
    // un rendu en cascade au montage
    const timer = window.setTimeout(() => {
    try {
        const savedMode = localStorage.getItem(MODE_KEY);
        if (savedMode === "vertical" || savedMode === "single" || savedMode === "double") {
          setMode(savedMode);
        }
        const savedSens = localStorage.getItem(SENS_KEY);
        if (savedSens === "ltr" || savedSens === "rtl") setSens(savedSens);
      } catch {
        /* stockage indisponible : on garde les préférences du profil */
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const changeMode = useCallback((next: ReaderMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignoré */
    }
  }, []);

  const changeSens = useCallback((next: ReaderSens) => {
    setSens(next);
    try {
      localStorage.setItem(SENS_KEY, next);
    } catch {
      /* ignoré */
    }
  }, []);

  /* ── Navigation ───────────────────────────────────────────────────── */

  const scrollToPage = useCallback((index: number) => {
    const el = containerRef.current?.querySelector(`#reader-page-${index}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

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

  /* ── Raccourcis clavier ───────────────────────────────────────────── */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

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
        case "Escape":
          if (document.fullscreenElement) void document.exitFullscreen();
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sens, step, toggleFullscreen]);

  /* ── Plein écran ──────────────────────────────────────────────────── */
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

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

  /* ── Échecs de chargement : remontée groupée (§9.1) ─────────────────── */
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

  const openReport = useCallback((index?: number | null) => {
    setReportPage(typeof index === "number" ? index : null);
    setReportOpen(true);
  }, []);

  useEffect(
    () => () => {
      if (failTimer.current) clearTimeout(failTimer.current);
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
  const widthStyle = useMemo(() => ({ width: `${clamp(width, 50, 100)}%` }), [width]);
  /** Page paysage : en double page elle s'affiche seule (§7.2). */
  const soloSpread = useMemo(() => isLandscape(pages[page]), [pages, page]);

  return (
    <div
      ref={containerRef}
      className="relative -mx-4 overflow-x-clip bg-bg"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <ReaderControls
        mode={mode}
        onMode={changeMode}
        sens={sens}
        onSens={changeSens}
        width={width}
        onWidth={setWidth}
        page={page}
        total={total}
        onSeek={goTo}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
        panelOpen={panelOpen}
        onPanel={() => setPanelOpen((v) => !v)}
        onReport={() => openReport(null)}
      />

      <div className="flex justify-center py-4">
        {mode === "vertical" && (
          <div className="space-y-2" style={widthStyle}>
            {pages.map((item, index) => (
              <ReaderImage
                key={`${index}:${item.url}`}
                page={item}
                index={index}
                chapterNumero={chapterNumero}
                eager={index === 0}
                onFailed={onPageFailed}
                onReport={openReport}
              />
            ))}
          </div>
        )}

        {mode === "single" && pages[page] && (
          <div className="w-full" style={widthStyle}>
            <ReaderImage
              key={`${page}:${pages[page].url}`}
              page={pages[page]}
              index={page}
              chapterNumero={chapterNumero}
              eager
              onFailed={onPageFailed}
              onReport={openReport}
            />
            <Prefetch pages={pages} from={page + 1} />
          </div>
        )}

        {mode === "double" && (
          <div
            className={soloSpread ? "w-full" : "flex w-full items-start justify-center gap-1"}
            style={widthStyle}
          >
            {soloSpread ? (
              <ReaderImage
                key={`${page}:${pages[page]?.url ?? ""}`}
                page={pages[page]}
                index={page}
                chapterNumero={chapterNumero}
                eager
                onFailed={onPageFailed}
                onReport={openReport}
              />
            ) : (
              <>
                <div className="w-1/2">
                  {pages[sens === "rtl" ? page + 1 : page] && (
                    <ReaderImage
                      key={`${sens === "rtl" ? page + 1 : page}:${
                        pages[sens === "rtl" ? page + 1 : page].url
                      }`}
                      page={pages[sens === "rtl" ? page + 1 : page]}
                      index={sens === "rtl" ? page + 1 : page}
                      chapterNumero={chapterNumero}
                      eager={page <= 2}
                      onFailed={onPageFailed}
                      onReport={openReport}
                    />
                  )}
                </div>
                <div className="w-1/2">
                  {pages[sens === "rtl" ? page : page + 1] && (
                    <ReaderImage
                      key={`${sens === "rtl" ? page : page + 1}:${
                        pages[sens === "rtl" ? page : page + 1].url
                      }`}
                      page={pages[sens === "rtl" ? page : page + 1]}
                      index={sens === "rtl" ? page : page + 1}
                      chapterNumero={chapterNumero}
                      eager={page <= 2}
                      onFailed={onPageFailed}
                      onReport={openReport}
                    />
                  )}
                </div>
                <Prefetch pages={pages} from={page + 2} />
              </>
            )}
          </div>
        )}
      </div>

      <NextChapterPrefetch chapterId={nextChapterId} active={isLast} />

      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <NavButton
          href={page > 0 ? null : prevHref}
          onClick={() => step(-1)}
          label={page > 0 ? "Page précédente" : "Chapitre précédent"}
          icon={<ChevronLeft className="size-4" />}
          disabled={page <= 0 && !prevHref}
        />
        <span className="text-xs tabular-nums text-muted">
          Page {page + 1} / {total}
        </span>
        <NavButton
          href={isLast ? nextHref : null}
          onClick={() => step(1)}
          label={isLast ? "Chapitre suivant" : "Page suivante"}
          icon={<ChevronRight className="size-4" />}
          disabled={!isLast ? false : nextHref === null}
          align="right"
        />
      </div>

      {showEnd && (
        <section className="border-t border-line bg-surface px-4 py-6 text-center">
          <p className="section-title">Chapitre terminé</p>
          <p className="mt-1 text-sm text-muted">
            {serieTitre} — chapitre {chapterNumero}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {prevHref ? (
              <Link href={prevHref} className="btn-secondary">
                <ChevronLeft className="size-4" /> Chapitre précédent
              </Link>
            ) : (
              <span className="btn-secondary opacity-50">Chapitre précédent</span>
            )}
            <a href="#commentaires" className="btn-ghost">
              Commentaires du chapitre
            </a>
            {nextHref ? (
              <Link href={nextHref} className="btn-primary">
                Chapitre suivant <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span className="btn-primary opacity-50">Dernier chapitre</span>
            )}
          </div>
        </section>
      )}

      <ReportDialog
        key={`report-${reportPage ?? "manual"}`}
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        chapterId={chapterId}
        chapterNumero={chapterNumero}
        page={reportPage}
      />
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

/** Une page est paysage quand sa largeur dépasse sa hauteur (§7.2). */
function isLandscape(page: ReaderPage | undefined): boolean {
  return Boolean(page?.largeur && page.hauteur && page.largeur > page.hauteur);
}

/**
 * Page de scan avec reprise (§7.2) : 2 nouvelles tentatives avec délai
 * croissant, puis une page de remplacement avec bouton « Signaler un
 * problème ». Dimensions toujours transmises au DOM : aucune surprise de
 * mise en page (CLS < 0,05).
 */
const MAX_RETRIES = 2;

function ReaderImage({
  page,
  index,
  chapterNumero,
  eager,
  onFailed,
  onReport,
}: {
  page: ReaderPage;
  index: number;
  chapterNumero: number;
  eager: boolean;
  onFailed: (index: number) => void;
  onReport: (index: number) => void;
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
  const alt = `Page ${index + 1} du chapitre ${chapterNumero}`;

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
        className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface2 p-6 text-center"
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
      className="w-full select-none"
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

function ReportDialog({
  open,
  onClose,
  chapterId,
  chapterNumero,
  page,
}: {
  open: boolean;
  onClose: () => void;
  chapterId: string;
  chapterNumero: number;
  page: number | null;
}) {
  // Signalement déclenché depuis une page en échec : le motif est pré-rempli
  // à l'ouverture (le parent re-clé le composant quand `page` change).
  const [raison, setRaison] = useState(
    typeof page === "number" ? "page_manquante" : REPORT_REASONS[0].value,
  );
  const [details, setDetails] = useState(
    typeof page === "number"
      ? `Page ${page + 1} du chapitre ${chapterNumero} : impossible à charger malgré les reprises automatiques.`
      : "",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "chapter", targetId: chapterId, raison, details }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (res.status === 401) {
        setError("Vous devez être connecté pour signaler un problème.");
        return;
      }
      if (!res.ok) {
        setError(data?.error ?? "Signalement impossible, réessayez.");
        return;
      }
      setDetails("");
      onClose();
    } catch {
      setError("Erreur réseau, réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Signaler un problème">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Ce problème sera transmis à l’équipe de modération.
        </p>
        <div className="space-y-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex items-center gap-2 text-muted">
              <input
                type="radio"
                name="reader-report-reason"
                value={r.value}
                checked={raison === r.value}
                onChange={() => setRaison(r.value)}
                className="accent-primary"
              />
              {r.label}
            </label>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="reader-report-details">
            Détail (facultatif)
          </label>
          <textarea
            id="reader-report-details"
            className="input min-h-20 resize-y"
            maxLength={2000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Ex. : la page 7 manque, les planches sont inversées…"
          />
        </div>
        {error && <p className="text-xs text-adult">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="button" className="btn-danger" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}
            Envoyer
          </button>
        </div>
      </div>
    </Modal>
  );
}
