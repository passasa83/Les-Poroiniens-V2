import Link from "next/link";
import clsx from "clsx";
import { Badge } from "@/components/ui/kit";
import { SERIES_TYPE_LABELS, type Series } from "@/lib/types";

const number = new Intl.NumberFormat("fr-FR");

/**
 * « Populaire » (§6.1) : classement 1 à 10.
 * Le comptage par jour n'existe pas en base (les vues sont un cumul), le titre
 * reste donc « Les plus lues » plutôt qu'une promesse non tenable de « lectures
 * du jour ».
 */
export function RankList({
  series,
  adultAllowed = false,
}: {
  series: Series[];
  adultAllowed?: boolean;
}) {
  const rows = series
    .filter((s) => adultAllowed || s.classification !== "adult")
    .slice(0, 10);

  if (rows.length === 0) return null;

  return (
    <ol className="grid gap-2 sm:grid-cols-2">
      {rows.map((s, i) => (
        <li key={s.id}>
          <Link
            href={`/serie/${s.slug}`}
            className="card group flex items-center gap-3 p-2.5 transition-colors hover:border-accent"
          >
            <span
              className={clsx(
                "w-5 shrink-0 text-center text-sm font-bold tabular-nums",
                i < 3 ? "text-primary" : "text-muted",
              )}
            >
              {i + 1}
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.couverture || `/api/img/cover/${s.slug}`}
              alt=""
              width={48}
              height={72}
              loading="lazy"
              className="h-16 w-11 shrink-0 rounded-lg bg-surface2 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg group-hover:text-primary">
                {s.titre}
              </p>
              <p className="meta flex items-center gap-1.5">
                {SERIES_TYPE_LABELS[s.type]}
                {s.classification === "adult" && <Badge tone="adult">+18</Badge>}
              </p>
            </div>
            <span className="meta shrink-0 tabular-nums">{number.format(s.vues)} vues</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
