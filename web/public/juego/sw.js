/* EL ENREDO — offline shell service worker (Prompt Maestro §8: el juego abre sin red).
   Bump CACHE to invalidate on deploy. */
const CACHE = "enredo-shell-v1";
const SHELL = ["/juego", "/juego/manifest.webmanifest", "/juego/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations into the game: network-first, fall back to the cached shell offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/juego", copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches
            .match("/juego")
            .then((m) => m || caches.match(req))
            .then((x) => x || Response.error()),
        ),
    );
    return;
  }

  // Static assets (JS/CSS chunks, icons): cache-first, then backfill the cache.
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && (res.type === "basic" || res.type === "default")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }),
  );
});
