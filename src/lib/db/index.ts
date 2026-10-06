import "server-only";
import { AppwriteDriver } from "./appwrite";
import { DemoDriver } from "./demo";
import type { DbDriver } from "./driver";

export { TABLES } from "./driver";
export { rowId, ROW_ID_MAX } from "./ids";
export type { DbDriver, Filter, ListQuery, ListResult } from "./driver";

/** Appwrite est actif uniquement si une clé API est renseignée. */
export function appwriteEnabled(): boolean {
  return Boolean(process.env.APPWRITE_API_KEY);
}

let driver: DbDriver | null = null;

/**
 * Bascule automatique : Appwrite si configuré, jeu de démonstration sinon.
 * Le driver est mis en cache par process (le client Appwrite est un singleton).
 */
export function getDb(): DbDriver {
  if (!driver) {
    driver = appwriteEnabled() ? new AppwriteDriver() : new DemoDriver();
  }
  return driver;
}

/** Nom du mode courant, affiché dans la barre d'outils de dev. */
export function dataMode(): "appwrite" | "demo" {
  return appwriteEnabled() ? "appwrite" : "demo";
}

/**
 * Cache mémoire court pour les lectures du catalogue (listes, stats).
 * Sur Vercel, chaque instance a son propre cache : rester court et volontaire.
 */
const cache = new Map<string, { expires: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await fn();
  cache.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

export function invalidate(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
