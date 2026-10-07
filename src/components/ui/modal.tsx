"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Éléments focalisables d'une modale (« fermeture Échap, focus piégé »). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modale accessible : fermeture par Échap et clic extérieur, focus déplacé à
 * l'ouverture, **piégé** tant qu'elle est ouverte (Tab circule à l'intérieur)
 * puis rendu à l'élément qui l'a déclenchée. Respecte `prefers-reduced-motion`
 * (aucune animation n'est utilisée ici).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  labelledBy?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  /* `onClose` est souvent une flèche : suivie par ref, elle ne relance pas
     l'effet de focus à chaque rendu du parent. */
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (el) =>
          el.tabIndex >= 0 &&
          !el.closest('[aria-hidden="true"]') &&
          !el.closest("[inert]"),
      );

    const first = focusables()[0];
    (first ?? dialog)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const list = focusables();
      if (list.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const inside = Boolean(active && dialog?.contains(active));

      if (event.shiftKey && (active === firstEl || !inside)) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && (active === lastEl || !inside)) {
        event.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={labelledBy ? undefined : title}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      ref={dialogRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
        {title && (
          <h2 className="mb-3 text-lg font-bold text-fg" id={labelledBy}>
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
}
