/** Famille de polices du lecteur texte (valeurs stables, stockées telles quelles). */
export type LnFont = "sans" | "serif" | "mono";
export type LnAlign = "justify" | "left" | "center" | "right";

export interface LnSettings {
  font: LnFont;
  /** Taille du texte en em (bornes calculées selon l'appareil au montage). */
  size: number;
  /** Interligne (line-height). */
  leading: number;
  /** Lettrage en pixels. */
  tracking: number;
  align: LnAlign;
}

/** Bornes mobile / bureau (le lecteur s'adapte à la largeur de l'écran). */
export const LN_BOUNDS = {
  size: { min: 0.9, max: 2, step: 0.05 },
  leading: { min: 1.4, max: 2.5, step: 0.1 },
  tracking: { min: 0, max: 8, step: 1 },
} as const;

export const LN_DEFAULTS: LnSettings = {
  font: "sans",
  size: 1.05,
  leading: 1.8,
  tracking: 0,
  align: "justify",
};

/** Piles de polices — mêmes choix que l'ancien lecteur (`LNReader/settings.js`). */
export const LN_FONT_STACKS: Record<LnFont, string> = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

export const LN_SETTINGS_KEY = "lp-ln-settings";
/** Ancienne clé du site v1 : lue une fois pour migrer les réglages connus. */
const LEGACY_KEY = "les_poroiniens_ln_settings_v1";

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/** Arrondi propre des pas (0.05 em / 0.1 d'interligne sans biais de flottants). */
export function lnSnap(kind: "size" | "leading" | "tracking", value: number): number {
  const { min, max, step } = LN_BOUNDS[kind];
  const snapped = Math.round((value - min) / step) * step + min;
  return clamp(Number(snapped.toFixed(2)), min, max);
}

/**
 * Lecture des réglages mémorisés : clé V2 d'abord, sinon migration silencieuse
 * de la clé de l'ancien site (police en pile CSS → famille, px → em).
 */
export function loadLnSettings(): LnSettings | null {
  try {
    const brut = localStorage.getItem(LN_SETTINGS_KEY);
    if (brut) {
      const data = JSON.parse(brut) as Partial<LnSettings>;
      return normalizeLnSettings(data);
    }
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const data = JSON.parse(legacy) as Record<string, unknown>;
      const fontStack = String(data.fontFamily ?? "");
      const font: LnFont = /mono/i.test(fontStack)
        ? "mono"
        : /georgia|times/i.test(fontStack)
          ? "serif"
          : "sans";
      const sizeRaw = Number(data.fontSize);
      const migrated = normalizeLnSettings({
        font,
        // Ancien stockage parfois en px : la valeur em reste < 4.
        size: sizeRaw > 4 ? sizeRaw / 16 : sizeRaw,
        leading: Number(data.leading),
        tracking: Number(data.tracking),
        align: data.align as LnAlign | undefined,
      });
      localStorage.setItem(LN_SETTINGS_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    /* stockage indisponible : réglages par défaut */
  }
  return null;
}

export function saveLnSettings(settings: LnSettings): void {
  try {
    localStorage.setItem(LN_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* stockage indisponible : réglages non mémorisés */
  }
}

/** Normalisation défensive : toute valeur hors bornes retombe sur le défaut. */
export function normalizeLnSettings(data: Partial<LnSettings>): LnSettings {
  const fonts: LnFont[] = ["sans", "serif", "mono"];
  const aligns: LnAlign[] = ["justify", "left", "center", "right"];
  const size = Number(data.size);
  const leading = Number(data.leading);
  const tracking = Number(data.tracking);
  return {
    font: fonts.includes(data.font as LnFont) ? (data.font as LnFont) : LN_DEFAULTS.font,
    size: Number.isFinite(size) ? lnSnap("size", size) : LN_DEFAULTS.size,
    leading: Number.isFinite(leading) ? lnSnap("leading", leading) : LN_DEFAULTS.leading,
    tracking: Number.isFinite(tracking) ? lnSnap("tracking", tracking) : LN_DEFAULTS.tracking,
    align: aligns.includes(data.align as LnAlign) ? (data.align as LnAlign) : LN_DEFAULTS.align,
  };
}
