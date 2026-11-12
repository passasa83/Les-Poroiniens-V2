"use client";

import clsx from "clsx";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Flag,
  Heart,
  Keyboard,
  Maximize,
  MessageCircle,
  Minimize,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  libelleUnite,
  libelleUniteSingulier,
  libelleVoisin,
  relativeTime,
  titreUnite,
} from "@/lib/format";
import type { Unite } from "@/lib/types";
import { Bloc, NavMini } from "./sidebar-blocks";
import { SidebarPreferences } from "./sidebar-preferences";

/** Largeur de la colonne de contrôles (motif de l'ancien lecteur : 360 px). */
export const SIDEBAR_WIDTH = 360;

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
  fullscreen,
  onFullscreen,
  onReport,
  onHelp,
  onCollapse,
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
  fullscreen: boolean;
  onFullscreen: () => void;
  onReport: () => void;
  /** Modale d'aide aux raccourcis (aussi ouverte par la touche `?`). */
  onHelp: () => void;
  /** Rabat la colonne de contrôles (barre en pied de sidebar). */
  onCollapse: () => void;
}) {
  const router = useRouter();
  const [commentaires, setCommentaires] = useState<number | null>(null);

  // Compteur de commentaires : simple statistique affichée dans la sidebar.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/comments?target=${encodeURIComponent(`chapter:${chapterId}`)}`,
        );
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

  const titre = libelleUnite(chapterNumero, unite);
  // « Chapitre 8 : Le vrai titre » — seulement si le Gérant a saisi un titre
  // autre que l'intitulé par défaut (évite « Chapitre 26 : Chapitre 26 »).
  const detail = titreUnite(chapterNumero, chapterTitre, unite);
  const titreAffiche = detail === titre ? titre : `${titre} : ${detail}`;

  return (
    <aside
      aria-label="Contrôles du lecteur"
      className={clsx(
        "sticky top-0 hidden h-screen flex-col gap-5 overflow-y-auto border-r border-line bg-surface p-4 lg:flex",
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
        <button
          type="button"
          className="btn-ghost px-2"
          aria-label="Raccourcis clavier"
          title="Raccourcis clavier (?)"
          onClick={onHelp}
        >
          <Keyboard className="size-4" />
        </button>
      </div>

      {/* Info : chapitre, série, statistiques */}
      <div className="space-y-1">
        <h2 className="text-sm font-bold text-fg">{titreAffiche}</h2>
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

      <SidebarPreferences />

      {/* Commentaires : rendus sous le lecteur (comme l'ancien site en
          webtoon) — le lien y conduit directement. */}
      <a href="#commentaires" className="btn-ghost min-h-11 w-full justify-center text-xs">
        <MessageCircle className="size-4" /> Commentaires du chapitre
      </a>

      {/* Barre de repli : ancrée en pied de colonne — elle reste collée en
          bas de la sidebar quand le contenu déborde (sticky), et reçoit le
          fond perdu des marges latérales (-mx-4) pour habiller le bord. */}
      <div className="sticky bottom-0 -mx-4 mt-auto border-t border-line bg-surface px-4 py-2 shadow-[0_-4px_12px_rgba(0,0,0,0.25)]">
        <button
          type="button"
          className="btn-ghost min-h-11 w-full justify-center text-xs"
          onClick={onCollapse}
          aria-label="Rabattre les contrôles"
          title="Rabattre les contrôles"
        >
          <ChevronLeft className="size-4" /> Rabattre les contrôles
        </button>
      </div>
    </aside>
  );
}
