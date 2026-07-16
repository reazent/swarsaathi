const CACHE_VERSION = "swarsaathi-v1.2-2";
const CORE = [
  "./",
  "/static/styles.css",
  "/static/css/milap.css",
  "/static/js/app.js",
  "/static/js/milap.js",
  "/static/js/recordings.js",
  "/static/js/shared.js",
  "/static/js/account.js",
  "/static/js/pitch/detect.js",
  "/static/js/pitch/stabilizer.js",
  "/static/js/pitch/constants.js",
  "/static/audio/tanpura-optimized/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(CORE);
    try {
      const response = await fetch("/static/audio/tanpura-optimized/manifest.json");
      if (!response.ok) return;
      const manifest = await response.json();
      const assets = (manifest.assets || []).map(
        (asset) => `/static/audio/tanpura-optimized/${asset.path}`,
      );
      await cache.addAll(assets);
    } catch (_err) {
      // Core app remains available even if optional audio pre-cache is interrupted.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const cache = await caches.open(CACHE_VERSION);
        cache.put(event.request, response.clone());
      }
      return response;
    } catch (_err) {
      if (event.request.mode === "navigate") return caches.match("./");
      throw _err;
    }
  })());
});
