"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FITS, MODES, THEMES, type ReaderMode, type ReaderSens } from "../types";
import { DEFAULT_PREFS, loadSettings, resolvePrefs, savePrefs, type ReaderPrefs } from "./storage";

/**
 * État des réglages du lecteur : une seule source de vérité, lue par la
 * sidebar, le tiroir, les modes et les raccourcis (plus de props en cascade).
 */
export type ReaderSettingsApi = {
  prefs: ReaderPrefs;
  /** Applique et mémorise une modification (portée par champ, cf. storage). */
  update: (patch: Partial<ReaderPrefs>) => void;
  cycleMode: () => void;
  cycleFit: () => void;
  cycleTheme: () => void;
  /** Lit les réglages mémorisés (à appeler une fois, après hydration). */
  hydrate: () => void;
};

const SYNC_DELAY = 800;

/**
 * Préférences du lecteur. Le rendu serveur utilise celles du compte ; les
 * réglages de l'appareil sont appliqués après hydration (`hydrate`).
 */
export function useReaderSettingsState({
  serieId,
  initialMode,
  initialSens,
  canSync,
}: {
  serieId: string;
  initialMode?: ReaderMode;
  initialSens?: ReaderSens;
  /** Envoi du mode et du sens au compte (fire-and-forget, débouncé). */
  canSync: boolean;
}): ReaderSettingsApi {
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => ({
    ...DEFAULT_PREFS,
    mode: initialMode ?? DEFAULT_PREFS.mode,
    sens: initialSens ?? DEFAULT_PREFS.sens,
  }));
  /** Valeur courante, y compris entre deux rendus (clics rapprochés). */
  const prefsRef = useRef(prefs);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    },
    [],
  );

  const hydrate = useCallback(() => {
    const next = resolvePrefs(loadSettings(), serieId, prefsRef.current);
    prefsRef.current = next;
    setPrefs(next);
  }, [serieId]);

  const syncAccount = useCallback(() => {
    if (!canSync) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      void fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode_lecture: prefsRef.current.mode,
          sens_lecture: prefsRef.current.sens,
        }),
        keepalive: true,
      }).catch(() => undefined);
    }, SYNC_DELAY);
  }, [canSync]);

  const update = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      const next = { ...prefsRef.current, ...patch };
      prefsRef.current = next;
      setPrefs(next);
      savePrefs(serieId, patch);
      if ("mode" in patch || "sens" in patch) syncAccount();
    },
    [serieId, syncAccount],
  );

  const cycle = useCallback(
    <K extends "mode" | "fit" | "theme">(key: K, list: readonly ReaderPrefs[K][]) => {
      const index = list.indexOf(prefsRef.current[key]);
      update({ [key]: list[(index + 1) % list.length] } as Partial<ReaderPrefs>);
    },
    [update],
  );
  const cycleMode = useCallback(() => cycle("mode", MODES), [cycle]);
  const cycleFit = useCallback(() => cycle("fit", FITS), [cycle]);
  const cycleTheme = useCallback(() => cycle("theme", THEMES), [cycle]);

  return useMemo(
    () => ({ prefs, update, cycleMode, cycleFit, cycleTheme, hydrate }),
    [prefs, update, cycleMode, cycleFit, cycleTheme, hydrate],
  );
}

const ReaderSettingsContext = createContext<ReaderSettingsApi | null>(null);

export const ReaderSettingsProvider = ReaderSettingsContext.Provider;

export function useReaderSettings(): ReaderSettingsApi {
  const api = useContext(ReaderSettingsContext);
  if (!api) throw new Error("useReaderSettings hors de <ReaderSettingsProvider>");
  return api;
}
