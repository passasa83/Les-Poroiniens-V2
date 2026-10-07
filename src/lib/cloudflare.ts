import "server-only";
import { imageEnv } from "@/lib/media";

/**
 * Purge ciblée du cache Cloudflare — best effort.
 *
 * Avec des URLs versionnées par hash (`?v=`), une page remplacée change déjà
 * d'URL : la purge n'est qu'un filet de sécurité. Un échec n'interrompt donc
 * jamais une publication, il est seulement signalé.
 */
export type PurgeResult = {
  attempted: number;
  purged: number;
  skipped: boolean;
  error?: string;
};

/** Cloudflare refuse plus de 30 URLs par appel sur le plan gratuit. */
const MAX_FILES_PER_PURGE = 30;

export function cloudflareConfigured(): boolean {
  const env = imageEnv();
  return Boolean(env.cfToken && env.cfZone);
}

export async function purgeCloudflare(urls: string[]): Promise<PurgeResult> {
  const env = imageEnv();
  const targets = [...new Set(urls.filter((url) => /^https?:\/\//i.test(url)))];
  if (targets.length === 0) return { attempted: 0, purged: 0, skipped: true };
  if (!env.cfToken || !env.cfZone) {
    return { attempted: targets.length, purged: 0, skipped: true, error: "cloudflare_not_configured" };
  }

  const files = targets.slice(0, MAX_FILES_PER_PURGE);
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.cfZone}/purge_cache`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.cfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ files }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const data = (await res.json().catch(() => null)) as { success?: boolean; errors?: unknown[] } | null;
    if (!res.ok || !data?.success) {
      return {
        attempted: files.length,
        purged: 0,
        skipped: false,
        error: `http_${res.status}`,
      };
    }
    return { attempted: files.length, purged: files.length, skipped: false };
  } catch (err) {
    return {
      attempted: files.length,
      purged: 0,
      skipped: false,
      error: err instanceof Error ? err.message : "unreachable",
    };
  }
}
