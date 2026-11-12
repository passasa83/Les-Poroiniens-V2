"use client";

import { useMemo, useState } from "react";
import { getJson, normalizeNas, type NasItem } from "./types";

/** Dossier parent (`/a/b` → `/a`, `/a` → `/`). */
export function parentPath(path: string): string {
  const clean = path.replace(/\/+$/, "");
  const cut = clean.lastIndexOf("/");
  return cut <= 0 ? "/" : clean.slice(0, cut);
}

/** Chemin d'un enfant du dossier courant. */
export function childPath(path: string, name: string): string {
  return `${path.replace(/\/+$/, "")}/${name.replace(/^\/+/, "")}`;
}

/**
 * Navigation dans l'arborescence du NAS : chemin saisi, contenu listé, fil
 * d'Ariane. `onNavigate` est appelé à chaque déplacement (l'onglet y oublie
 * le dossier retenu et son aperçu).
 */
export function useNasBrowser(onNavigate?: () => void) {
  const [path, setPath] = useState("/");
  const [items, setItems] = useState<NasItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function list(target: string) {
    setBusy(true);
    setError(null);
    onNavigate?.();
    try {
      const { res, data } = await getJson<{ entries?: unknown }>(
        `/api/owner/nas/list?path=${encodeURIComponent(target)}`,
      );
      if (!res.ok) {
        setError(data?.error ?? "Listing impossible.");
        setItems([]);
        return;
      }
      setItems(normalizeNas(data?.entries));
    } catch {
      setError("Erreur réseau : réessayez.");
    } finally {
      setBusy(false);
    }
  }

  /** Déplacement : fil d'Ariane, montée, descente ou chemin saisi. */
  function goTo(target: string) {
    const clean = target || "/";
    setPath(clean);
    void list(clean);
  }

  /** Segments du fil d'Ariane, depuis la racine jusqu'au dossier courant. */
  const crumbs = useMemo(() => {
    const out: Array<{ label: string; path: string }> = [{ label: "Racine", path: "/" }];
    let acc = "";
    for (const part of path.split("/").filter(Boolean)) {
      acc += `/${part}`;
      out.push({ label: part, path: acc });
    }
    return out;
  }, [path]);

  return { path, setPath, items, busy, error, setError, goTo, crumbs };
}
