/**
 * Firebase (project: whatsapp-zeroid — ganti cukup lewat env EXPO_PUBLIC_FIREBASE_*).
 * Native Android keeps using google-services.json; the JS layer reads the
 * web/app keys from EXPO_PUBLIC_FIREBASE_* env vars so no secret is hard-coded.
 *
 * If the env vars are missing the app shows a "configuration required" screen —
 * there is NO local/offline demo mode anymore (all data lives in Firestore).
 */
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth, Auth, browserLocalPersistence, setPersistence,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'whatsapp-zeroid.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'whatsapp-zeroid',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'whatsapp-zeroid.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

export const isFirebaseConfigured = firebaseConfig.apiKey.length > 0 && firebaseConfig.appId.length > 0;

/** Optional Google Sign-In (needs the provider enabled in the Firebase console). */
export const googleAuthConfigured =
  isFirebaseConfigured && process.env.EXPO_PUBLIC_ENABLE_GOOGLE === '1';
/** Optional Phone OTP (needs phone provider enabled — may require billing). */
export const phoneAuthConfigured =
  isFirebaseConfigured && process.env.EXPO_PUBLIC_ENABLE_PHONE === '1';

type FB = { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage };
let app: FirebaseApp | null = null;
let auth: Auth | null = null;

export function firebase(): FB | null {
  if (!isFirebaseConfigured) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
    if (Platform.OS === 'web') {
      auth = getAuth(app);
      setPersistence(auth, browserLocalPersistence).catch(() => {});
    } else {
      // On native the Firebase JS SDK keeps the session for the app lifetime;
      // the Auth gate re-runs on every launch (standard for Expo JS SDK apps).
      auth = getAuth(app);
    }
  }
  return { app, auth: auth!, db: getFirestore(app), storage: getStorage(app) };
}

/** Firestore collection layout used by the app, rules & Cloud Functions. */
export const COLLECTIONS = {
  users: 'users',
  chats: 'chats', // chats/{chatId}/messages/{messageId}  (+ lastMsg denormalised on the chat doc)
  stories: 'stories',
  calls: 'calls', // calls/{callId} + /signals (WebRTC signaling, deleted on end)
  reports: 'reports',
  notifications: 'notifications', // per-user notification center docs
  orders: 'orders', // premium/manual payment orders approved by an admin
  stickers: 'stickers',
  invites: 'invites', // group/channel invite links
  announcements: 'announcements', // admin announcements (banner / popup)
  audit: 'audit_logs', // append-only moderation log (admin-writable)
  animeFavs: 'anime_favs', // private per-user anime favourites
  bans: 'bans', // moderation ban bookkeeping (admin)
  appeals: 'appeals', // banned-user appeals (WhatsApp-style keterangan)
  config: 'config', // config/platform — maintenance mode, feature flags
  fcmTokens: 'fcm_tokens',
  mail: 'mail', // Trigger Email extension (Gmail SMTP)
} as const;

/** Server-side env (Vercel functions only) — never referenced in client code. */
export const SERVER_ENV_KEYS = ['JEREXD_APIKEY', 'IMGBB_KEY'] as const;
