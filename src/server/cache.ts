import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { appwriteEnabled } from "@/server/db";
import { isTransientNetworkError } from "@/server/db/transport";

/**
 * Cache de lecture à deux niveaux.
 *
 * 1. **Mémoire de l'instance** : réponse immédiate pendant `ttlMs`, et
 *    « dernière valeur connue » resservie quand Appwrite (joignable via VPN)
 *    ne répond plus.
 * 2. **Data Cache de Next** (`unstable_cache`) : partagé entre les instances
 *    sur Vercel et conservé d'un démarrage à l'autre. Une instance froide lit
 *    ce cache au lieu de refaire l'aller-retour Appwrite (~1,3 s).
 *
 * Les clés sont hiérarchiques (`series:popular:10:0`) : chaque préfixe terminé
 * par `:` devient un tag, si bien que `invalidate("series:")` vide toutes les
 * clés de la famille, partout. Le mode démonstration (base en mémoire, perdue
 * au redémarrage) n'utilise que le niveau 1.
 *
 * Les valeurs mises en cache doivent être sérialisables en JSON.
 */

/**
 * État partagé par tout le processus : pages et routes API peuvent être
 * chargées dans des bundles distincts (modules dupliqués), et une écriture
 * faite par une route doit invalider ce que lit une page.
 */
type CacheState = {
  memory: Map<string, { expires: number; value: unknown }>;
  /** Une seule alerte par clé pendant une panne : pas de journal noyé. */
  staleWarned: Set<string>;
  bypassUntil: Map<string, number>;
};
const state = ((globalThis as { __lpCache?: CacheState }).__lpCache ??= {
  memory: new Map(),
  staleWarned: new Set(),
  bypassUntil: new Map(),
});
const { memory, staleWarned } = state;

/** Limite de Next pour un tag. */
const TAG_MAX = 256;

/** `a:b:c` → `a:`, `a:b:`, `a:b:c:`. */
function tagsOf(key: string): string[] {
  const tags: string[] = [];
  for (let i = 0; i < key.length; i++) {
    if (key[i] === ":") tags.push(key.slice(0, i + 1));
  }
  tags.push(`${key}:`);
  return tags.filter((tag) => tag.length <= TAG_MAX);
}

function tagOf(prefix: string): string {
  return prefix.endsWith(":") ? prefix : `${prefix}:`;
}

/** Hors requête (proxy, scripts), le Data Cache n'existe pas. */
function missingCacheContext(err: unknown): boolean {
  return err instanceof Error && err.message.includes("incrementalCache missing");
}

/**
 * Familles invalidées sans pouvoir toucher le cache partagé (invalidation
 * pendant un rendu) : cette instance les relit en direct jusqu'à expiration
 * des copies partagées, pour voir immédiatement sa propre écriture.
 */
const { bypassUntil } = state;
/** Plus long TTL utilisé avec `cached()`. */
const BYPASS_MS = 5 * 60_000;

function bypassed(key: string): boolean {
  if (bypassUntil.size === 0) return false;
  const now = Date.now();
  return tagsOf(key).some((tag) => (bypassUntil.get(tag) ?? 0) > now);
}

async function shared<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  if (!appwriteEnabled() || bypassed(key)) return fn();
  try {
    return await unstable_cache(fn, ["lp", key], {
      revalidate: Math.max(1, Math.round(ttlMs / 1000)),
      tags: tagsOf(key),
    })();
  } catch (err) {
    if (missingCacheContext(err)) return fn();
    throw err;
  }
}

/**
 * Lecture mise en cache. L'erreur ne remonte que si aucune valeur n'a jamais
 * été obtenue pour cette clé sur l'instance ; sinon, en cas de panne réseau,
 * la valeur périmée est resservie et retentée à l'appel suivant.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  try {
    const value = await shared(key, ttlMs, fn);
    memory.set(key, { expires: Date.now() + ttlMs, value });
    staleWarned.delete(key);
    return value;
  } catch (err) {
    if (hit && isTransientNetworkError(err)) {
      if (!staleWarned.has(key)) {
        const age = new Date(hit.expires - ttlMs).toLocaleTimeString("fr-FR");
        console.warn(`[cache] « ${key} » : backend injoignable, valeur de ${age} resservie.`);
        staleWarned.add(key);
      }
      return hit.value as T;
    }
    throw err;
  }
}

/**
 * Invalide toutes les clés commençant par `prefix`, sur cette instance et dans
 * le cache partagé. Les autres instances gardent au plus `ttlMs` leur copie
 * mémoire (comme avant).
 */
export function invalidate(prefix: string): void {
  for (const key of memory.keys()) {
    if (key.startsWith(prefix)) memory.delete(key);
  }
  if (!appwriteEnabled()) return;
  const tag = tagOf(prefix);
  try {
    // Effet immédiat : l'écriture qui invalide attend sa propre donnée.
    revalidateTag(tag, { expire: 0 });
  } catch (err) {
    unstable_rethrow(err);
    // Pendant un rendu (publication à la demande), `revalidateTag` est
    // interdit : les copies partagées expireront seules (TTL) ; d'ici là,
    // cette instance les contourne.
    if (bypassUntil.size > 200) bypassUntil.clear();
    bypassUntil.set(tag, Date.now() + BYPASS_MS);
  }
}
