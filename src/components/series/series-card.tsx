import Link from "next/link";
import clsx from "clsx";
import { Badge, Rating } from "@/components/ui/kit";
import { coverBlurUrl } from "@/lib/media";
import { SERIES_STATUT_LABELS, type Series } from "@/lib/types";

export function SeriesCard({
  series,
  adultAllowed = false,
  showStatus = true,
}: {
  series: Series;
  adultAllowed?: boolean;
  showStatus?: boolean;
}) {
  const isAdult = series.classification === "adult";
  const hidden = isAdult && !adultAllowed;
  const cover = series.couverture || `/api/img/cover/${series.slug}`;
  // Variante floue servie par le CDN quand la transformation est activée (§7.3) ;
  // sinon le flou reste appliqué en CSS sur la vignette verrouillée.
  const src = hidden ? coverBlurUrl(cover) ?? cover : cover;

  return (
    <Link
      href={`/serie/${series.slug}`}
      className="group block focus-visible:outline-none"
      aria-label={series.titre}
    >
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Couverture de ${series.titre}`}
          width={600}
          height={900}
          loading="lazy"
          className={clsx(
            "aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]",
            hidden && "adult-blur",
          )}
        />
        {isAdult && (
          <span className="absolute left-2 top-2">
            <Badge tone="adult">+18</Badge>
          </span>
        )}
        {showStatus && series.statut !== "en_cours" && (
          <span className="absolute right-2 top-2">
            <Badge tone={series.statut === "termine" ? "ok" : "neutral"}>
              {SERIES_STATUT_LABELS[series.statut]}
            </Badge>
          </span>
        )}
      </div>
      <div className="mt-2 space-y-1">
        <p className="line-clamp-2 text-sm font-semibold leading-tight text-fg group-hover:text-primary">
          {series.titre}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Rating value={series.noteMoy} count={series.nbVotes} />
          <span className="text-xs text-muted">{series.annee ?? "—"}</span>
        </div>
      </div>
    </Link>
  );
}

export function SeriesGrid({
  series,
  adultAllowed = false,
  className,
}: {
  series: Series[];
  adultAllowed?: boolean;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6",
        className,
      )}
    >
      {series.map((s) => (
        <SeriesCard key={s.id} series={s} adultAllowed={adultAllowed} />
      ))}
    </div>
  );
}
