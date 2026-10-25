/* Static/offline app shell. All essay content remains in the page's local runtime. */
const CACHE_NAME = "essay-tracing-workbench-pwa-v6";
const LOCAL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./layout.js",
  "./manifest.webmanifest",
  "./assets/answer-template.pdf",
  "./assets/answer-template-preview.png",
  "./assets/app-icon.svg",
  "./assets/app-icon-180.png",
  "./assets/app-icon-512.png"
];
const PDF_LIB_URL = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_FILES.map(path => new URL(path, self.registration.scope).href));
    // Best-effort cache of the PDF export library. A slow/unavailable CDN must never
    // hold up the app shell or prevent the preview from initializing.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(PDF_LIB_URL, { mode: "cors", cache: "reload", signal: controller.signal });
      if (response.ok && response.type !== "opaque") await cache.put(PDF_LIB_URL, response.clone());
    } catch (_error) { /* Preview remains usable; PDF export can retry when requested. */ }
    finally { clearTimeout(timeoutId); }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith("essay-tracing-workbench-") && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin || request.url === PDF_LIB_URL) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok && response.type !== "opaque") {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      } catch (error) {
        if (request.mode === "navigate") {
          const fallback = await caches.match(new URL("./index.html", self.registration.scope).href);
          if (fallback) return fallback;
        }
        throw error;
      }
    })());
  }
});
