import Link from "next/link";
import clsx from "clsx";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/kit";
import { SERIES_TYPE_LABELS, type SeriesType } from "@/lib/types";

const number = new Intl.NumberFormat("fr-FR");

export type UpdateCardData = {
  slug: string;
  titre: string;
  couverture: string;
  type: SeriesType;
  isAdult: boolean;
  numero: number;
  vues: number;
  /** Chapitre déjà ouvert par le membre connecté (§6.2 : indicateur « lu »). */
  lu: boolean;
};

/**
 * Carte de nouveauté (§6.2) : couverture 2:3, étiquette rouge « 24 h » collée
 * au coin supérieur gauche sur les sorties du jour, titre sur une ligne puis
 * chapitre en gras et vues en gris. Carte entière cliquable → fiche série
 * (décision : un seul comportement de clic, titre compris).
 */
export function UpdateCard({ item, fresh }: { item: UpdateCardData; fresh: boolean }) {
  return (
    <li>
      <Link href={`/serie/${item.slug}`} className="group block focus-visible:outline-none">
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.couverture}
            alt=""
            width={300}
            height={450}
            loading="lazy"
            className="cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
          {fresh && (
            <span className="absolute left-0 top-0 inline-flex items-center gap-1 rounded-tl-lg bg-accent px-2 py-1 text-[11px] font-semibold text-white">
              <Clock className="size-3" aria-hidden />
              24 h
            </span>
          )}
          {item.lu && (
            <span className="badge absolute bottom-1.5 right-1.5 bg-surface/90 text-muted">
              Lu
            </span>
          )}
        </div>
        <p className="mt-2 truncate text-sm font-semibold text-fg group-hover:text-primary">
          {item.titre}
        </p>
        <p className={clsx("meta truncate", item.lu && "opacity-70")}>
          <span className="font-semibold text-fg/85">Ch. {item.numero}</span>
          {" · "}
          {number.format(item.vues)} vues
          {" · "}
          {SERIES_TYPE_LABELS[item.type]}
          {item.isAdult && (
            <>
              {" "}
              <Badge tone="adult">+18</Badge>
            </>
          )}
        </p>
      </Link>
    </li>
  );
}
