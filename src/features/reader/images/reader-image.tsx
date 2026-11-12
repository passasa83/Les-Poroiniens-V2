"use client";

import { Flag, ImageOff } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { libelleUnite } from "@/lib/format";
import type { Unite } from "@/lib/types";
import type { ReaderPage } from "../types";

const MAX_RETRIES = 2;

/**
 * Page de scan avec reprise : 2 nouvelles tentatives avec délai
 * croissant, puis une page de remplacement avec bouton « Signaler un
 * problème ». Dimensions toujours transmises au DOM : aucune surprise de
 * mise en page (CLS < 0,05).
 *
 * L'état est réinitialisé par le `key` du parent quand l'URL change.
 */
export function ReaderImage({
  page,
  index,
  chapterNumero,
  unite,
  eager,
  onFailed,
  onReport,
  imageClass = "w-full select-none",
  imageStyle,
}: {
  page: ReaderPage;
  index: number;
  chapterNumero: number;
  /** Organisation de la série (texte alternatif : « du tome 3 »). */
  unite?: Unite | null;
  eager: boolean;
  onFailed: (index: number) => void;
  onReport: (index: number) => void;
  imageClass?: string;
  /** Ajustement « Personnalisé » : borne de hauteur (ancien lecteur). */
  imageStyle?: CSSProperties;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const retriesRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const src =
    attempt === 0 ? page.url : `${page.url}${page.url.includes("?") ? "&" : "?"}retry=${attempt}`;
  const alt = `Page ${index + 1} du ${libelleUnite(chapterNumero, unite).toLowerCase()}`;

  function onError() {
    if (failed || timerRef.current) return;
    if (retriesRef.current < MAX_RETRIES) {
      const delay = 400 * 2 ** retriesRef.current;
      retriesRef.current += 1;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setAttempt((current) => current + 1);
      }, delay);
      return;
    }
    setFailed(true);
    onFailed(index);
  }

  if (failed) {
    return (
      <div
        id={`reader-page-${index}`}
        style={
          page.largeur && page.hauteur
            ? { aspectRatio: `${page.largeur} / ${page.hauteur}` }
            : { minHeight: "50vh" }
        }
        className="relative z-30 flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface2 p-6 text-center"
      >
        <ImageOff className="size-6 text-muted" />
        <p className="text-sm font-semibold text-fg">Page {index + 1} indisponible</p>
        <p className="max-w-xs text-xs text-muted">
          Le fichier n&apos;a pas pu être chargé malgré les reprises automatiques.
        </p>
        <button type="button" className="btn-secondary text-sm" onClick={() => onReport(index)}>
          <Flag className="size-4" /> Signaler un problème
        </button>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      id={`reader-page-${index}`}
      src={src}
      alt={alt}
      width={page.largeur}
      height={page.hauteur}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      decoding={eager ? undefined : "async"}
      onError={onError}
      className={imageClass}
      style={imageStyle}
      draggable={false}
    />
  );
}
