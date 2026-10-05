/* Service worker « Les Poroiniens » — Phase 6 (finitions), §5.4 / §8.3.
 *
 * Parti pris **volontairement conservateur** :
 *   - il ne s'installe qu'en production (le composant pwa-register.tsx
 *     n'enregistre rien pendant `next dev`) ;
 *   - les navigations passent toujours par le réseau d'abord : le cache ne
 *     sert que de repli hors ligne, jamais de réponse « périmée » en ligne ;
 *   - seuls `/_next/static/*` (fichiers hachés, donc immuables) et les
 *     icônes sont mis en cache-first ;
 *   - aucune interception des appels API ni des pages de scans : le lecteur,
 *     la bibliothèque et les statistiques gardent exactement leur comportement.
 *
 * Objectif : rendre le site installable (manifeste + worker avec handler
 * `fetch`) et lisible hors ligne une fois visité, sans risque de stale-HTML.
 */
const CACHE = "lp-shell-v1";
const KEEP = 25; // navigations conservées au maximum

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(["/icons/icon-192.png", "/icons/icon-512.png"]))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Conserve les `KEEP` entrées les plus récentes d'un cache de navigations. */
async function trimNavigationCache(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - KEEP))) {
    await cache.delete(key);
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
      await trimNavigationCache(cache);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(
      `<!doctype html><html lang="fr"><meta charset="utf-8">` +
        `<meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<title>Hors ligne — Les Poroiniens</title>` +
        `<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#1d1d1f;color:#fff;font-family:system-ui,sans-serif;text-align:center">` +
        `<div style="padding:24px"><h1 style="font-size:20px">Vous êtes hors ligne</h1>` +
        `<p style="color:#a0a0a6;font-size:14px">Cette page n'a pas encore été visitée. Reconnectez-vous puis réessayez.</p>` +
        `<p><a href="/" style="color:#ff757c">Retour à l'accueil</a></p></div></body></html>`,
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // CDN d'images, Turnstile…

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Assets hachés par le build et icônes : immuables, cache-first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
  // Tout le reste (HTML streamé, API, images de scans) : réseau seul.
});
