import Link from "next/link";
import { Clock, Eye } from "lucide-react";
import { Badge } from "@/components/ui/kit";

const number = new Intl.NumberFormat("fr-FR");

export type UpdateHeroData = {
  slug: string;
  titre: string;
  auteur: string;
  /** Visuel paysage : bannière de la série si elle existe, sinon la couverture recadrée. */
  visuel: string;
  label: string;
  numero: number;
  vues: number;
  isAdult: boolean;
  /** Sortie dans les dernières 24 h : l'étiquette peut annoncer « Dernières 24 h ». */
  fresh: boolean;
};

/**
 * Carte héros « Nouveautés » (§6.2) : coins très arrondis, contour fin,
 * panneau --surface à gauche (étiquette, titre, auteur, chapitre, vues) et
 * visuel paysage à droite, fondu vers le panneau.
 */
export function UpdateHeroCard({ hero }: { hero: UpdateHeroData }) {
  return (
    <Link
      href={`/serie/${hero.slug}`}
      className="group grid overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-2"
    >
      <div className="flex flex-col justify-between gap-4 p-5">
        <div className="space-y-2.5">
          <span
            className={
              hero.fresh
                ? "badge w-fit bg-accent text-white"
                : "badge w-fit border border-line bg-surface2 text-muted"
            }
            title={hero.fresh ? "Sorti dans les dernières 24 heures" : "Sélection du Gérant"}
          >
            <Clock className="size-3" aria-hidden />
            {hero.label}
          </span>
          <h2 className="text-xl font-bold leading-tight text-fg group-hover:text-primary sm:text-2xl">
            {hero.titre}
            {hero.isAdult && (
              <>
                {" "}
                <Badge tone="adult">+18</Badge>
              </>
            )}
          </h2>
          {hero.auteur && <p className="meta">{hero.auteur}</p>}
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-semibold text-fg">Ch. {hero.numero}</span>
          <span className="meta inline-flex items-center gap-1 tabular-nums">
            <Eye className="size-3.5" aria-hidden />
            {number.format(hero.vues)} vues
          </span>
        </p>
      </div>
      <div className="relative min-h-36 overflow-hidden sm:min-h-48">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero.visuel}
          alt=""
          width={1600}
          height={900}
          loading="eager"
          fetchPriority="high"
          decoding="sync"
          className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-300 group-hover:scale-[1.03]"
        />
        <div
          aria-hidden
          className="absolute inset-0 hidden bg-gradient-to-r from-surface via-surface/30 to-transparent sm:block sm:via-surface/10"
        />
      </div>
    </Link>
  );
}
