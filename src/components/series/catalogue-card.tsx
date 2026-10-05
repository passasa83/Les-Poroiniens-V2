import clsx from "clsx";
import Link from "next/link";
import { Badge } from "@/components/ui/kit";
import { coverBlurUrl } from "@/lib/media";
import { SERIES_TYPE_LABELS, type Series } from "@/lib/types";

/**
 * Carte du catalogue (§6.3) : couverture 2:3, titre tronqué sur une ligne,
 * auteur en gris et pastilles (type, « +18 » le cas échéant). Le statut est
 * porté par les onglets de la page, il n'est donc pas répété sur la carte.
 */
export function CatalogueCard({
  series,
  adultAllowed = false,
}: {
  series: Series;
  adultAllowed?: boolean;
}) {
  const isAdult = series.classification === "adult";
  const hidden = isAdult && !adultAllowed;
  const cover = series.couverture || `/api/img/cover/${series.slug}`;
  const src = hidden ? (coverBlurUrl(cover) ?? cover) : cover;
  const auteurs = series.auteurs.filter(Boolean).join(", ");

  return (
    <Link
      href={`/serie/${series.slug}`}
      className="group block"
    >
      <div className="relative overflow-hidden rounded-xl border border-line bg-surface2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={600}
          height={900}
          loading="lazy"
          decoding="async"
          className={clsx(
            "aspect-[2/3] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]",
            hidden && "adult-blur",
          )}
        />
      </div>
      <div className="mt-2 space-y-1.5">
        <p
          className="truncate text-sm font-semibold leading-tight text-fg group-hover:text-primary"
          title={series.titre}
        >
          {series.titre}
        </p>
        <p className="truncate text-xs text-muted" title={auteurs}>
          {auteurs || "Auteur inconnu"}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">{SERIES_TYPE_LABELS[series.type]}</Badge>
          {isAdult && <Badge tone="adult">+18</Badge>}
        </div>
      </div>
    </Link>
  );
}

/** Grille du catalogue : 2 colonnes sur mobile, 8 sur grand écran (§6.3). */
export function CatalogueGrid({
  series,
  adultAllowed = false,
}: {
  series: Series[];
  adultAllowed?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
      {series.map((s) => (
        <CatalogueCard key={s.id} series={s} adultAllowed={adultAllowed} />
      ))}
    </div>
  );
}
