"use client";

import { useEffect, type ReactNode } from "react";

/**
 * Modale accessible (focus trap minimal, fermeture Échap, fond cliquable).
 * Utilisée pour le gate +18, les confirmations et les formulaires courts.
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
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="card w-full max-w-lg p-6" aria-labelledby={labelledBy}>
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
