/* GSTInvoice Pro service worker.
 * Goal: make the app installable and usable offline WITHOUT ever serving a
 * stale build. Vite fingerprints asset filenames, so hashed assets are safe to
 * cache immutably; HTML/navigations always go network-first so a new deploy is
 * picked up as soon as the device is online. */
const VERSION = 'v1';
const SHELL_CACHE = `gip-shell-${VERSION}`;
const ASSET_CACHE = `gip-assets-${VERSION}`;
const OFFLINE_URL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add(OFFLINE_URL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch Supabase/API/cross-origin
  if (url.pathname.startsWith('/api/')) return;     // let the Supabase proxy pass through untouched

  // Navigations (HTML): network-first, fall back to cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(OFFLINE_URL, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
    return;
  }

  // Fingerprinted static assets: cache-first (immutable), populate on first use.
  if (/\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|gif|webp|ico)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || Response.error();
        }
      })()
    );
  }
});
