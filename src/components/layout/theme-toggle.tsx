"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Thème : stocké dans `data-theme` + localStorage. On lit l'état via un
 * store externe (useSyncExternalStore) plutôt que par un setState dans un
 * effet — pas de rendu en cascade, ni d'écart d'hydratation.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getTheme(): string {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerTheme(): string {
  return "dark";
}

function toggleTheme(): void {
  const next = getTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("lp-theme", next);
  } catch {
    /* stockage indisponible */
  }
  for (const listener of listeners) listener();
}

export function SiteThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  return (
    <button type="button" onClick={toggleTheme} className="btn-ghost px-2" aria-label="Changer de thème">
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
