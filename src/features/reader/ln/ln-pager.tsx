"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { libelleVoisin } from "@/lib/format";
import type { Unite } from "@/lib/types";

/** Pager haut / bas : précédent, « Haut », suivant (bornes désactivées). */
export function LnPager({
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
      aria-label={
        position === "haut" ? "Navigation de lecture (haut)" : "Navigation de lecture (bas)"
      }
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
