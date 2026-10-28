/*global importScripts, firebase, clients*/
/**
 * Zeroid WhatsApp — FCM background push (web).
 * Menampilkan notifikasi DI LUAR halaman (saat tab tertutup / background).
 * Konfigurasi Firebase web app bersifat publik (identifikasi project, bukan rahasia).
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBiiwHAEY8nExO09bWkc5DAB-5lhUMWsMA',
  authDomain: 'whatsapp-zeroid.firebaseapp.com',
  projectId: 'whatsapp-zeroid',
  storageBucket: 'whatsapp-zeroid.firebasestorage.app',
  messagingSenderId: '199234471979',
  appId: '1:199234471979:web:eb0c2d8477adae3fc4826e',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  const d = payload.data || {};
  self.registration.showNotification(n.title || 'Zeroid WhatsApp', {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.chatId || 'zeroid',
    renotify: true,
    data: d,
  });
});

// Klik notifikasi → buka/fokus aplikasi (chat dibuka oleh handler di aplikasi)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.focus(); return; }
      }
      return clients.openWindow('/');
    })
  );
});
