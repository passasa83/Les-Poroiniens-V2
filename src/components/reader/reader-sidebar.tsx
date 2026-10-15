"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Flag,
  Heart,
  Maximize,
  MessageCircle,
  Minimize,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { libelleUnite, libelleUniteSingulier, libelleVoisin, relativeTime } from "@/lib/format";
import type { Unite } from "@/lib/types";
import {
  READER_FITS,
  READER_MODES,
  type ReaderFit,
  type ReaderMode,
  type ReaderSens,
} from "./reader-settings";

/** Largeur de la colonne de contrôles (motif de l'ancien lecteur : 360 px). */
export const SIDEBAR_WIDTH = 360;

/* ── Petits blocs de la sidebar ───────────────────────────────────── */

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titre}</p>
      {children}
    </div>
  );
}

/** Sélecteur segmenté compact (motif du tiroir de réglages, en plus dense). */
function Segment<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ key: T; label: string }>;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
          className={clsx(
            "chip min-h-11 flex-1 justify-center px-2 text-xs",
            value === option.key && "chip-active",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Bouton de navigation de la sidebar : lien de chapitre ou action de page. */
function NavMini({
  href,
  onClick,
  label,
  icon,
  disabled,
}: {
  href: string | null;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  const aria = { "aria-label": label, title: label };
  if (href) {
    return (
      <Link href={href} className="btn-secondary min-h-11 px-2.5" {...aria}>
        {icon}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className="btn-secondary min-h-11 px-2.5"
      onClick={onClick}
      disabled={disabled}
      {...aria}
    >
      {icon}
    </button>
  );
}

/* ── Barre de progression à ticks (bas de page, grand écran) ──────── */

/**
 * Barre fixe en bas, un tick par planche, cliquable (motif de l'ancien
 * lecteur). En lecture droite-à-gauche les ticks sont inversés ; le clic
 * est traduit en index de planche quel que soit le sens.
 */
export function ReaderProgressTicks({
  planches,
  current,
  rtl,
  onSeek,
  left,
}: {
  planches: number;
  current: number;
  rtl: boolean;
  onSeek: (index: number) => void;
  /** Décalage gauche (largeur de la sidebar), en pixels. */
  left: number;
}) {
  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || planches <= 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const visual = Math.min(planches - 1, Math.max(0, Math.floor(ratio * planches)));
    onSeek(rtl ? planches - 1 - visual : visual);
  }

  return (
    <div
      role="group"
      aria-label="Progression de lecture"
      onClick={onClick}
      style={{ left: `${left}px` }}
      className={clsx(
        "fixed bottom-0 right-0 z-40 hidden h-[22px] cursor-pointer items-center gap-[2px] border-t border-line bg-surface/85 px-[5px] backdrop-blur transition-[left] duration-300 ease-in-out lg:flex lg:motion-reduce:transition-none",
        rtl && "flex-row-reverse",
      )}
    >
      {Array.from({ length: planches }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={clsx(
            "h-1.5 flex-1 rounded-[1px] transition-colors",
            index === current
              ? "h-2.5 bg-primary"
              : index < current
                ? "bg-primary/50 hover:bg-primary/70"
                : "bg-fg/20 hover:bg-fg/40",
          )}
        />
      ))}
    </div>
  );
}

/* ── Bouton de repli de la sidebar ────────────────────────────────── */

export function ReaderSidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = collapsed ? "Afficher les contrôles" : "Masquer les contrôles";
  return (
    <button
      type="button"
      className={clsx(
        "fixed top-1/2 z-40 hidden h-[50px] w-7 -translate-y-1/2 items-center justify-center",
        "rounded-r-lg border border-l-0 border-line bg-surface text-muted shadow-md hover:text-fg",
        "transition-[left] duration-300 ease-in-out lg:flex lg:motion-reduce:transition-none",
      )}
      style={{ left: `${collapsed ? 0 : SIDEBAR_WIDTH}px` }}
      onClick={onToggle}
      aria-label={label}
      title={label}
      aria-expanded={!collapsed}
    >
      <ChevronLeft
        className={clsx(
          "size-4 transition-transform duration-300 motion-reduce:transition-none",
          collapsed && "rotate-180",
        )}
      />
    </button>
  );
}

/* ── Sidebar du lecteur (grand écran) ─────────────────────────────── */

/**
 * Colonne de contrôles de l'ancien lecteur : titre et stats du chapitre,
 * navigation chapitre / page (sélecteurs compris), mode, sens, décalage
 * double page, ajustement de l'image (bouton cyclique) et réglages
 * « Personnalisé » (étirer + limites largeur / hauteur).
 */
export function ReaderSidebar({
  collapsed,
  serieHref,
  serieTitre,
  unite,
  chapitres,
  courant,
  chapterNumero,
  chapterTitre,
  chapitreDate,
  likes,
  chapterId,
  plancheLabels,
  plancheIndex,
  onSeekPlanche,
  onFirst,
  onPrevPage,
  onNextPage,
  onLast,
  hasPrev,
  hasNext,
  prevHref,
  nextHref,
  mode,
  onMode,
  sens,
  onSens,
  fit,
  onFitCycle,
  firstSolo,
  onFirstSolo,
  stretch,
  onStretch,
  limitW,
  onLimitW,
  maxw,
  onMaxw,
  limitH,
  onLimitH,
  maxh,
  onMaxh,
  fullscreen,
  onFullscreen,
  onReport,
}: {
  collapsed: boolean;
  serieHref: string;
  serieTitre: string;
  unite?: Unite | null;
  chapitres: Array<{ numero: number; href: string }>;
  courant: string;
  chapterNumero: number;
  chapterTitre?: string;
  chapitreDate?: string | null;
  likes: number;
  chapterId: string;
  plancheLabels: string[];
  plancheIndex: number;
  onSeekPlanche: (index: number) => void;
  onFirst: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onLast: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  prevHref: string | null;
  nextHref: string | null;
  mode: ReaderMode;
  onMode: (m: ReaderMode) => void;
  sens: ReaderSens;
  onSens: (s: ReaderSens) => void;
  fit: ReaderFit;
  onFitCycle: () => void;
  firstSolo: boolean;
  onFirstSolo: (v: boolean) => void;
  stretch: boolean;
  onStretch: (v: boolean) => void;
  limitW: boolean;
  onLimitW: (v: boolean) => void;
  maxw: number;
  onMaxw: (w: number) => void;
  limitH: boolean;
  onLimitH: (v: boolean) => void;
  maxh: number;
  onMaxh: (h: number) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  onReport: () => void;
}) {
  const router = useRouter();
  const [commentaires, setCommentaires] = useState<number | null>(null);

  // Compteur de commentaires : simple statistique affichée dans la sidebar.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/comments?target=${encodeURIComponent(`chapter:${chapterId}`)}`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { total?: number };
        if (typeof data.total === "number") setCommentaires(data.total);
      } catch {
        /* statistique facultative */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chapterId]);

  const fitLabel = READER_FITS.find((f) => f.key === fit)?.label ?? "";
  const fitAide = READER_FITS.find((f) => f.key === fit)?.aide ?? "";
  const titre = libelleUnite(chapterNumero, unite);

  return (
    <aside
      aria-label="Contrôles du lecteur"
      className={clsx(
        "sticky top-0 hidden h-screen flex-col gap-5 overflow-y-auto border-r border-line bg-surface p-4 pb-10 lg:flex",
        collapsed && "invisible overflow-hidden opacity-0",
      )}
    >
      {/* Actions globales */}
      <div className="flex items-center gap-1">
        <Link
          href={serieHref}
          className="btn-ghost min-h-11 flex-1 justify-center px-2 text-xs"
          aria-label={`Retour à la série ${serieTitre}`}
        >
          <ArrowLeft className="size-4" />
          <span className="truncate">Retour à la série</span>
        </Link>
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
          className="btn-ghost px-2"
          aria-label="Signaler une erreur"
          onClick={onReport}
        >
          <Flag className="size-4" />
        </button>
      </div>

      {/* Info : chapitre, série, statistiques */}
      <div className="space-y-1">
        <h2 className="text-sm font-bold text-fg">
          {titre}
          {chapterTitre ? ` : ${chapterTitre}` : ""}
        </h2>
        <Link href={serieHref} className="block truncate text-xs text-muted hover:text-fg">
          {serieTitre}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1" title="J'aime">
            <Heart className="size-3.5" /> {likes}
          </span>
          <span className="inline-flex items-center gap-1" title="Commentaires">
            <MessageCircle className="size-3.5" /> {commentaires ?? "—"}
          </span>
          {chapitreDate && (
            <span className="inline-flex items-center gap-1" title="Date de publication">
              <Clock className="size-3.5" /> {relativeTime(chapitreDate)}
            </span>
          )}
        </div>
      </div>

      {/* Chapitre précédent / suivant + sélecteur */}
      <Bloc titre="Chapitre">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1.5">
          <NavMini
            href={prevHref}
            onClick={() => undefined}
            label={libelleVoisin("précédent", unite)}
            icon={<ChevronLeft className="size-4" />}
            disabled={prevHref === null}
          />
          <select
            className="min-h-11 min-w-0 rounded-lg border border-line bg-surface2 px-2 text-xs font-semibold text-fg"
            aria-label={`Sélecteur de ${libelleUniteSingulier(unite).toLowerCase()}`}
            value={courant}
            onChange={(e) => {
              const href = e.target.value;
              if (href) router.push(href);
            }}
          >
            {chapitres.map((c) => (
              <option key={c.numero} value={c.href}>
                {libelleUnite(c.numero, unite)}
              </option>
            ))}
          </select>
          <NavMini
            href={nextHref}
            onClick={() => undefined}
            label={libelleVoisin("suivant", unite)}
            icon={<ChevronRight className="size-4" />}
            disabled={nextHref === null}
          />
        </div>
      </Bloc>

      {/* Page : première, précédente, sélecteur, suivante, dernière */}
      <Bloc titre="Page">
        <div className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-1.5">
          <NavMini
            href={null}
            onClick={onFirst}
            label="Première page"
            icon={<ChevronsLeft className="size-4" />}
            disabled={!hasPrev}
          />
          <NavMini
            href={null}
            onClick={onPrevPage}
            label="Page précédente"
            icon={<ChevronLeft className="size-4" />}
            disabled={!hasPrev}
          />
          <select
            className="min-h-11 min-w-0 rounded-lg border border-line bg-surface2 px-2 text-center text-xs font-semibold text-fg"
            aria-label="Sélecteur de page"
            value={String(plancheIndex)}
            onChange={(e) => onSeekPlanche(Number(e.target.value))}
          >
            {plancheLabels.map((label, index) => (
              <option key={label} value={String(index)}>
                {label}
              </option>
            ))}
          </select>
          <NavMini
            href={null}
            onClick={onNextPage}
            label="Page suivante"
            icon={<ChevronRight className="size-4" />}
            disabled={!hasNext}
          />
          <NavMini
            href={null}
            onClick={onLast}
            label="Dernière page"
            icon={<ChevronsRight className="size-4" />}
            disabled={!hasNext}
          />
        </div>
      </Bloc>

      {/* Mode de lecture */}
      <Bloc titre="Mode de lecture">
        <Segment
          label="Mode de lecture"
          value={mode}
          onChange={onMode}
          options={READER_MODES.map((m) => ({ key: m.key, label: m.label }))}
        />
      </Bloc>

      {/* Sens de lecture (le webtoon défile de haut en bas) */}
      {mode !== "vertical" && (
        <Bloc titre="Sens de lecture">
          <Segment
            label="Sens de lecture"
            value={sens}
            onChange={onSens}
            options={[
              { key: "rtl", label: "D → G" },
              { key: "ltr", label: "G → D" },
            ]}
          />
        </Bloc>
      )}

      {/* Décalage double page (uniquement en mode double) */}
      {mode === "double" && (
        <Bloc titre="Décalage double page">
          <Segment
            label="Décalage double page (première page seule)"
            value={firstSolo ? "1" : "0"}
            onChange={(v) => onFirstSolo(v === "1")}
            options={[
              { key: "0", label: "Non" },
              { key: "1", label: "Oui" },
            ]}
          />
          <p className="text-xs text-muted">
            Isole la première page dans sa planche (couverture).
          </p>
        </Bloc>
      )}

      {/* Ajustement de l'image : bouton cyclique (motif de l'ancien lecteur) */}
      <Bloc titre="Ajustement de l'image">
        <button
          type="button"
          className="btn-secondary min-h-11 w-full justify-between px-3 text-xs"
          onClick={onFitCycle}
          title="Changer d'ajustement"
        >
          <span className="truncate">{fitLabel}</span>
          <ChevronDown className="size-4 shrink-0" />
        </button>
        <p className="text-xs text-muted">{fitAide}</p>

        {fit === "perso" && (
          <div className="space-y-3 pt-1">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs text-fg">
              <input
                type="checkbox"
                checked={stretch}
                onChange={(e) => onStretch(e.target.checked)}
                className="size-4 accent-primary"
              />
              Étirer les petites pages
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs text-fg">
              <input
                type="checkbox"
                checked={limitW}
                onChange={(e) => onLimitW(e.target.checked)}
                className="size-4 accent-primary"
              />
              Limiter la largeur
            </label>
            {limitW && (
              <div className="space-y-1 pl-1">
                <input
                  type="range"
                  min={400}
                  max={3000}
                  step={10}
                  value={maxw}
                  onChange={(e) => onMaxw(Number(e.target.value))}
                  aria-label="Largeur maximale des pages"
                  className="reader-progress w-full accent-primary"
                />
                <input
                  type="number"
                  min={400}
                  max={3000}
                  step={10}
                  value={maxw}
                  onChange={(e) => onMaxw(Number(e.target.value))}
                  aria-label="Largeur maximale en pixels"
                  className="w-24 rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-fg"
                />
              </div>
            )}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-xs text-fg">
              <input
                type="checkbox"
                checked={limitH}
                onChange={(e) => onLimitH(e.target.checked)}
                className="size-4 accent-primary"
              />
              Limiter la hauteur
            </label>
            {limitH && (
              <div className="space-y-1 pl-1">
                <input
                  type="range"
                  min={400}
                  max={3000}
                  step={10}
                  value={maxh}
                  onChange={(e) => onMaxh(Number(e.target.value))}
                  aria-label="Hauteur maximale des pages"
                  className="reader-progress w-full accent-primary"
                />
                <input
                  type="number"
                  min={400}
                  max={3000}
                  step={10}
                  value={maxh}
                  onChange={(e) => onMaxh(Number(e.target.value))}
                  aria-label="Hauteur maximale en pixels"
                  className="w-24 rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-fg"
                />
              </div>
            )}
          </div>
        )}
      </Bloc>

      {/* Commentaires : rendus sous le lecteur (comme l'ancien site en
          webtoon) — le lien y conduit directement. */}
      <a href="#commentaires" className="btn-ghost min-h-11 w-full justify-center text-xs">
        <MessageCircle className="size-4" /> Commentaires du chapitre
      </a>
    </aside>
  );
}
