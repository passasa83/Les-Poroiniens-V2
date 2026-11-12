import Link from "next/link";
import type { Series } from "@/lib/types";

/** Genres préférés et série la plus lue. */
export function Gouts({
  genres,
  seriePreferee,
}: {
  genres: Array<[string, number]>;
  seriePreferee: Series | null;
}) {
  const maxGenre = genres[0]?.[1] ?? 1;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-4 p-6">
        <h2 className="section-title">Genres préférés</h2>
        {genres.length === 0 ? (
          <p className="text-sm text-muted">
            Ajoutez des séries à votre bibliothèque pour faire apparaître vos genres favoris.
          </p>
        ) : (
          <ul className="space-y-3">
            {genres.map(([genre, total]) => (
              <li key={genre}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-fg">{genre}</span>
                  <span className="text-xs text-muted">{total}</span>
                </div>
                <div
                  className="mt-1 h-2 overflow-hidden rounded-full bg-surface2"
                  role="progressbar"
                  aria-label={`Séries du genre ${genre}`}
                  aria-valuemin={0}
                  aria-valuemax={maxGenre}
                  aria-valuenow={total}
                >
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.round((total / maxGenre) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4 p-6">
        <h2 className="section-title">Série la plus lue</h2>
        {seriePreferee ? (
          <Link
            href={`/serie/${seriePreferee.slug}`}
            className="flex items-center gap-4 hover:text-primary"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={seriePreferee.couverture}
              alt={`Couverture de ${seriePreferee.titre}`}
              width={64}
              height={96}
              loading="lazy"
              decoding="async"
              className="h-24 w-16 rounded-lg object-cover"
            />
            <span className="min-w-0">
              <span className="block truncate font-semibold text-fg">{seriePreferee.titre}</span>
              <span className="block text-xs text-muted">
                {seriePreferee.genres.slice(0, 3).join(", ") || "sans genre"}
              </span>
            </span>
          </Link>
        ) : (
          <p className="text-sm text-muted">Aucune donnée pour le moment.</p>
        )}
      </section>
    </div>
  );
}
