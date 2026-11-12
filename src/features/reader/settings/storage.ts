import {
  BOUNDS,
  FITS,
  MODES,
  SENS,
  THEMES,
  type ReaderFit,
  type ReaderMode,
  type ReaderSens,
  type ReaderTheme,
} from "../types";

/**
 * Préférences du lecteur de scans, rangées sous **une seule clé versionnée**
 * (`lp-reader-settings`). Elles remplacent les 16 clés `lp-reader-*` du
 * premier lecteur, migrées une fois puis supprimées.
 *
 * Portée de chaque réglage (inchangée) :
 * - mode, ajustement, première page seule : par série, avec repli global ;
 * - sens : par série uniquement (sinon préférence du compte) ;
 * - tout le reste : global à l'appareil.
 */

export type ReaderPrefs = {
  mode: ReaderMode;
  sens: ReaderSens;
  fit: ReaderFit;
  /** Ajustement « Largeur » (%). */
  width: number;
  /** Ajustement « Personnalisé » : limites (px), étirement. */
  maxw: number;
  maxh: number;
  stretch: boolean;
  limitW: boolean;
  limitH: boolean;
  /** Sidebar repliée (grand écran). */
  collapsed: boolean;
  theme: ReaderTheme;
  brightness: number;
  /** Double page : première planche seule. */
  firstSolo: boolean;
};

export const DEFAULT_PREFS: ReaderPrefs = {
  mode: "vertical",
  sens: "ltr",
  fit: "auto",
  width: 100,
  maxw: 1200,
  maxh: 1080,
  stretch: false,
  limitW: true,
  limitH: false,
  collapsed: false,
  theme: "site",
  brightness: 1,
  firstSolo: false,
};

const SERIES_FIELDS = ["mode", "sens", "fit", "firstSolo"] as const;
type SeriesField = (typeof SERIES_FIELDS)[number];
type SeriesPrefs = Partial<Pick<ReaderPrefs, SeriesField>>;
type GlobalPrefs = Partial<Omit<ReaderPrefs, "sens">>;

export type StoredReaderSettings = {
  v: 2;
  global: GlobalPrefs;
  series: Record<string, SeriesPrefs>;
};

export const SETTINGS_KEY = "lp-reader-settings";
/** Préfixe des clés du premier lecteur (migration, import des exports v1). */
const LEGACY_PREFIX = "lp-reader-";
/** Garde-fou : nombre de séries mémorisées. */
const MAX_SERIES = 500;

const empty = (): StoredReaderSettings => ({ v: 2, global: {}, series: {} });

/* ── Validation ────────────────────────────────────────────────────────── */

const oneOf = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

const inRange = (value: unknown, min: number, max: number): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
    ? value
    : undefined;

const bool = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

/** Ne garde que les champs valides (toute valeur corrompue est ignorée). */
export function sanitize(data: unknown): Partial<ReaderPrefs> {
  if (!data || typeof data !== "object") return {};
  const d = data as Record<string, unknown>;
  const out: Partial<ReaderPrefs> = {
    mode: oneOf(MODES, d.mode),
    sens: oneOf(SENS, d.sens),
    fit: oneOf(FITS, d.fit),
    width: inRange(d.width, BOUNDS.width.min, BOUNDS.width.max),
    maxw: inRange(d.maxw, BOUNDS.px.min, BOUNDS.px.max),
    maxh: inRange(d.maxh, BOUNDS.px.min, BOUNDS.px.max),
    stretch: bool(d.stretch),
    limitW: bool(d.limitW),
    limitH: bool(d.limitH),
    collapsed: bool(d.collapsed),
    theme: oneOf(THEMES, d.theme),
    brightness: inRange(d.brightness, BOUNDS.brightness.min, BOUNDS.brightness.max),
    firstSolo: bool(d.firstSolo),
  };
  for (const key of Object.keys(out) as Array<keyof ReaderPrefs>) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

function pick<K extends keyof ReaderPrefs>(
  prefs: Partial<ReaderPrefs>,
  keys: readonly K[],
): Partial<Pick<ReaderPrefs, K>> {
  const out: Partial<Pick<ReaderPrefs, K>> = {};
  for (const key of keys) if (prefs[key] !== undefined) out[key] = prefs[key];
  return out;
}

function withoutSens(prefs: Partial<ReaderPrefs>): GlobalPrefs {
  const { sens: _sens, ...rest } = prefs;
  return rest;
}

function normalize(data: unknown): StoredReaderSettings {
  if (!data || typeof data !== "object" || (data as { v?: unknown }).v !== 2) return empty();
  const d = data as { global?: unknown; series?: unknown };
  const series: Record<string, SeriesPrefs> = {};
  if (d.series && typeof d.series === "object") {
    for (const [id, value] of Object.entries(d.series).slice(-MAX_SERIES)) {
      const prefs = pick(sanitize(value), SERIES_FIELDS);
      if (Object.keys(prefs).length > 0) series[id] = prefs;
    }
  }
  return { v: 2, global: withoutSens(sanitize(d.global)), series };
}

/* ── Migration des clés du premier lecteur ─────────────────────────────── */

/**
 * Convertit un ensemble de clés `lp-reader-*` (stockage local ou fichier
 * d'export v1) au format v2.
 */
export function fromLegacy(entries: Record<string, string>): StoredReaderSettings {
  const num = (key: string) => (key in entries ? Number(entries[key]) : undefined);
  const flag = (key: string, on: string) => (key in entries ? entries[key] === on : undefined);

  let maxw = num("lp-reader-maxw");
  // Ancienne plage (320-400 px) ramenée au minimum actuel.
  if (maxw !== undefined && maxw >= 320 && maxw < BOUNDS.px.min) maxw = BOUNDS.px.min;
  const solo = entries["lp-reader-first-solo"];

  const global = withoutSens(
    sanitize({
      mode: entries["lp-reader-mode"],
      fit: entries["lp-reader-fit"],
      width: num("lp-reader-width"),
      maxw,
      maxh: num("lp-reader-maxh"),
      stretch: flag("lp-reader-stretch", "1"),
      limitW: flag("lp-reader-limit-w", "1"),
      limitH: flag("lp-reader-limit-h", "1"),
      collapsed: flag("lp-reader-sidebar", "1"),
      theme: entries["lp-reader-theme"],
      brightness: num("lp-reader-brightness"),
      firstSolo: solo === "1" || solo === "0" ? solo === "1" : undefined,
    }),
  );

  const series: Record<string, SeriesPrefs> = {};
  const perSeries: Array<[prefix: string, field: SeriesField]> = [
    ["lp-reader-mode:", "mode"],
    ["lp-reader-sens:", "sens"],
    ["lp-reader-fit:", "fit"],
    ["lp-reader-solo:", "firstSolo"],
  ];
  for (const [key, raw] of Object.entries(entries)) {
    for (const [prefix, field] of perSeries) {
      if (!key.startsWith(prefix)) continue;
      const id = key.slice(prefix.length);
      if (!id) continue;
      const value = field === "firstSolo" ? (raw === "1" || raw === "0" ? raw === "1" : null) : raw;
      const valid = pick(sanitize({ [field]: value }), SERIES_FIELDS);
      if (Object.keys(valid).length > 0) series[id] = { ...series[id], ...valid };
    }
  }
  return { v: 2, global, series };
}

/* ── Accès au stockage ─────────────────────────────────────────────────── */

function write(settings: StoredReaderSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* stockage indisponible ou plein : réglages non mémorisés */
  }
}

