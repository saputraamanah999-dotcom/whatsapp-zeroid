/*
 * Zeroid WhatsApp service worker.
 * - Precaches the offline shell only.
 * - Static build assets (/_expo/*, /assets/*, hashed files): stale-while-revalidate.
 * - Navigation requests: network-first with offline fallback.
 * - NEVER caches: /api/*, Firestore/Firebase traffic (already excluded since
 *   they are cross-origin XHR/fetch handled by the browser), or any private page
 *   data. Sensitive content is never stored in the SW cache.
 */
const VERSION = 'zeroid-v1';
const OFFLINE_URL = '/offline.html';
const PRECACHE = [OFFLINE_URL, '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(PRECACHE).catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const STATIC_RE = /\/(_expo|assets|_static)\//;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Firebase, embeds, CDN: browser handles
  if (url.pathname.startsWith('/api/')) return;      // server proxy: never cached

  // SPA navigations: network first, offline fallback
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match(OFFLINE_URL)) ?? new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // static assets: stale-while-revalidate
  if (STATIC_RE.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached ?? network;
    })());
  }
});
