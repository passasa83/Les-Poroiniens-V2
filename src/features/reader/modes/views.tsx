"use client";

import clsx from "clsx";
import type { Unite } from "@/lib/types";
import { Prefetch } from "../images/prefetch";
import { ReaderImage } from "../images/reader-image";
import { isLandscape } from "../state/spreads";
import type { Planche, ReaderPage, ReaderSens } from "../types";
import type { FitLayout } from "./fit";

/** Ce que les trois modes partagent pour afficher une page. */
export type PageProps = {
  pages: ReaderPage[];
  chapterNumero: number;
  unite?: Unite | null;
  layout: FitLayout;
  onFailed: (index: number) => void;
  onReport: (index: number) => void;
};

function Page({
  index,
  eager,
  bounded = true,
  ...props
}: PageProps & { index: number; eager: boolean; bounded?: boolean }) {
  const page = props.pages[index];
  if (!page) return null;
  return (
    <ReaderImage
      key={`${index}:${page.url}`}
      page={page}
      index={index}
      chapterNumero={props.chapterNumero}
      unite={props.unite}
      eager={eager}
      onFailed={props.onFailed}
      onReport={props.onReport}
      imageClass={props.layout.imageClass}
      imageStyle={bounded ? props.layout.imageStyle : undefined}
    />
  );
}

/** Webtoon : toutes les pages en colonne (sans espacement pour le +18). */
export function VerticalStrip({
  page,
  adult,
  ...props
}: PageProps & { page: number; adult: boolean }) {
  return (
    <div className={adult ? "space-y-0" : "space-y-[26px]"} style={props.layout.contentStyle}>
      {props.pages.map((item, index) => (
        <Page
          key={`${index}:${item.url}`}
          {...props}
          index={index}
          eager={index === 0}
          bounded={false}
        />
      ))}
      {/* Deux planches d'avance, en plus du chargement paresseux natif */}
      <Prefetch pages={props.pages} from={page + 3} count={2} />
    </div>
  );
}

/** Page par page, avec transition d'entrée. */
export function SinglePage({ page, ...props }: PageProps & { page: number }) {
  const { fitHeight, contentStyle } = props.layout;
  if (!props.pages[page]) return null;
  return (
    <div
      key={page}
      className={clsx("w-full reader-page-enter", fitHeight && "h-full")}
      style={contentStyle}
    >
      <Page {...props} index={page} eager />
      <Prefetch pages={props.pages} from={page + 1} />
    </div>
  );
}

/**
 * Double page collée : grille de deux moitiés qui se rejoignent au centre
 * (en D → G, la page paire est à gauche). Une page portrait seule occupe une
 * moitié, un placeholder l'autre : la première planche part d'un bord, les
 * suivantes de l'autre (ancien lecteur, `reader.css` .double-mode). Une page
 * paysage est centrée seule.
 */
export function DoublePage({
  spread,
  position,
  sens,
  ...props
}: PageProps & { spread: Planche; position: number; sens: ReaderSens }) {
  const { fitHeight, fitOriginale, contentStyle } = props.layout;
  const solo = spread.length === 1;
  const landscape = solo && isLandscape(props.pages[spread.start]);
  const imageFirst = sens === "rtl" ? position === 0 : position !== 0;
  const left = sens === "rtl" ? spread.start + 1 : spread.start;
  const right = sens === "rtl" ? spread.start : spread.start + 1;

  const half = (index: number, justify: "justify-start" | "justify-end", eager: boolean) => (
    <div
      className={clsx(
        "flex",
        justify,
        fitOriginale ? "flex-none" : solo ? undefined : "w-full",
        fitHeight && "h-full",
      )}
    >
      <Page {...props} index={index} eager={eager} />
    </div>
  );
  const placeholder = (
    <div aria-hidden="true" className={clsx("h-full w-full", fitOriginale && "flex-none")} />
  );

  return (
    <div
      key={spread.start}
      className={clsx(
        "w-full reader-page-enter",
        fitHeight && "h-full",
        landscape ? "flex items-center justify-center" : "grid grid-cols-2 items-start",
      )}
      style={contentStyle}
    >
      {landscape ? (
        <Page {...props} index={spread.start} eager />
      ) : solo ? (
        imageFirst ? (
          <>
            {half(spread.start, "justify-end", true)}
            {placeholder}
          </>
        ) : (
          <>
            {placeholder}
            {half(spread.start, "justify-start", true)}
          </>
        )
      ) : (
        <>
          {half(left, "justify-end", spread.start <= 2)}
          {half(right, "justify-start", spread.start <= 2)}
        </>
      )}
      <Prefetch pages={props.pages} from={spread.start + spread.length} />
    </div>
  );
}
