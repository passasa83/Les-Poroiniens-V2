"use client";

import clsx from "clsx";
import Link from "next/link";

/* ── Petits blocs de la sidebar ───────────────────────────────────── */

export function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{titre}</p>
      {children}
    </div>
  );
}

/** Sélecteur segmenté compact (motif du tiroir de réglages, en plus dense). */
export function Segment<T extends string>({
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
export function NavMini({
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
