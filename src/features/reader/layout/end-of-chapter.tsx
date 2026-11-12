import { ChevronLeft, ChevronRight, Flag } from "lucide-react";
import Link from "next/link";
import {
  libelleUnite,
  libelleUniteSingulier,
  libelleUnitesPluriel,
  libelleVoisin,
} from "@/lib/format";
import type { Unite } from "@/lib/types";
import { ChapterLike } from "./chapter-like";

/** Écran de fin de chapitre : suivant / précédent, liste, commentaires, like, signalement. */
export function EndOfChapter({
  serieSlug,
  serieTitre,
  chapterId,
  chapterNumero,
  unite,
  initialLikes,
  prevHref,
  nextHref,
  onReport,
}: {
  serieSlug: string;
  serieTitre: string;
  chapterId: string;
  chapterNumero: number;
  unite?: Unite | null;
  initialLikes: number;
  prevHref: string | null;
  nextHref: string | null;
  onReport: () => void;
}) {
  const singulier = libelleUniteSingulier(unite);
  return (
    <section
      className="border-t border-line bg-surface px-4 py-6 text-center"
      aria-labelledby="reader-fin-titre"
    >
      <p className="section-title" id="reader-fin-titre">
        {singulier} terminé
      </p>
      <p className="mt-1 text-sm text-muted">
        {serieTitre} — {libelleUnite(chapterNumero, unite).toLowerCase()}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {nextHref ? (
          <Link href={nextHref} className="btn-primary">
            {libelleVoisin("suivant", unite)} <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="btn-primary opacity-50" aria-disabled="true">
            Dernier {singulier.toLowerCase()}
          </span>
        )}
        {prevHref ? (
          <Link href={prevHref} className="btn-secondary">
            <ChevronLeft className="size-4" /> {libelleVoisin("précédent", unite)}
          </Link>
        ) : (
          <span className="btn-secondary opacity-50" aria-disabled="true">
            {libelleVoisin("précédent", unite)}
          </span>
        )}
        <Link href={`/serie/${serieSlug}#chapitres`} className="btn-ghost">
          Tous les {libelleUnitesPluriel(unite).toLowerCase()}
        </Link>
        <a href="#commentaires" className="btn-ghost">
          Commentaires du {singulier.toLowerCase()}
        </a>
        <ChapterLike chapterId={chapterId} initialLikes={initialLikes} unite={unite} />
        <button type="button" className="btn-ghost" onClick={onReport}>
          <Flag className="size-4" /> Signaler un problème
        </button>
      </div>
    </section>
  );
}
