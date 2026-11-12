import clsx from "clsx";
import { ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { libelleVoisin } from "@/lib/format";
import type { Unite } from "@/lib/types";

/**
 * Navigation de pages sous la lecture : mobile uniquement (grand écran, la
 * sidebar reprend ces contrôles, comme l'ancien lecteur). Aux extrémités,
 * les boutons deviennent des liens vers le chapitre voisin.
 */
export function MobilePageNav({
  start,
  total,
  isLast,
  unite,
  prevHref,
  nextHref,
  onFirst,
  onPrev,
  onNext,
  onLast,
}: {
  start: number;
  total: number;
  isLast: boolean;
  unite?: Unite | null;
  prevHref: string | null;
  nextHref: string | null;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-3 lg:hidden">
      <div className="flex items-center gap-2">
        <NavButton
          href={null}
          onClick={onFirst}
          label="Première page"
          icon={<ChevronsLeft className="size-4" />}
          disabled={start <= 0}
          iconOnly
        />
        <NavButton
          href={start > 0 ? null : prevHref}
          onClick={onPrev}
          label={start > 0 ? "Page précédente" : libelleVoisin("précédent", unite)}
          icon={<ChevronLeft className="size-4" />}
          disabled={start <= 0 && !prevHref}
        />
      </div>
      <span className="text-xs tabular-nums text-muted">
        Page {start + 1} / {total}
      </span>
      <div className="flex items-center gap-2">
        <NavButton
          href={isLast ? nextHref : null}
          onClick={onNext}
          label={isLast ? libelleVoisin("suivant", unite) : "Page suivante"}
          icon={<ChevronRight className="size-4" />}
          disabled={isLast && nextHref === null}
          align="right"
        />
        <NavButton
          href={null}
          onClick={onLast}
          label="Dernière page"
          icon={<ChevronsRight className="size-4" />}
          disabled={isLast}
          iconOnly
        />
      </div>
    </div>
  );
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
  icon: ReactNode;
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
  const className = clsx("btn-secondary text-sm", iconOnly && "px-2.5");

  if (href) {
    return (
      <Link href={href} className={className} {...aria}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} {...aria}>
      {content}
    </button>
  );
}

/** Webtoon : barre de progression fine en bas (mobile, où les ticks sont absents). */
export function WebtoonProgressLine({ percent }: { percent: number }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[65] h-[3px] lg:hidden" aria-hidden="true">
      <div
        className="h-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

/** Webtoon : retour en haut après un écran de défilement. */
export function BackToTop({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-20 right-4 z-40 flex size-11 items-center justify-center rounded-full border border-line bg-surface/90 text-fg shadow-lg backdrop-blur hover:text-primary lg:bottom-10"
      aria-label="Revenir en haut de la page"
    >
      <ArrowUp className="size-5" />
    </button>
  );
}
