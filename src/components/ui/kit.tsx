import clsx from "clsx";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/* ── Boutons ─────────────────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={clsx(`btn-${variant}`, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  className,
  children,
  href,
}: {
  variant?: Variant;
  className?: string;
  children: ReactNode;
  href: string;
}) {
  return (
    <a href={href} className={clsx(`btn-${variant}`, className)}>
      {children}
    </a>
  );
}

/* ── Formulaires ─────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  /* Les identifiants `-hint` / `-error` permettent aux champs de déclarer
     `aria-describedby` et d'annoncer l'aide et l'erreur au bon endroit (§8.1). */
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-muted" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-adult" id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </p>
      )}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="input min-h-24 resize-y" {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="input appearance-none" {...props} />;
}

/* ── Affichage ───────────────────────────────────────────────────────── */

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "primary" | "adult" | "ok" | "warn";
  children: ReactNode;
  className?: string;
}) {
  /* Teinte de fond à 5 % : le texte coloré doit rester lisible (AA ≥ 4,5:1)
     sur --surface (clair comme sombre). À 15 %, le fond teinté rapprochait
     trop les tons clairs (« warn », « accent ») de leur propre texte :
     minimum mesuré 4,08:1. À 5 %, le minimum remonte à 4,68:1 (§3.3 / §6.7). */
  const tones = {
    neutral: "bg-surface2 text-muted",
    primary: "bg-primary/5 text-primary",
    adult: "bg-adult/5 text-adult",
    ok: "bg-ok/5 text-ok",
    warn: "bg-warn/5 text-warn",
  };
  return <span className={clsx("badge", tones[tone], className)}>{children}</span>;
}

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return <Tag className={clsx("card", className)}>{children}</Tag>;
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="section-title">{title}</p>
      {description && <p className="max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "inline-block size-5 animate-spin rounded-full border-2 border-line border-t-primary",
        className,
      )}
      role="status"
      aria-label="Chargement"
    />
  );
}

export function Rating({ value, count }: { value: number; count?: number }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted">
      <span aria-hidden className="text-warn">
        ★
      </span>
      <span className="font-semibold text-fg">{value.toFixed(1)}</span>
      {count !== undefined && <span>({count})</span>}
    </span>
  );
}

export function Pagination({
  page,
  pageCount,
  basePath,
  searchParams,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  searchParams?: Record<string, string>;
}) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const params = new URLSearchParams({ ...(searchParams ?? {}), page: String(p) });
    return `${basePath}?${params.toString()}`;
  };
  return (
    <nav className="mt-8 flex items-center justify-center gap-2" aria-label="Pagination">
      {page > 1 && (
        <a className="btn-secondary" href={href(page - 1)}>
          ← Précédent
        </a>
      )}
      <span className="px-3 text-sm text-muted">
        Page {page} / {pageCount}
      </span>
      {page < pageCount && (
        <a className="btn-secondary" href={href(page + 1)}>
          Suivant →
        </a>
      )}
    </nav>
  );
}
