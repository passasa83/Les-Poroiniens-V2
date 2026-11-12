import Link from "next/link";
import { Badge } from "@/components/ui/kit";

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="section-title">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}

/** Carte-raccourci : une rubrique du back-office, cliquable en entier. */
export function QuickAction({
  href,
  label,
  hint,
  value,
  tone = "fg",
}: {
  href: string;
  label: string;
  hint: string;
  value: string | number;
  tone?: "fg" | "warn" | "ok";
}) {
  const color = tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-fg";
  return (
    <Link
      href={href}
      className="card block p-4 transition-colors hover:bg-surface2/70"
      aria-label={`${label} — ${hint}`}
    >
      <span className="block text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className={`mt-1 block text-3xl font-bold tabular-nums ${color}`}>{value}</span>
      <span className="mt-1 block text-xs text-muted">{hint}</span>
    </Link>
  );
}

export function HealthRow({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "adult" | "neutral";
  hint?: string;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
      <span className="text-muted">
        {label}
        {hint && <span className="mt-0.5 block text-xs text-muted/80">{hint}</span>}
      </span>
      <Badge tone={tone}>{value}</Badge>
    </li>
  );
}
