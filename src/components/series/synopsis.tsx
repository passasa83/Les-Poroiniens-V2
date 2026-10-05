"use client";

import clsx from "clsx";
import { useState } from "react";

/**
 * Synopsis tronqué à 3 lignes avec bouton « Lire la suite » (§6.5).
 * Le texte reste intégralement dans le HTML : seule la hauteur change.
 */
export function Synopsis({ text, max = 220 }: { text: string; max?: number }) {
  const [open, setOpen] = useState(false);
  const long = text.replace(/\s+/g, " ").length > max;

  return (
    <div className="max-w-3xl space-y-1">
      <p
        className={clsx(
          "whitespace-pre-wrap text-sm leading-relaxed text-muted",
          long && !open && "line-clamp-3",
        )}
      >
        {text}
      </p>
      {long && (
        <button
          type="button"
          className="btn-ghost px-0 text-sm"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Réduire" : "Lire la suite"}
        </button>
      )}
    </div>
  );
}