function legacyEntries(): Record<string, string> {
  const entries: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(LEGACY_PREFIX) || key === SETTINGS_KEY) continue;
    const value = localStorage.getItem(key);
    if (value !== null) entries[key] = value;
  }
  return entries;
}

/** Lit les réglages ; migre (une fois) les anciennes clés s'il en reste. */
export function loadSettings(): StoredReaderSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return normalize(JSON.parse(raw));
    const legacy = legacyEntries();
    const keys = Object.keys(legacy);
    if (keys.length === 0) return empty();
    const migrated = fromLegacy(legacy);
    write(migrated);
    for (const key of keys) localStorage.removeItem(key);
    return migrated;
  } catch {
    return empty();
  }
}

/** Réglages effectifs pour une série (série > global > compte > défaut). */
export function resolvePrefs(
  stored: StoredReaderSettings,
  serieId: string,
  base: ReaderPrefs,
): ReaderPrefs {
  return { ...base, ...stored.global, ...stored.series[serieId] };
}

/** Enregistre une modification, chaque champ à sa portée. */
export function savePrefs(serieId: string, patch: Partial<ReaderPrefs>): void {
  const stored = loadSettings();
  const valid = sanitize(patch);
  const global = withoutSens(valid);
  const series = pick(valid, SERIES_FIELDS);
  stored.global = { ...stored.global, ...global };
  if (Object.keys(series).length > 0) {
    // Réinsertion en fin : les séries les plus anciennes sortent en premier.
    const current = stored.series[serieId];
    delete stored.series[serieId];
    stored.series[serieId] = { ...current, ...series };
    const ids = Object.keys(stored.series);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SERIES))) delete stored.series[id];
  }
  write(stored);
}

/* ── Export / import (fichier JSON) ────────────────────────────────────── */

export const EXPORT_FILENAME = "poroiniens-reglages-lecteur.json";

export function exportSettings(): string {
  return JSON.stringify({ version: 2, settings: loadSettings() }, null, 2);
}

/**
 * Restaure un export (v2, ou v1 du premier lecteur : clés `lp-reader-*`).
 * Fusionne avec les réglages présents. Renvoie `false` si le fichier est
 * invalide ou vide.
 */
export function importSettings(text: string): boolean {
  const data = JSON.parse(text) as { version?: unknown; settings?: unknown };
  if (!data || typeof data.settings !== "object" || data.settings === null) return false;

  let incoming: StoredReaderSettings;
  if (data.version === 2) {
    incoming = normalize(data.settings);
  } else if (data.version === 1) {
    const entries: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.settings).slice(0, 2000)) {
      if (key.startsWith(LEGACY_PREFIX) && typeof value === "string") entries[key] = value;
    }
    incoming = fromLegacy(entries);
  } else {
    return false;
  }
  if (Object.keys(incoming.global).length === 0 && Object.keys(incoming.series).length === 0) {
    return false;
  }
  const current = loadSettings();
  write(
    normalize({
      v: 2,
      global: { ...current.global, ...incoming.global },
      series: { ...current.series, ...incoming.series },
    }),
  );
  return true;
}
