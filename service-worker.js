// Mon Métro Paris — service worker (cache-first for app shell + data).
const CACHE_VERSION = "v3";
const CACHE_NAME = `mon-metro-paris-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/db.js",
  "./js/data-loader.js",
  "./js/components/line-badge.js",
  "./js/components/progress-ring.js",
  "./js/components/toast.js",
  "./js/services/stats-service.js",
  "./js/services/badge-engine.js",
  "./js/services/share-service.js",
  "./js/views/map-view.js",
  "./js/views/lines-view.js",
  "./js/views/stats-view.js",
  "./js/views/station-detail.js",
  "./data/stations.json",
  "./data/lines.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

// Third-party CDN deps to precache (best-effort: failures don't break install).
const CDN_DEPS = [
  "https://unpkg.com/dexie@4.0.8/dist/dexie.min.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css",
  "https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await Promise.all(CDN_DEPS.map(async (url) => {
      try {
        const res = await fetch(url, { mode: "no-cors" });
        await cache.put(url, res);
      } catch (e) {
        // Silently skip — CDN may be unreachable during install.
      }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

function shouldHandle(request) {
  const url = new URL(request.url);
  // Don't try to cache map tiles — too many, would blow cache budget.
  if (url.hostname.endsWith("tile.openstreetmap.org")) return false;
  // POST/PUT etc — leave to network.
  if (request.method !== "GET") return false;
  return true;
}

self.addEventListener("fetch", (event) => {
  if (!shouldHandle(event.request)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request, { ignoreSearch: false });
    if (cached) {
      // Refresh in background (stale-while-revalidate) for same-origin only.
      const url = new URL(event.request.url);
      if (url.origin === self.location.origin) {
        fetch(event.request).then(res => {
          if (res && res.ok) cache.put(event.request, res.clone());
        }).catch(() => {});
      }
      return cached;
    }
    try {
      const res = await fetch(event.request);
      if (res && res.ok && new URL(event.request.url).origin === self.location.origin) {
        cache.put(event.request, res.clone());
      }
      return res;
    } catch (e) {
      // offline fallback: try the app shell for HTML navigation
      if (event.request.mode === "navigate") {
        const fallback = await cache.match("./index.html");
        if (fallback) return fallback;
      }
      throw e;
    }
  })());
});
