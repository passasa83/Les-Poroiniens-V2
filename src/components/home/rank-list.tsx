import Link from "next/link";
import clsx from "clsx";
import { Badge } from "@/components/ui/kit";
import { SERIES_TYPE_LABELS, type Series } from "@/lib/types";

/**
 * « Populaire » (§6.1) : classement 1 à 10.
 * Le comptage par jour n'existe pas en base (les vues sont un cumul), le titre
 * reste donc « Les plus lues » plutôt qu'une promesse non tenable de « lectures
 * du jour ». Le compteur de vues n'apparaît pas ici : il est réservé à la fiche
 * série (§12.3).
 */
export function RankList({
  series,
  adultAllowed = false,
  /** 2 colonnes sur l'accueil, 1 dans la colonne latérale des nouveautés (§6.2). */
  columns = 2,
}: {
  series: Series[];
  adultAllowed?: boolean;
  columns?: 1 | 2;
}) {
  const rows = series
    .filter((s) => adultAllowed || s.classification !== "adult")
    .slice(0, 10);

  if (rows.length === 0) return null;

  return (
    /* `grid-cols-1` = minmax(0, 1fr) : sans contrainte, la piste en auto prend
       la largeur max-content et le classement déborde de sa colonne (§6.2). */
    <ol className={clsx("grid grid-cols-1 gap-2", columns === 2 && "sm:grid-cols-2")}>
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
              decoding="async"
              className="h-16 w-11 shrink-0 rounded-lg bg-surface2 object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-fg group-hover:text-primary">
                {s.titre}
              </p>
              {/* §6.1 « genre » + §6.2 « auteur en gris » : les deux sur une ligne tronquée. */}
              <p className="meta flex items-center gap-1.5">
                <span className="truncate">
                  {s.auteurs[0] ? `${s.auteurs[0]} · ` : ""}
                  {SERIES_TYPE_LABELS[s.type]}
                </span>
                {s.classification === "adult" && <Badge tone="adult">+18</Badge>}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}
