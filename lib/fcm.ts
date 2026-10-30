/**
 * ZEROID — FCM (Firebase Cloud Messaging) client.
 *
 * NOTIFIKASI LUAR APLIKASI/WEBSITE: pesan baru, panggilan, story developer,
 * broadcast admin — semua dikirim lewat /api/notify (serverless Vercel) yang
 * memakai FCM_SERVER_KEY di server. Kunci server TIDAK PERNAH ada di sini.
 *
 * Web: token browser didaftarkan lewat firebase/messaging + service worker
 * firebase-messaging-sw.js, lalu di-subscribe-kan ke topic `user_<uid>` dan
 * `all` oleh /api/fcm-subscribe (server-side, aman).
 * Native Android: token expo-notifications (FCM) tetap disimpan ke
 * fcm_tokens/{uid} — /api/notify membaca pendaftaran topic dari client ini.
 */
import { Platform } from 'react-native';
import { proxyPost } from './proxy';

export type PushKind = 'message' | 'story' | 'call' | 'group' | 'system' | 'admin';

let webMessaging: any = null;
let webToken: string | null = null;
let fbGetToken: ((m: any, o: any) => Promise<string>) | null = null;

/** Web: ambil token FCM browser + daftarkan ke topic user (via server). */
export async function registerWebFcm(uid: string): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;
    if (!webMessaging) {
      const [{ getApps, initializeApp }, messaging] = await Promise.all([
        import('firebase/app'),
        import('firebase/messaging'),
      ]);
      if (!(await messaging.isSupported())) return null;
      fbGetToken = messaging.getToken as any;
      const cfg = {
        apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID,
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      };
      const app = getApps()[0] ?? initializeApp(cfg as any);
      webMessaging = messaging.getMessaging(app);
      // foreground: tampilkan banner via Notification API biasa (diatur store.ts);
      // di sini cukup pasangan handler kosong agar SW tidak dobel tampil di foreground.
      try {
        messaging.onMessage(webMessaging, () => {});
      } catch {}
    }
    const vapid = String(process.env.EXPO_PUBLIC_FCM_VAPID_KEY ?? '').trim();
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    if (!fbGetToken) return null;
    webToken = await fbGetToken(webMessaging, {
      vapidKey: vapid || undefined,
      serviceWorkerRegistration: swReg,
    } as any);
    if (webToken) {
      // daftarkan topic lewat server (FCM_SERVER_KEY hidup di sana)
      await proxyPost('/api/fcm?action=subscribe', { token: webToken, uid }, 20000).catch(() => {});
    }
    return webToken;
  } catch {
    return null;
  }
}

export async function unregisterWebFcm() {
  try {
    if (Platform.OS === 'web' && webToken) {
      await proxyPost('/api/fcm?action=unsubscribe', { token: webToken }, 15000).catch(() => {});
      webToken = null;
    }
  } catch {}
}

/** Native: daftarkan token expo-notifications (FCM) ke topic lewat server. */
export async function proxySubscribeNative(token: string, uid: string) {
  if (!token || !uid) return;
  await proxyPost('/api/fcm?action=subscribe', { token, uid }, 20000).catch(() => {});
}

export type FcmPushInput = {
  uids?: string[];
  topic?: string;
  title: string;
  body: string;
  kind?: PushKind;
  chatId?: string;
  storyUserId?: string;
  callId?: string;
};

/**
 * Kirim push FCM via /api/notify (server kita). Best-effort: error di-swallow
 * supaya alur chat tidak pernah gagal gara-gara push.
 * AUDIT: endpoint kini WAJIB sesi — ID token user dikirim sebagai Bearer.
 */
export async function fcmPush(input: FcmPushInput): Promise<void> {
  try {
    const { firebase } = await import('./firebase');
    const cu = firebase()?.auth.currentUser;
    const token = cu ? await cu.getIdToken().catch(() => '') : '';
    await proxyPost('/api/notify', {
      uids: input.uids,
      topic: input.topic,
      title: input.title,
      body: input.body,
      kind: input.kind ?? 'message',
      data: {
        chatId: input.chatId ?? '',
        storyUserId: input.storyUserId ?? '',
        callId: input.callId ?? '',
        kind: input.kind ?? 'message',
      },
    }, 12000, token ? { authorization: `Bearer ${token}` } : undefined);
  } catch {
    // push tidak wajib — chat tetap realtime via Firestore snapshot
  }
}
