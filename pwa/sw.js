/*
 * Zeroid WhatsApp service worker — v2.
 * Perbaikan utama vs v1: setiap deploy baru MEMAKSA reload halaman terbuka
 * (controllerchange → reload) sehingga user tidak pernah lagi melihat versi
 * lama setelah Vercel selesai deploy. Static assets tetap stale-while-revalidate,
 * navigasi selalu network-first (tidak pernah menyajikan shell lama).
 */
const VERSION = 'zeroid-v2-media-permanen';
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
    // hapus SEMUA cache versi lama — v1 dan segala precache basi
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Pesan dari halaman: "SKIP_WAITING" → aktifkan SW baru segera.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

const STATIC_RE = /\/(_expo|assets|_static)\//;

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Firebase, embeds, CDN: browser handles
  if (url.pathname.startsWith('/api/')) return;      // server proxy: never cached

  // SPA navigations: SELALU jaringan (no-store) — shell lama tidak pernah disajikan.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        return fresh;
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match(OFFLINE_URL)) ?? new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // static assets hashed: stale-while-revalidate
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
