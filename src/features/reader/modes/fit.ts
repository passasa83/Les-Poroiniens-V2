import type { CSSProperties } from "react";
import type { ReaderPrefs } from "../settings/storage";
import { BOUNDS, clamp } from "../types";

/** Rendu commun aux trois modes, dérivé de l'ajustement choisi. */
export type FitLayout = {
  /** Ajustement « hauteur » : une planche tient dans la fenêtre (page / double). */
  fitHeight: boolean;
  /** Ajustement « Originale » : taille native, zone scrollable horizontalement. */
  fitOriginale: boolean;
  /** Zone de lecture (hauteur, centrage, luminosité). */
  zoneStyle: CSSProperties;
  /** Colonne de pages (largeur). */
  contentStyle: CSSProperties;
  imageClass: string;
  /** Ajustement « Personnalisé » : borne de hauteur. */
  imageStyle: CSSProperties | undefined;
};

export function fitLayout(prefs: ReaderPrefs): FitLayout {
  const { fit, mode, width, maxw, maxh, limitW, limitH, stretch, brightness } = prefs;
  const fitHeight = fit === "hauteur" && mode !== "vertical";
  const fitOriginale = fit === "originale";

  const zoneStyle: CSSProperties = {};
  if (fitHeight) zoneStyle.height = "calc(100dvh - 11rem)";
  // Centrage « safe » : passé la largeur des pages, on colle à gauche plutôt
  // que de rogner le début (défilement horizontal conservé).
  if (fitOriginale) zoneStyle.justifyContent = "safe center" as CSSProperties["justifyContent"];
  if (brightness !== 1) zoneStyle.filter = `brightness(${brightness})`;

  let contentStyle: CSSProperties = { width: "100%" };
  if (fit === "originale") contentStyle = { width: "auto", maxWidth: "none" };
  else if (fit === "perso") {
    contentStyle = {
      width: "100%",
      maxWidth: limitW ? `${clamp(maxw, BOUNDS.px.min, BOUNDS.px.max)}px` : undefined,
    };
  } else if (fit === "largeur") {
    contentStyle = { width: `${clamp(width, BOUNDS.width.min, BOUNDS.width.max)}%` };
  }

  const imageStyle =
    fit === "perso" && limitH
      ? { maxHeight: `${clamp(maxh, BOUNDS.px.min, BOUNDS.px.max)}px` }
      : undefined;

  const imageClass = fitHeight
    ? "h-full w-full object-contain select-none bg-surface2"
    : fitOriginale
      ? "max-w-none select-none bg-surface2"
      : stretch && mode !== "vertical"
        ? // « Étirer les petites pages » : la page remplit sa boîte (contenue),
          // bornée par la limite de hauteur si elle est active.
          "h-full w-full object-contain select-none bg-surface2"
        : "w-full select-none bg-surface2";

  return { fitHeight, fitOriginale, zoneStyle, contentStyle, imageClass, imageStyle };
}
