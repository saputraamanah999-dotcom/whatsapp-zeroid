/**
 * ZEROID WHATSAPP — realtime store.
 *
 * Firestore is the ONLY source of truth. There is no local database, no demo
 * accounts, no simulated peers. The DB snapshot below is a client-side cache
 * assembled from onSnapshot listeners and exposed via useSyncExternalStore.
 *
 * Writes are optimistic where it matters (messages: sending → sent/failed with
 * rollback + retry) and go straight to Firestore otherwise, protected by
 * firestore.rules (role/VIP/badges can never be self-granted).
 */
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile as fbUpdateProfile,
  updatePassword as fbUpdatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser as fbDeleteUser,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithCredential,
  type User as FBUser,
} from 'firebase/auth';
import {
  doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, orderBy, limit as fsLimit,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment, writeBatch, Timestamp, type DocumentData,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppNotification, Call, Chat, ChatAppeal, DB, LeaderRow, Message, NotifKind, Story, User, Visibility, Sticker, Order, ProductKey, SpotifyTrack, PlatformConfig, AnimeFav, Ban, Appeal } from './types';
import { productOf, productSafe, rupiah, PAYMENT_METHODS } from './products';
import { applyStreak } from './streak';
import { refCodeFor, applyPendingReferral, captureRefFromUrl } from './points';
import { sendMail, otpEmailHtml } from './mail';
import { uid, hash, isEmail, duration as fmtDur } from './format';
import { AVATAR_COLORS, setThemeMode, ThemeMode } from './theme';
import { pushBanner, activeChatId, navRef } from './bus';
import { presentLocal } from './notify';
import { resolveMentions, MentionResolution } from './mentions';
import { askAI, thinkAI, analyzeImage, AI_PROVIDERS } from './ai';
import { firebase, isFirebaseConfigured, COLLECTIONS as C, firebaseConfig } from './firebase';
import { fcmPush } from './fcm';
import { recordFbError } from './health';

const THEME_KEY = 'zeroid-theme';
const LOCK_KEY = 'zeroid-unlocked';
const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * Firestore REJECTS `undefined` field values ("setDoc() called with invalid
 * data. Unsupported field value: undefined") — the #1 cause of "Pesan gagal
 * terkirim". Deep-strip them before every write; `null` is fine.
 * FieldValue sentinels (serverTimestamp) pass through untouched.
 */
function clean<T>(v: T): T {
  if (Array.isArray(v)) return v.map((x) => clean(x)) as unknown as T;
  if (v && typeof v === 'object' && (v as any).constructor === Object) {
    const out: any = {};
    for (const [k, val] of Object.entries(v as any)) {
      if (val === undefined) continue;
      out[k] = clean(val);
    }
    return out;
  }
  return v;
}

type Snapshot = { ready: boolean; db: DB; me: User | null; locked: boolean; config: PlatformConfig | null; deviceBan: DeviceBan | null };

/** Kunci perangkat untuk pelanggaran ban: selama ban aktif, ganti akun TIDAK membantu. */
export type DeviceBan = { uid: string; name?: string; reason?: string; until: number };
const DEV_BAN_KEY = 'zeroid-device-ban';
export function readDeviceBan(): DeviceBan | null {
  try {
    const raw = isWeb ? window.localStorage.getItem(DEV_BAN_KEY) : null;
    if (!raw) return null;
    const d = JSON.parse(raw) as DeviceBan;
    if (!d?.uid) return null;
    if (d.until > 0 && d.until <= Date.now()) { try { window.localStorage.removeItem(DEV_BAN_KEY); } catch {} return null; }
    return d;
  } catch { return null; }
}
function setDeviceBan(d: DeviceBan | null) {
  try {
    if (!d) window.localStorage.removeItem(DEV_BAN_KEY);
    else window.localStorage.setItem(DEV_BAN_KEY, JSON.stringify(d));
  } catch {}
  deviceBan = d;
  bump();
}
let deviceBan: DeviceBan | null = isWeb ? readDeviceBan() : null;

const EMPTY: DB = {
  version: 2, users: {}, chats: {}, messages: {}, stories: [], calls: [], notifications: [],
  reports: [], stickers: [], orders: [], announcements: [], audit: [], animeFavs: [], bans: [], appeals: [], config: null,
};

let db: DB = EMPTY;
let uid0: string | null = null;          // firebase auth uid (session)
let me: User | null = null;
let locked = false;
let ready = false;
const listeners = new Set<() => void>();

function rebuild() {
  me = uid0 ? db.users[uid0] ?? null : null;
  const snap: Snapshot = { ready, db, me, locked, config: db.config, deviceBan };
  listeners.forEach((l) => l());
}
let version = 0;
const getSnapshot = () => version; // cheap; screens read getDB()/getMe() via hook below

export function useStore(): Snapshot {
  useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => version,
    () => version
  );
  return { ready, db, me, locked, config: db.config, deviceBan };
}
export const getDB = () => db;
export const getMe = () => me;

function bump() { version++; rebuild(); }

// ============================ helpers ============================

const ts = (v: any): number => {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v?.toMillis === 'function') return v.toMillis();
  // Firestore Timestamp sebagai objek polos { seconds, nanoseconds }
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  if (typeof v === 'string') { const p = Date.parse(v); return isFinite(p) ? p : 0; }
  return 0;
};

/** Field tanggal yang wajib dinormalisasi ke epoch-ms saat dokumen mentah masuk db. */
const DATE_KEYS = new Set(['createdAt', 'updatedAt', 'startedAt', 'connectedAt', 'endedAt', 'bannedAt',
  'decidedAt', 'resolvedAt', 'activeUntil', 'expiresAt', 'readAt', 'lastSeen', 'until', 'clientTime',
  'mutedUntil', 'banUntil', 'suspendedUntil', 'verifiedUntil', 'vipUntil', 'mediaExpiresAt']);

/**
 * Normalisasi dokumen mentah dari Firestore: semua field tanggal (Timestamp /
 * {seconds} / string ISO / detik) → epoch-ms. Inilah obat bug "20014 hari lalu"
 * — dokumen tanpa konversi membuat new Date(Timestamp) jatuh ke 1970.
 */
function normDates<T extends Record<string, any>>(o: T): T {
  if (!o || typeof o !== 'object') return o;
  const out: any = { ...o };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (DATE_KEYS.has(k)) out[k] = ts(v);
    else if (k === 'lastMsg' && v && typeof v === 'object') out[k] = { ...v, createdAt: ts(v.createdAt) };
  }
  return out;
}
const rawDoc = <T extends Record<string, any>>(d: any): T => normDates({ ...d.data(), id: d.id }) as T;

function mapUser(id: string, d: DocumentData): User {
  return {
    id, name: d.name ?? 'Pengguna', email: d.email ?? '', about: d.about ?? '', avatar: d.avatar ?? null,
    banner: d.banner ?? null, bannerType: d.bannerType === 'video' ? 'video' : 'image', color: d.color ?? AVATAR_COLORS[0], phone: d.phone, role: d.role ?? 'user',
    username: d.username, developer: !!d.developer, blueCheck: !!d.blueCheck, vipUntil: ts(d.vipUntil),
    memberUntil: ts(d.memberUntil), security: !!d.security, otpVerified: !!d.otpVerified, pin: d.pin, otpCode: d.otpCode, otpExpires: ts(d.otpExpires),
    spotify: d.spotify ?? null, verified: !!d.verified, banned: !!d.banned, suspendedUntil: ts(d.suspendedUntil),
    mutedUntil: ts(d.mutedUntil), orderAttempts: Array.isArray(d.orderAttempts) ? d.orderAttempts : [],
    banReason: d.banReason, banUntil: ts(d.banUntil), lastSeen: ts(d.lastSeen), createdAt: ts(d.createdAt),
    privacy: { lastSeen: 'everyone', profilePhoto: 'everyone', about: 'everyone', groups: 'everyone', readReceipts: true, storyReplies: true, ...(d.privacy ?? {}) },
    notif: { messages: true, groups: true, stories: true, calls: true, preview: true, sound: true, ...(d.notif ?? {}) },
    blocked: d.blocked ?? [], contacts: d.contacts ?? [],
  };
}

function mapChat(id: string, d: DocumentData): Chat {
  return {
    id, type: d.type ?? 'direct', name: d.name, description: d.description, avatar: d.avatar ?? null,
    color: d.color, members: d.members ?? [], admins: d.admins ?? [], createdBy: d.createdBy ?? '',
    createdAt: ts(d.createdAt), lastRead: d.lastRead ?? {}, typing: d.typing ?? {},
    pinnedBy: d.pinnedBy ?? [], mutedBy: d.mutedBy ?? [], archivedBy: d.archivedBy ?? [],
    verified: !!d.verified, verifiedUntil: ts(d.verifiedUntil), banned: !!d.banned, banReason: d.banReason,
    banUntil: ts(d.banUntil), banAppeal: d.banAppeal ?? undefined,
    postPolicy: d.postPolicy ?? 'everyone', lastMsg: d.lastMsg, inviteCode: d.inviteCode,
    blueCheckPot: d.blueCheckPot ?? undefined,
    disappearing: d.disappearing ?? 'off',
    // STREAK API — TANPA INI API TIDAK PERNAH MUNCUL (selalu terbaca 0)
    streakCount: d.streakCount ?? 0, streakDay: d.streakDay ?? 0, streakUpdatedAt: d.streakUpdatedAt ?? 0,
    streakDeadNotifiedAt: d.streakDeadNotifiedAt ?? 0,
  };
}

/** Centang biru grup/saluran aktif? (kadaluarsa otomatis lewat verifiedUntil) */
export function chatVerified(c?: Chat | null): boolean {
  if (!c) return false;
  return !!c.verified || (c.verifiedUntil ?? 0) > Date.now();
}

/**
 * Centang biru otomatis dari PEMILIK: kalau pembuat grup/saluran punya centang
 * biru (atau developer/admin), grup & saluran miliknya ikut terverifikasi
 * TANPA beli lagi — sesuai aturan baru.
 */
export function chatBadge(c?: Chat | null, d: DB = db): boolean {
  if (!c) return false;
  if (c.type === 'ai') return true;
  if (chatVerified(c)) return true;
  const owner = c.createdBy ? d.users[c.createdBy] : undefined;
  return !!owner && (owner.blueCheck || owner.developer || owner.role === 'admin' || owner.role === 'developer');
}

/** Grup/saluran sedang dibanned? (ban berjangka lewat otomatis) */
export function chatBannedNow(c?: Chat | null): boolean {
  if (!c) return false;
  return !!c.banned || (c.banUntil ?? 0) > Date.now();
}

export function chatBanRemaining(c: Chat): number {
  if (c.banned) return 0; // permanen
  return Math.max(0, (c.banUntil ?? 0) - Date.now());
}

function mapMessage(id: string, d: DocumentData): Message {
  return {
    id, chatId: d.chatId, senderId: d.senderId, type: d.type ?? 'text', text: d.text, uri: d.uri,
    fileName: d.fileName, fileSize: d.fileSize, duration: d.duration, mime: d.mime, width: d.width,
    height: d.height, thumb: d.thumb, storagePath: d.storagePath, replyTo: d.replyTo,
    createdAt: ts(d.createdAt) || ts(d.clientTime), deliveredAt: ts(d.deliveredAt) || undefined,
    editedAt: ts(d.editedAt) || undefined, deletedForAll: !!d.deletedForAll, deletedFor: d.deletedFor ?? [],
    reactions: d.reactions ?? {}, starredBy: d.starredBy ?? [], forwarded: !!d.forwarded, orderId: d.orderId, assistant: !!d.assistant,
    lat: d.lat, lng: d.lng, locationLabel: d.locationLabel, contactName: d.contactName, contactPhone: d.contactPhone,
    poll: d.poll ?? undefined, votes: d.votes ?? undefined,
    viewOnce: !!d.viewOnce, viewedBy: Array.isArray(d.viewedBy) ? d.viewedBy : [],
    expiresAt: ts(d.expiresAt) || undefined, mediaExpiresAt: ts(d.mediaExpiresAt) || undefined, reasoning: d.reasoning,
    mentions: Array.isArray(d.mentions) ? d.mentions.filter((x: any) => x && x.uid) : undefined,
    mentionsAll: !!d.mentionsAll, verified: !!d.verified,
  };
}

function mapStory(id: string, d: DocumentData): Story {
  return {
    id, userId: d.userId, type: d.type ?? 'text', text: d.text, bg: d.bg, uri: d.uri,
    createdAt: ts(d.createdAt), expiresAt: ts(d.expiresAt), viewers: d.viewers ?? [], likes: d.likes ?? [],
    mentions: Array.isArray(d.mentions) ? d.mentions.filter((x: any) => typeof x === 'string') : undefined,
  };
}

function mapCall(id: string, d: DocumentData): Call {
  return {
    id, chatId: d.chatId, callerId: d.callerId, calleeIds: d.calleeIds ?? [], video: !!d.video,
    status: d.status ?? 'ringing', startedAt: ts(d.startedAt), connectedAt: ts(d.connectedAt) || undefined,
    endedAt: ts(d.endedAt) || undefined,
  };
}

// ============================ subscriptions ============================

type Unsub = () => void;
let userSub: Unsub | null = null;
const chatSubs: Unsub[] = [];
const msgSubs = new Map<string, Unsub>();
const msgLimits = new Map<string, number>();
let storySub: Unsub | null = null;
let notifSub: Unsub | null = null;
/** becomes true after the first notifications snapshot — foreground banners only fire for docs that arrive AFTER that */
let foregroundBannerReady = false;
let callSubs: Unsub[] = [];
let miscSubs: Unsub[] = [];
let adminSubs: Unsub[] = [];

function clearAllSubs() {
  [...chatSubs, ...callSubs, ...miscSubs, ...adminSubs].forEach((u) => { try { u(); } catch {} });
  chatSubs.length = callSubs.length = miscSubs.length = adminSubs.length = 0;
  msgSubs.forEach((u) => { try { u(); } catch {} });
  msgSubs.clear();
  [userSub, storySub, notifSub].forEach((u) => { try { u?.(); } catch {} });
  userSub = storySub = notifSub = null;
  foregroundBannerReady = false;
}

function attachUserSubs(fbUid: string) {
  const fb = firebase();
  if (!fb) return;

  // own profile
  userSub = onSnapshot(doc(fb.db, C.users, fbUid), (s) => {
    db.users = { ...db.users, [fbUid]: mapUser(fbUid, s.data() ?? {}) };
    const u = db.users[fbUid];
    if (u.banned || (u.suspendedUntil && u.suspendedUntil > Date.now())) {
      pushBanner({ title: 'Akses dibatasi', body: u.banReason || 'Akunmu diblokir oleh admin.', icon: 'ban' });
    }
    bump();
  }, (e) => console.warn('user sub', e));

  // all users (profile lookups, directory). Readable by signed-in users per rules.
  miscSubs.push(onSnapshot(collection(fb.db, C.users), (s) => {
    const users = { ...db.users };
    s.docChanges().forEach((c) => {
      if (c.type === 'removed') delete users[c.doc.id];
      else users[c.doc.id] = mapUser(c.doc.id, c.doc.data());
    });
    db.users = users; bump();
  }, (e) => console.warn('users sub', e)));

  // chats I am a member of
  chatSubs.push(onSnapshot(query(collection(fb.db, C.chats), where('members', 'array-contains', fbUid)), (s) => {
    const chats = { ...db.chats };
    s.docChanges().forEach((c) => {
      if (c.type === 'removed') delete chats[c.doc.id];
      else chats[c.doc.id] = mapChat(c.doc.id, c.doc.data());
    });
    db.chats = chats; bump();
    checkFireDead();
  }, (e) => console.warn('chats sub', e)));

  // public discovery: global chat + channels
  chatSubs.push(onSnapshot(query(collection(fb.db, C.chats), where('type', 'in', ['global', 'channel']), fsLimit(100)), (s) => {
    const chats = { ...db.chats };
    s.docChanges().forEach((c) => { chats[c.doc.id] = mapChat(c.doc.id, c.doc.data()); });
    db.chats = chats; bump();
  }, (e) => console.warn('public chats sub', e)));

  // stories (24h)
  // stories (24h) — penanda seed '_schema' tidak boleh bocor ke feed
  storySub = onSnapshot(query(collection(fb.db, C.stories), orderBy('createdAt', 'desc'), fsLimit(200)), (s) => {
    const now = Date.now();
    db.stories = s.docs.filter((d) => d.id !== '_schema').map((d) => mapStory(d.id, d.data())).filter((x) => x.expiresAt > now);
    bump();
  }, (e) => console.warn('stories sub', e));

  // my notifications (+ foreground local banners honoring per-user prefs)
  notifSub = onSnapshot(query(collection(fb.db, C.notifications), where('userId', '==', fbUid), orderBy('createdAt', 'desc'), fsLimit(60)), (s) => {
    const prevMax = db.notifications.reduce((mx, n) => Math.max(mx, n.createdAt), 0);
    const next = s.docs.map(rawDoc) as AppNotification[];
    db.notifications = next;
    bump();
    // foreground banner: only for genuinely new docs, not on first load
    if (!foregroundBannerReady) { foregroundBannerReady = true; return; }
    if (s.metadata.hasPendingWrites) return;
    const prefs = db.users[fbUid]?.notif;
    for (const c of s.docChanges()) {
      if (c.type !== 'added') continue;
      const n = { id: c.doc.id, ...(c.doc.data() as any) } as AppNotification;
      if (!n || n.createdAt <= prevMax) continue;
      if (n.chatId && n.chatId === activeChatId) continue; // user is looking at that chat
      if (prefs) {
        const kindOk = n.kind === 'message' ? prefs.messages : n.kind === 'group' ? prefs.groups : n.kind === 'story' ? prefs.stories : n.kind === 'call' ? prefs.calls : true;
        if (!kindOk) continue;
      }
      if (n.chatId && !!db.chats[n.chatId]?.mutedBy.includes(fbUid)) continue;
      presentLocal({
        title: n.title,
        body: prefs?.preview === false ? 'Pesan baru' : n.body,
        channel: n.kind === 'call' ? 'calls' : n.kind === 'group' ? 'groups' : n.kind === 'story' ? 'stories' : 'messages',
        data: { chatId: n.chatId ?? '', storyUserId: n.storyUserId ?? '' },
        category: 'message',
      });
    }
  }, (e) => console.warn('notif sub', e));

  // incoming calls (ringing) + my recent call history — DOKUMEN PENANDA '_schema' DISENYAPKAN
  callSubs.push(onSnapshot(query(collection(fb.db, C.calls), where('calleeIds', 'array-contains', fbUid), orderBy('startedAt', 'desc'), fsLimit(20)), (s) => {
    const byId = new Map(db.calls.map((c) => [c.id, c]));
    s.docs.forEach((d) => { if (d.id !== '_schema') byId.set(d.id, mapCall(d.id, d.data())); });
    db.calls = [...byId.values()].filter((c) => c.id !== '_schema').sort((a, b) => b.startedAt - a.startedAt).slice(0, 60);
    bump();
  }, (e) => console.warn('calls-in sub', e)));
  callSubs.push(onSnapshot(query(collection(fb.db, C.calls), where('callerId', '==', fbUid), orderBy('startedAt', 'desc'), fsLimit(20)), (s) => {
    const byId = new Map(db.calls.map((c) => [c.id, c]));
    s.docs.forEach((d) => { if (d.id !== '_schema') byId.set(d.id, mapCall(d.id, d.data())); });
    db.calls = [...byId.values()].filter((c) => c.id !== '_schema').sort((a, b) => b.startedAt - a.startedAt).slice(0, 60);
    bump();
  }, (e) => console.warn('calls-out sub', e)));

  // my stickers + global stickers (skip penanda '_schema')
  miscSubs.push(onSnapshot(query(collection(fb.db, C.stickers), where('ownerId', '==', fbUid)), (s) => {
    const mine = s.docs.filter((d) => d.id !== '_schema').map(rawDoc) as Sticker[];
    db.stickers = [...mine, ...db.stickers.filter((x) => x.global)];
    bump();
  }, () => {}));
  miscSubs.push(onSnapshot(query(collection(fb.db, C.stickers), where('global', '==', true), fsLimit(100)), (s) => {
    const globals = s.docs.filter((d) => d.id !== '_schema').map(rawDoc) as Sticker[];
    db.stickers = [...db.stickers.filter((x) => x.ownerId !== fbUid), ...globals];
    bump();
  }, () => {}));

  // my anime favourites (private, per-user) — skip penanda seed
  miscSubs.push(onSnapshot(query(collection(fb.db, C.animeFavs), where('uid', '==', fbUid), fsLimit(300)), (s) => {
    db.animeFavs = s.docs.filter((d) => d.id !== '_schema').map(rawDoc) as AnimeFav[];
    bump();
  }, () => {}));

  // my appeal (terlihat saat dibanned — status banding realtime)
  miscSubs.push(onSnapshot(doc(fb.db, C.appeals, fbUid), (s) => {
    const a = s.exists() ? (normDates({ id: s.id, ...s.data() }) as Appeal) : null;
    db.appeals = a
      ? [a, ...db.appeals.filter((x) => x.id !== fbUid)]
      : db.appeals.filter((x) => x.id !== fbUid);
    bump();
  }, () => {}));

  // my orders — skip penanda seed '_schema' (penyebab crash PremiumScreen)
  miscSubs.push(onSnapshot(query(collection(fb.db, C.orders), where('userId', '==', fbUid), orderBy('createdAt', 'desc'), fsLimit(30)), (s) => {
    const byId = new Map(db.orders.map((o) => [o.id, o]));
    s.docs.forEach((d) => { if (d.id !== '_schema') byId.set(d.id, rawDoc(d)); });
    byId.delete('_schema');
    db.orders = [...byId.values()].filter((o: any) => o.id !== '_schema').sort((a: any, b: any) => b.createdAt - a.createdAt);
    bump();
  }, (e) => console.warn('orders sub', e)));

  // announcements + platform config
  miscSubs.push(onSnapshot(query(collection(fb.db, C.announcements), orderBy('createdAt', 'desc'), fsLimit(10)), (s) => {
    db.announcements = s.docs.map(rawDoc) as any;
    bump();
  }, () => {}));
  miscSubs.push(onSnapshot(doc(fb.db, C.config, 'platform'), (s) => {
    db.config = s.exists() ? (s.data() as PlatformConfig) : null;
    bump();
  }, () => {}));

  // admin extras
  const isAdminish = () => {
    const u = db.users[fbUid];
    return !!u && (u.role === 'admin' || u.role === 'developer' || u.role === 'moderator');
  };
  setTimeout(() => {
    if (!isAdminish()) return;
    adminSubs.push(onSnapshot(query(collection(fb.db, C.reports), orderBy('createdAt', 'desc'), fsLimit(100)), (s) => {
      db.reports = s.docs.filter((d) => d.id !== '_schema').map(rawDoc) as any; bump();
    }, () => {}));
    adminSubs.push(onSnapshot(query(collection(fb.db, C.orders), orderBy('createdAt', 'desc'), fsLimit(60)), (s) => {
      const byId = new Map(db.orders.map((o) => [o.id, o]));
      s.docs.forEach((d) => { if (d.id !== '_schema') byId.set(d.id, rawDoc(d)); });
      byId.delete('_schema');
      db.orders = [...byId.values()].filter((o: any) => o.id !== '_schema').sort((a: any, b: any) => b.createdAt - a.createdAt); bump();
    }, () => {}));
    adminSubs.push(onSnapshot(query(collection(fb.db, C.audit), orderBy('createdAt', 'desc'), fsLimit(80)), (s) => {
      db.audit = s.docs.filter((d) => d.id !== '_schema').map(rawDoc) as any; bump();
    }, () => {}));
    adminSubs.push(onSnapshot(query(collection(fb.db, C.appeals), orderBy('createdAt', 'desc'), fsLimit(100)), (s) => {
      db.appeals = s.docs.filter((d) => d.id !== '_schema').map(rawDoc) as any; bump();
    }, (e) => console.warn('appeals sub', e)));
    adminSubs.push(onSnapshot(query(collection(fb.db, C.bans), orderBy('bannedAt', 'desc'), fsLimit(100)), (s) => {
      db.bans = s.docs.filter((d) => d.id !== '_schema').map(rawDoc) as any; bump();
    }, (e) => console.warn('bans sub', e)));
  }, 1500);
}

/** Subscribe to a chat room's messages (paginated by bumping the limit). */
export function subscribeMessages(chatId: string) {
  const fb = firebase();
  if (!fb || msgSubs.has(chatId)) return;
  const lim = msgLimits.get(chatId) ?? 60;
  const qy = query(collection(fb.db, C.chats, chatId, 'messages'), orderBy('createdAt', 'asc'), fsLimit(lim));
  const un = onSnapshot(qy, (s) => {
    const server = s.docs.map((d) => mapMessage(d.id, d.data()));
    const local = db.messages[chatId] ?? [];
    const serverIds = new Set(server.map((m) => m.id));
    // keep optimistic messages that the server has not acknowledged yet
    const pending = local.filter((m) => (m.status === 'sending' || m.status === 'failed') && !serverIds.has(m.id));
    db.messages = { ...db.messages, [chatId]: [...server, ...pending] };
    bump();
  }, (e) => console.warn('messages sub', e));
  msgSubs.set(chatId, un);
}

export function unsubscribeMessages(chatId: string) {
  msgSubs.get(chatId)?.();
  msgSubs.delete(chatId);
  msgLimits.delete(chatId);
}

/** Load one older page (another 60 messages). */
export function loadOlder(chatId: string) {
  const fb = firebase();
  if (!fb) return;
  const un = msgSubs.get(chatId);
  un?.(); msgSubs.delete(chatId);
  msgLimits.set(chatId, (msgLimits.get(chatId) ?? 60) + 60);
  subscribeMessages(chatId);
}

// ============================ init / auth state ============================

let presenceTimer: ReturnType<typeof setInterval> | null = null;
let callWatch: ReturnType<typeof setInterval> | null = null;

export async function initStore() {
  const theme = isWeb ? window.localStorage.getItem(THEME_KEY) : await AsyncStorage.getItem(THEME_KEY);
  if (theme === 'light' || theme === 'dark' || theme === 'system') setThemeMode(theme);
  const unlockedVal = isWeb ? window.sessionStorage.getItem(LOCK_KEY) : await AsyncStorage.getItem(LOCK_KEY);
  locked = unlockedVal !== '1';

  if (!isFirebaseConfigured) {
    ready = true; bump();
    return;
  }
  const fb = firebase()!;

  // Google redirect flow: tangkap error hasil redirect (domain belum diizinkan, dll.)
  if (Platform.OS === 'web') {
    getRedirectResult(fb.auth).catch((e: any) => {
      const code = String(e?.code ?? '');
      if (code && !code.includes('null-user')) pushBanner({ title: 'Masuk Google gagal', body: fbError(e), icon: 'alert' });
    });
  }

  /**
   * ANTI-AKUN-BARU-SAAT-DIBANNED: akun baru (email & Google) pada IP yang
   * tercatat di `banips/{sha256(ip)}` DITOLAK — dipaksa keluar + perangkat
   * dikunci sampai masa ban selesai. Akun lama yang dibanned tetap boleh masuk
   * (mereka melihat BannedScreen); ganti akun lain TIDAK membantu (device lock).
   */
  const assertNotIpBanned = async (uid: string): Promise<boolean> => {
    try {
      if (Platform.OS !== 'web') return true;
      const r = await fetch('/api/ip-ban', { cache: 'no-store' });
      if (!r.ok) return true;
      const { hash } = await r.json();
      if (!hash) return true;
      const bd = await getDoc(doc(fb.db, 'banips', String(hash))).catch(() => null);
      if (!bd || !bd.exists()) return true;
      const until = Number(bd.data().until ?? 0);
      if (until > 0 && until <= Date.now()) return true; // sudah lewat
      setDeviceBan({ uid, until, reason: bd.data().reason ?? 'Akun pada perangkat/IP ini sedang diblokir' });
      await signOut(fb.auth).catch(() => {});
      pushBanner({ title: 'Dilarang membuat akun baru', body: 'Perangkat/IP kamu tercatat pada akun yang diblokir. Tunggu masa blokir selesai — membuat akun baru tidak akan membantu.', icon: 'ban' });
      return false;
    } catch { return true; }
  };

  // restore theme-persisted session is handled by Firebase persistence; just observe.
  onAuthStateChanged(fb.auth, async (u: FBUser | null) => {
    clearAllSubs();
    if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
    if (callWatch) { clearInterval(callWatch); callWatch = null; }
    db = { ...EMPTY };
    uid0 = u?.uid ?? null;
    if (!u) { ready = true; bump(); return; }

    // ensure profile doc exists (first login / Google sign-in)
    const ref = doc(fb.db, C.users, u.uid);
    const snap = await getDoc(ref).catch(() => null);
    if (snap && !snap.exists()) {
      // akun BARU: cek ban IP/perangkat SEBELUM profil dibuat (blokir pendaftaran baru)
      if (!(await assertNotIpBanned(u.uid))) { ready = true; bump(); return; }
      await setDoc(ref, {
        name: u.displayName ?? u.email?.split('@')[0] ?? 'Pengguna', email: u.email ?? '',
        about: 'Hai! Aku pakai Zeroid-whatsapp.', avatar: u.photoURL ?? null, color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        role: 'user', verified: u.emailVerified, banned: false, lastSeen: serverTimestamp(), createdAt: serverTimestamp(),
        points: 0, bestStreak: 0, checkinStreak: 0, refCount: 0, referralCode: refCodeFor(u.uid),
        privacy: { lastSeen: 'everyone', profilePhoto: 'everyone', about: 'everyone', groups: 'everyone', readReceipts: true, storyReplies: true },
        notif: { messages: true, groups: true, stories: true, calls: true, preview: true, sound: true },
        blocked: [], contacts: [],
      }).catch(() => {});
      // referral link promosi: beri reward otomatis bila daftar lewat ?ref=CODE
      if (isWeb) captureRefFromUrl();
      void applyPendingReferral({ id: u.uid, points: 0 } as User).then((r) => {
        if (r?.ok) pushBanner({ title: 'Koin sambutan', body: `+${r.rewarded} koin dari ajakan temanmu — bisa dipakai bayar centang biru!`, icon: 'gift' });
      });
    } else {
      // pastikan SEMUA user punya kode referral (sekali)
      const prof = snap && snap.exists() ? (snap.data() as any) : null;
      if (prof && !prof.referralCode) updateDoc(ref, { referralCode: refCodeFor(u.uid) }).catch(() => {});
      if (isWeb) captureRefFromUrl();
      void applyPendingReferral({ id: u.uid, ...(prof ?? {}), points: prof?.points ?? 0 } as User).then((r) => {
        if (r?.ok) pushBanner({ title: 'Koin sambutan', body: `+${r.rewarded} koin dari ajakan temanmu!`, icon: 'gift' });
      });
    }
    if (snap && snap.exists() && (snap.data() as any).banned) {
      // JANGAN sign-out: pengguna dibanned tetap masuk supaya bisa melihat
      // BannedScreen (alasan + sisa durasi + form banding ala WhatsApp).
      // ANTI EVASION: kunci perangkat + catat IP ke banips (client best-effort).
      const bd = snap.data() as any;
      const until = Number(bd.banUntil ?? bd.suspendedUntil ?? 0);
      setDeviceBan({ uid: u.uid, name: bd.name, reason: bd.banReason, until });
      registerBannedIp(u.uid, until, bd.banReason);
      ready = true; bump();
      return;
    }
    // ban sudah dibuka → lepaskan kunci perangkat milik akun ini
    const dev = readDeviceBan();
    if (dev && dev.uid === u.uid) setDeviceBan(null);
    attachUserSubs(u.uid);
    startPresence();
    ready = true; bump();
  });
}

function startPresence() {
  const fb = firebase();
  if (!fb) return;
  const beat = () => {
    if (!uid0 || !fb.auth.currentUser) return;
    updateDoc(doc(fb.db, C.users, uid0), { lastSeen: serverTimestamp() }).catch(() => {});
  };
  beat();
  presenceTimer = setInterval(beat, 25000);
  callWatch = setInterval(watchCalls, 4000);
}

export function setTheme(m: ThemeMode) {
  setThemeMode(m);
  if (isWeb) window.localStorage.setItem(THEME_KEY, m);
  else AsyncStorage.setItem(THEME_KEY, m).catch(() => {});
}

// ============================ selectors ============================

export const isMember = (c: Chat, u: string) => c.type === 'global' || c.type === 'ai' || c.members.includes(u);
export const isOnline = (u?: User | null) => !!u && (Date.now() - u.lastSeen < 65000);

export function canSee(viewer: User | null, owner: User | undefined, vis: Visibility) {
  if (!owner || !viewer) return false;
  if (viewer.id === owner.id || viewer.role === 'admin' || viewer.role === 'developer') return true;
  if (vis === 'everyone') return true;
  if (vis === 'contacts') return owner.contacts.includes(viewer.id);
  return false;
}

export function visibleMessages(chatId: string, meId: string) {
  const now = Date.now();
  return (db.messages[chatId] ?? []).filter((m) => !m.deletedFor.includes(meId) && !(m.expiresAt && m.expiresAt < now));
}

export function lastMessage(chatId: string, meId: string): Message | undefined {
  const arr = db.messages[chatId] ?? [];
  const now = Date.now();
  for (let i = arr.length - 1; i >= 0; i--) {
    const m = arr[i];
    if (m && !m.deletedFor.includes(meId) && !(m.expiresAt && m.expiresAt < now)) return m;
  }
  return undefined;
}

/**
 * Pesan terakhir untuk daftar chat — memakai db.messages bila tersedia,
 * fallback ke chat.lastMsg (denormalised) supaya chat yang BELUM dibuka
 * tetap tampil dengan preview + badge tidak dibaca (bukan "mulai percakapan").
 */
export function chatLastMsg(chat: Chat, meId: string): Message | undefined {
  const live = lastMessage(chat.id, meId);
  if (live) return live;
  const lm = chat.lastMsg;
  if (!lm || !lm.createdAt) return undefined;
  return {
    id: 'lastMsg', chatId: chat.id, senderId: lm.senderId, type: lm.type, text: lm.text,
    createdAt: lm.createdAt, deletedFor: [], reactions: {}, starredBy: [],
  };
}

export function unreadCount(chat: Chat, meId: string) {
  const lr = chat.lastRead[meId] ?? 0;
  const now = Date.now();
  const arr = db.messages[chat.id] ?? [];
  if (arr.length) {
    return arr.filter((m) => m.createdAt > lr && m.senderId !== meId && m.type !== 'system' && !m.deletedFor.includes(meId) && !(m.expiresAt && m.expiresAt < now)).length;
  }
  // chat belum pernah dibuka di sesi ini → pakai lastMsg denormalised
  const lm = chat.lastMsg;
  if (lm && lm.createdAt > lr && lm.senderId !== meId && lm.type !== 'system') return 1;
  return 0;
}

export function chatTitle(chat: Chat, meId: string, d: DB = db) {
  if (chat.type === 'direct') {
    const other = chat.members.find((x) => x !== meId) ?? meId;
    return d.users[other]?.name ?? 'Pengguna';
  }
  return chat.name ?? 'Chat';
}

export function chatPeer(chat: Chat, meId: string, d: DB = db): User | undefined {
  if (chat.type === 'direct') return d.users[chat.members.find((x) => x !== meId) ?? meId];
  return undefined;
}

export function messageStatus(m: Message, chat: Chat, meId: string): 'sending' | 'failed' | 'sent' | 'delivered' | 'read' {
  if (m.status) return m.status;
  if (m.senderId !== meId) return 'read';
  const others = chat.members.filter((x) => x !== meId);
  const meU = db.users[meId];
  const receiptsOn = meU?.privacy.readReceipts !== false;
  if (receiptsOn && others.length > 0 && others.every((o) => (chat.lastRead[o] ?? 0) >= m.createdAt && db.users[o]?.privacy.readReceipts !== false)) return 'read';
  if (m.deliveredAt) return 'delivered';
  return 'sent';
}

export function messagePreview(m?: Message) {
  if (!m) return '';
  if (m.deletedForAll) return 'Pesan ini telah dihapus';
  switch (m.type) {
    case 'image': return `Foto${m.viewOnce ? ' sekali lihat' : ''}${m.text ? ` · ${m.text}` : ''}`;
    case 'video': return `Video${m.viewOnce ? ' sekali lihat' : ''}${m.text ? ` · ${m.text}` : ''}`;
    case 'audio': return `Pesan suara${m.duration ? ` (${fmtDur(m.duration)})` : ''}`;
    case 'document': return m.fileName ?? 'Dokumen';
    case 'sticker': return 'Stiker';
    case 'location': return 'Lokasi';
    case 'contact': return `Kontak: ${m.contactName ?? ''}`;
    case 'order': return m.text ?? 'Pesanan';
    case 'poll': return `Polling: ${m.text ?? ''}`;
    case 'call': return m.text ?? 'Panggilan';
    default: return m.text ?? '';
  }
}

function notifyFor(userId: string, kind: NotifKind, title: string, body: string, extra: Partial<AppNotification> = {}) {
  const fb = firebase();
  if (!fb || !userId) return;
  // PENTING: JANGAN simpan field id — rawDoc mengambil id dari snapshot; field id:''
  // pernah menimpa id snapshot sehingga doc(db,'notifications','') CRASH (halaman Panggilan).
  addDoc(collection(fb.db, C.notifications), clean({ userId, kind, title, body, createdAt: serverTimestamp(), read: false, ...extra })).catch(() => {});
  // Push FCM (luar aplikasi/website) via server sendiri — best effort, tak pernah melempar error.
  void fcmPush({ uids: [userId], title, body, kind, chatId: extra.chatId, storyUserId: extra.storyUserId });
}

// ============================ auth ============================

/**
 * Catat IP akun yang dibanned ke `banips/{sha256(ip)}` + `bans/{uid}.ips`
 * (client best-effort; rules v9 hanya mengizinkan USER YANG SEDANG DIBANNED
 * menulis dokumen ini). Saat ban dibuka, dokumen kedaluwarsa sendiri.
 */
async function registerBannedIp(uid: string, until: number, reason?: string) {
  try {
    if (Platform.OS !== 'web') return;
    const fb = firebase();
    if (!fb) return;
    const r = await fetch('/api/ip-ban', { cache: 'no-store' });
    if (!r.ok) return;
    const { ip, hash } = await r.json();
    if (!hash) return;
    const { setDoc: sd, doc: dc } = await import('firebase/firestore');
    await sd(dc(fb.db, 'banips', String(hash)), { uid, until: until ?? 0, reason: reason ?? '', ip: String(ip ?? '').slice(0, 45), at: Date.now() });
    await updateDoc(doc(fb.db, C.bans, uid), { lastIp: String(ip ?? '').slice(0, 45), ips: arrayUnion(String(ip ?? '').slice(0, 45)) }).catch(() => {});
  } catch { /* banned user mungkin tidak punya izin — abaikan */ }
}

function fbError(e: any): string {
  const c = String(e?.code ?? '');
  if (c.includes('email-already-in-use')) return 'Email sudah terdaftar.';
  if (c.includes('unauthorized-domain')) return 'Domain belum diizinkan: buka Firebase Console → Authentication → Settings → Authorized domains → tambahkan whatsapp-zeroid.vercel.app, lalu coba lagi.';
  if (c.includes('popup-blocked')) return 'Popup Google diblokir browser. Coba lagi — aplikasi otomatis pindah ke metode halaman penuh.';
  if (c.includes('popup-closed') || c.includes('cancelled-popup-request')) return 'Jendela Google tertutup sebelum selesai. Coba lagi.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email atau password salah.';
  if (c.includes('weak-password')) return 'Password terlalu lemah (minimal 6 karakter).';
  if (c.includes('too-many-requests')) return 'Terlalu banyak percobaan. Coba lagi nanti.';
  if (c.includes('invalid-email')) return 'Format email tidak valid.';
  if (c.includes('network')) return 'Tidak ada koneksi internet.';
  if (c.includes('operation-not-allowed')) return 'Metode masuk ini belum diaktifkan di Firebase console.';
  if (c.includes('requires-recent-login')) return 'Sesi sudah lama. Keluar lalu masuk kembali, dan ulangi tindakan ini.';
  if (c.includes('permission-denied') || c.includes('insufficient permissions'))
    return 'Server menolak aksi ini. Admin perlu mempublikasikan Rules terbaru di Firebase Console (pwa/seed.html → langkah Rules).';
  if (c.includes('unavailable') || c.includes('network')) return 'Koneksi ke server terputus. Periksa internet kamu.';
  return e?.message ?? 'Terjadi kesalahan.';
}

export async function register(name: string, email: string, password: string, username = ''): Promise<{ ok: boolean; error?: string }> {
  name = name.trim();
  const uname = normalizeUsername(username);
  const uErr = usernameError(uname);
  if (uErr) return { ok: false, error: uErr };
  email = email.trim().toLowerCase();
  if (name.length < 2) return { ok: false, error: 'Nama minimal 2 karakter.' };
  if (!isEmail(email)) return { ok: false, error: 'Format email tidak valid.' };
  if (password.length < 6) return { ok: false, error: 'Password minimal 6 karakter.' };
  const fb = firebase();
  if (!fb) return { ok: false, error: 'Firebase belum dikonfigurasi.' };
  try {
    const cred = await createUserWithEmailAndPassword(fb.auth, email, password);
    // ANTI-BAN-EVASION: akun baru pada IP yang sedang diblokir langsung DIHAPUS
    try {
      const r = await fetch('/api/ip-ban', { cache: 'no-store' });
      const { hash } = r.ok ? await r.json() : {} as any;
      if (hash) {
        const bd = await getDoc(doc(fb.db, 'banips', String(hash))).catch(() => null);
        const until = Number(bd?.data()?.until ?? 0);
        if (bd && bd.exists() && (until === 0 || until > Date.now())) {
          setDeviceBan({ uid: cred.user.uid, until, reason: 'Perangkat/IP tercatat pada akun yang diblokir' });
          if (uname) deleteDoc(doc(fb.db, 'usernames', uname)).catch(() => {});
          await signOut(fb.auth).catch(() => {});
          await fbDeleteUser(cred.user).catch(() => {});
          return { ok: false, error: 'Dilarang membuat akun baru: perangkat/IP ini tercatat pada akun yang diblokir. Tunggu masa blokir selesai.' };
        }
      }
    } catch { /* pemeriksaan best-effort — jangan blokir pendaftaran normal */ }
    await fbUpdateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user).catch(() => {});
    const newUid = cred.user.uid;
    // username reservation (unique map)
    if (uname) {
      await setDoc(doc(fb.db, 'usernames', uname), { uid: newUid }).catch(() => {});
    }
    await setDoc(doc(fb.db, C.users, newUid), {
      name, email, about: 'Hai! Aku pakai Zeroid-whatsapp.', avatar: null,
      color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      role: 'user', verified: false, banned: false, username: uname || null,
      lastSeen: serverTimestamp(), createdAt: serverTimestamp(),
      privacy: { lastSeen: 'everyone', profilePhoto: 'everyone', about: 'everyone', groups: 'everyone', readReceipts: true, storyReplies: true },
      notif: { messages: true, groups: true, stories: true, calls: true, preview: true, sound: true },
      blocked: [], contacts: [],
    });
    notifyFor(newUid, 'system', 'Selamat datang di Zeroid-whatsapp', 'Verifikasi email kamu untuk mengamankan akun.');
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  email = email.trim().toLowerCase();
  if (!isEmail(email)) return { ok: false, error: 'Format email tidak valid.' };
  const fb = firebase();
  if (!fb) return { ok: false, error: 'Firebase belum dikonfigurasi.' };
  try {
    await signInWithEmailAndPassword(fb.auth, email, password);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

export async function loginGoogle(): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  if (!fb) return { ok: false, error: 'Firebase belum dikonfigurasi.' };
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    if (Platform.OS === 'web') {
      try {
        await signInWithPopup(fb.auth, provider);
      } catch (e: any) {
        const code = String(e?.code ?? '');
        // popup diblokir browser (terutama Chrome HP) → lanjut redirect penuh halaman
        if (code.includes('popup-blocked') || code.includes('operation-not-supported-in-this-environment') || code.includes('cancelled-popup-request')) {
          await signInWithRedirect(fb.auth, provider);
          return { ok: true };
        }
        throw e;
      }
    } else {
      // native: requires expo-auth-session/google config; surfaced as guidance on failure
      const { GoogleSignin } = require('@react-native-google-signin/google-signin');
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      const cred = GoogleAuthProvider.credential(tokens.idToken);
      await signInWithCredential(fb.auth, cred);
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

export async function logout() {
  const fb = firebase();
  if (fb && uid0) updateDoc(doc(fb.db, C.users, uid0), { lastSeen: serverTimestamp() }).catch(() => {});
  clearAllSubs();
  if (fb) await signOut(fb.auth).catch(() => {});
  uid0 = null; db = { ...EMPTY }; ready = true; bump();
}

export async function resetPassword(email: string): Promise<{ ok: boolean; message: string }> {
  email = email.trim().toLowerCase();
  if (!isEmail(email)) return { ok: false, message: 'Format email tidak valid.' };
  const fb = firebase();
  if (!fb) return { ok: false, message: 'Firebase belum dikonfigurasi.' };
  try {
    await sendPasswordResetEmail(fb.auth, email);
    return { ok: true, message: `Link reset password telah dikirim ke ${email}.` };
  } catch (e: any) {
    return { ok: false, message: fbError(e) };
  }
}

export async function sendVerification() {
  const fb = firebase();
  if (!fb?.auth.currentUser) return;
  try {
    await sendEmailVerification(fb.auth.currentUser);
    pushBanner({ title: 'Email verifikasi dikirim', body: `Cek inbox ${fb.auth.currentUser.email}.`, icon: 'mail' });
  } catch (e: any) {
    pushBanner({ title: 'Gagal mengirim', body: fbError(e), icon: 'alert' });
  }
}

export async function verifyEmail(): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  if (!fb?.auth.currentUser) return { ok: false, error: 'Belum masuk.' };
  await fb.auth.currentUser.reload().catch(() => {});
  if (fb.auth.currentUser.emailVerified) {
    if (uid0) updateDoc(doc(fb.db, C.users, uid0), { verified: true }).catch(() => {});
    return { ok: true };
  }
  return { ok: false, error: 'Email belum diverifikasi. Klik link di email kamu, lalu cek ulang.' };
}

type Updatable = Partial<Pick<User, 'name' | 'about' | 'avatar' | 'banner' | 'bannerType' | 'phone' | 'privacy' | 'notif' | 'spotify' | 'username' | 'pin' | 'color'>>;
/**
 * Simpan perubahan profil ke Firestore.
 * - Field undefined DIBUANG (updateDoc menolak undefined → dulu tombol "Simpan"
 *   diam-diam gagal kalau telepon kosong).
 * - Mengembalikan Promise { ok } sehingga layar pemanggil bisa menunggu hasil
 *   SEBELUM menampilkan "tersimpan" (dulu banner sukses bohong muncul duluan).
 */
export async function updateMe(patch: Updatable): Promise<{ ok: boolean; error?: string }> {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return { ok: false, error: 'Belum masuk.' };
  // strip protected fields defensively (rules also enforce this) + buang undefined/undefined-safe
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue; // updateDoc error "Unsupported field value: undefined"
    safe[k] = v;
  }
  delete safe.role; delete safe.banned; delete safe.vipUntil; delete safe.memberUntil;
  delete safe.blueCheck; delete safe.verified; delete safe.developer;
  if (!Object.keys(safe).length) return { ok: true };
  try {
    await updateDoc(doc(fb.db, C.users, me.id), safe);
  } catch (e) {
    return { ok: false, error: fbError(e) };
  }
  if (fb.auth.currentUser && ((patch.name && patch.name !== me.name) || patch.avatar !== undefined)) {
    fbUpdateProfile(fb.auth.currentUser, {
      displayName: patch.name ?? me.name,
      photoURL: patch.avatar && /^https?:/.test(patch.avatar) ? patch.avatar : fb.auth.currentUser.photoURL,
    }).catch(() => {});
  }
  return { ok: true };
}

export async function changePassword(oldPw: string, newPw: string): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  const cu = fb?.auth.currentUser;
  if (!fb || !cu?.email) return { ok: false, error: 'Belum masuk.' };
  if (newPw.length < 6) return { ok: false, error: 'Password baru minimal 6 karakter.' };
  try {
    const cred = EmailAuthProvider.credential(cu.email, oldPw);
    await reauthenticateWithCredential(cu, cred);
    await fbUpdatePassword(cu, newPw);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

export async function deleteAccount(password?: string): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  const cu = fb?.auth.currentUser;
  if (!fb || !cu) return { ok: false, error: 'Belum masuk.' };
  try {
    if (password && cu.email) {
      await reauthenticateWithCredential(cu, EmailAuthProvider.credential(cu.email, password));
    }
    // remove own content that is cheap to delete client-side
    const batch = writeBatch(fb.db);
    batch.delete(doc(fb.db, C.users, cu.uid));
    const myStories = await getDocs(query(collection(fb.db, C.stories), where('userId', '==', cu.uid)));
    myStories.forEach((s) => batch.delete(s.ref));
    const myNotifs = await getDocs(query(collection(fb.db, C.notifications), where('userId', '==', cu.uid)));
    myNotifs.forEach((s) => batch.delete(s.ref));
    await batch.commit().catch(() => {});
    await fbDeleteUser(cu);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

export function toggleBlock(userId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  updateDoc(doc(fb.db, C.users, me.id), { blocked: me.blocked.includes(userId) ? arrayRemove(userId) : arrayUnion(userId) });
}

// ============================ chats ============================

export function directId(a: string, b: string) { return 'd_' + [a, b].sort().join('_').replace(/[^a-zA-Z0-9_]/g, ''); }

export function openDirect(otherId: string): string {
  const me = getMe()!;
  const fb = firebase();
  const id = directId(me.id, otherId);
  if (!fb) return id;
  if (!db.chats[id]) {
    setDoc(doc(fb.db, C.chats, id), {
      id, type: 'direct', members: [me.id, otherId], admins: [me.id], createdBy: me.id,
      createdAt: serverTimestamp(), lastRead: {}, typing: {}, pinnedBy: [], mutedBy: [], archivedBy: [], postPolicy: 'everyone',
    }, { merge: true }).catch(() => {});
    updateDoc(doc(fb.db, C.users, me.id), { contacts: arrayUnion(otherId) }).catch(() => {});
  }
  return id;
}

/** AI assistant 1-on-1 chat (messages answered via /api/ai server proxy). */
export function openAI(): string {
  const me = getMe()!;
  const fb = firebase();
  const id = 'ai_' + me.id;
  if (fb && !db.chats[id]) {
    setDoc(doc(fb.db, C.chats, id), {
      id, type: 'ai', name: 'Zeroid AI', members: [me.id], admins: [me.id], createdBy: me.id,
      createdAt: serverTimestamp(), lastRead: {}, typing: {}, pinnedBy: [], mutedBy: [], archivedBy: [], postPolicy: 'everyone',
    }, { merge: true }).catch(() => {});
  }
  return id;
}

function sysMsg(chatId: string, text: string, senderId: string, extra: { verified?: boolean } = {}) {
  const fb = firebase();
  if (!fb) return;
  addDoc(collection(fb.db, C.chats, chatId, 'messages'), {
    chatId, senderId, type: 'system', text, clientTime: Date.now(), createdAt: serverTimestamp(),
    deletedFor: [], reactions: {}, starredBy: [], verified: !!extra.verified,
  }).catch(() => {});
}

function mkInviteCode() { return uid('').replace(/[^a-z0-9]/gi, '').slice(0, 10).toLowerCase(); }

export function createGroup(name: string, memberIds: string[], description = '', avatar: string | null = null, type: 'group' | 'channel' = 'group'): string {
  const me = getMe()!;
  const fb = firebase();
  const id = uid(type === 'group' ? 'g_' : 'ch_');
  if (!fb) return id;
  const members = Array.from(new Set([me.id, ...memberIds]));
  setDoc(doc(fb.db, C.chats, id), {
    id, type, name: name.trim(), description, avatar, color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    members, admins: [me.id], createdBy: me.id, createdAt: serverTimestamp(), lastRead: {}, typing: {},
    pinnedBy: [], mutedBy: [], archivedBy: [], postPolicy: type === 'channel' ? 'admins' : 'everyone', inviteCode: mkInviteCode(),
  }).catch(() => {});
  sysMsg(id, type === 'group' ? `${me.name} membuat grup "${name.trim()}"` : `Channel "${name.trim()}" dibuat`, me.id);
  for (const u of members) {
    if (u !== me.id) notifyFor(u, 'group', type === 'group' ? 'Grup baru' : 'Channel baru', `${me.name} menambahkan kamu ke "${name.trim()}"`, { chatId: id });
  }
  return id;
}

export function updateChat(chatId: string, patch: Partial<Pick<Chat, 'name' | 'description' | 'avatar'>>) {
  const me = getMe()!;
  const fb = firebase();
  if (!fb) return;
  updateDoc(doc(fb.db, C.chats, chatId), patch as any).catch((e) => pushBanner({ title: 'Gagal', body: fbError(e), icon: 'alert' }));
  if (patch.name) sysMsg(chatId, `${me.name} mengubah nama menjadi "${patch.name}"`, me.id);
  if (patch.description !== undefined) sysMsg(chatId, `${me.name} mengubah deskripsi`, me.id);
  if (patch.avatar !== undefined) sysMsg(chatId, `${me.name} mengubah foto grup`, me.id);
}

export function addMembers(chatId: string, ids: string[]) {
  const me = getMe()!;
  const fb = firebase();
  if (!fb) return;
  const c = db.chats[chatId];
  const add = ids.filter((x) => c && !c.members.includes(x));
  if (!add.length) return;
  updateDoc(doc(fb.db, C.chats, chatId), { members: arrayUnion(...add) }).catch(() => {});
  for (const u of add) {
    sysMsg(chatId, `${me.name} menambahkan ${db.users[u]?.name ?? 'anggota'}`, me.id);
    notifyFor(u, 'group', 'Ditambahkan ke grup', `${me.name} menambahkan kamu ke "${c?.name ?? 'grup'}"`, { chatId });
  }
}

export function removeMember(chatId: string, userId: string) {
  const me = getMe()!;
  const fb = firebase();
  if (!fb) return;
  const c = db.chats[chatId];
  updateDoc(doc(fb.db, C.chats, chatId), {
    members: arrayRemove(userId), ...(c?.admins.includes(userId) ? { admins: arrayRemove(userId) } : {}),
  }).catch(() => {});
  sysMsg(chatId, userId === me.id ? `${me.name} keluar` : `${me.name} mengeluarkan ${db.users[userId]?.name ?? 'anggota'}`, me.id);
}

export function toggleAdmin(chatId: string, userId: string) {
  const c = db.chats[chatId];
  const fb = firebase();
  if (!c || !fb) return;
  updateDoc(doc(fb.db, C.chats, chatId), { admins: c.admins.includes(userId) ? arrayRemove(userId) : arrayUnion(userId) }).catch(() => {});
  sysMsg(chatId, `${db.users[userId]?.name ?? 'Anggota'} ${c.admins.includes(userId) ? 'bukan admin lagi' : 'sekarang admin'}`, getMe()!.id);
}

export function toggleChatFlag(chatId: string, flag: 'pinnedBy' | 'mutedBy' | 'archivedBy') {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const c = db.chats[chatId];
  const arr = c?.[flag] ?? [];
  const has = arr.includes(me.id);
  // OPTIMISTIC: pindah INSTAN di layar (arsip/semat/bisukan) tanpa reload.
  // Dulu menunggu snapshot server → terasa "harus reload dulu".
  const next = has ? arr.filter((x) => x !== me.id) : [...arr, me.id];
  db.chats = { ...db.chats, [chatId]: { ...c, [flag]: next } };
  bump();
  updateDoc(doc(fb.db, C.chats, chatId), { [flag]: has ? arrayRemove(me.id) : arrayUnion(me.id) }).catch(() => {
    // gagal server → kembalikan biar tidak bohong
    db.chats = { ...db.chats, [chatId]: { ...c, [flag]: arr } };
    bump();
  });
}

export function toggleFollow(chatId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const c = db.chats[chatId];
  updateDoc(doc(fb.db, C.chats, chatId), { members: c?.members.includes(me.id) ? arrayRemove(me.id) : arrayUnion(me.id) }).catch(() => {});
}

export function setPostPolicy(chatId: string, policy: 'everyone' | 'admins') {
  const fb = firebase();
  if (!fb) return;
  updateDoc(doc(fb.db, C.chats, chatId), { postPolicy: policy }).catch(() => {});
}

/** Disappearing messages timer — group admins only (rules enforce server-side). */
export function setDisappearing(chatId: string, val: 'off' | '24h' | '7d' | '90d') {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const c = db.chats[chatId];
  const allowed = c?.admins.includes(me.id) || ['admin', 'developer'].includes(me.role);
  if (!allowed) { pushBanner({ title: 'Tidak diizinkan', body: 'Hanya admin grup yang bisa mengubah timer pesan hilang.', icon: 'ban' }); return; }
  updateDoc(doc(fb.db, C.chats, chatId), { disappearing: val }).catch(() => {});
  sysMsg(chatId, val === 'off' ? `${me.name} menonaktifkan pesan hilang` : `${me.name} mengaktifkan pesan hilang (${val === '24h' ? '24 jam' : val === '7d' ? '7 hari' : '90 hari'})`, me.id);
}

export function clearChat(chatId: string) {
  const me = getMe()!;
  const fb = firebase();
  if (!fb) return;
  // hide history for me: mark all visible messages deletedFor += me (batched, capped)
  const msgs = (db.messages[chatId] ?? []).filter((m) => !m.deletedFor.includes(me.id)).slice(-300);
  if (!msgs.length) return;
  const batch = writeBatch(fb.db);
  for (const m of msgs) batch.update(doc(fb.db, C.chats, chatId, 'messages', m.id), { deletedFor: arrayUnion(me.id) });
  batch.commit().catch(() => {});
}

export async function deleteChat(chatId: string) {
  const me = getMe()!;
  const c = db.chats[chatId];
  clearChat(chatId);
  if (c?.type === 'group' || c?.type === 'channel') removeMember(chatId, me.id);
  else if (c && !c.archivedBy.includes(me.id)) toggleChatFlag(chatId, 'archivedBy');
}

export function markRead(chatId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const c = db.chats[chatId];
  if (!c) return;
  const last = c.lastMsg?.createdAt ?? (db.messages[chatId] ?? []).at(-1)?.createdAt ?? 0;
  if ((c.lastRead[me.id] ?? 0) >= last) return;
  updateDoc(doc(fb.db, C.chats, chatId), { [`lastRead.${me.id}`]: Date.now() }).catch(() => {});
}

let lastTypingWrite = 0;
let routingKe = false; // guards the "ke + nama" AI summon against re-entry
export function setTyping(chatId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || Date.now() - lastTypingWrite < 2000) return;
  lastTypingWrite = Date.now();
  updateDoc(doc(fb.db, C.chats, chatId), { [`typing.${me.id}`]: Date.now() }).catch(() => {});
}

export function clearTyping(chatId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  updateDoc(doc(fb.db, C.chats, chatId), { [`typing.${me.id}`]: 0 }).catch(() => {});
}

export function typingUsers(chat: Chat, meId: string) {
  return Object.entries(chat.typing ?? {}).filter(([u, t]) => u !== meId && (t as number) > 0 && Date.now() - (t as number) < 6000).map(([u]) => u);
}

// ============================ messages ============================

export type OutMsg = Partial<Pick<Message, 'type' | 'text' | 'uri' | 'fileName' | 'fileSize' | 'duration' | 'mime' | 'width' | 'height' | 'thumb' | 'storagePath' | 'replyTo' | 'forwarded' | 'orderId' | 'assistant' | 'lat' | 'lng' | 'locationLabel' | 'contactName' | 'contactPhone' | 'reasoning' | 'mediaExpiresAt' | 'poll' | 'viewOnce'>>;

/** disappearing-message TTL in ms for a chat, or 0 when off */
export const disappearingMs = (c?: Chat | null): number =>
  c?.disappearing === '24h' ? 24 * 3600000 : c?.disappearing === '7d' ? 7 * 86400000 : c?.disappearing === '90d' ? 90 * 86400000 : 0;

// ---------- AI Anti-Spam ----------
// Jendela geser 10 detik: > 6 pesan = mencurigakan → mute otomatis 10 menit +
// laporan ke admin + pesan penjelasan ke pengirim (durasi & cara chat admin).
const SPAM_WINDOW = 10_000;
const SPAM_MAX = 6;
const MUTE_MS = 10 * 60_000;
let sendTimes: number[] = [];

export function mutedRemaining(u?: User | null): number {
  return Math.max(0, (u?.mutedUntil ?? 0) - Date.now());
}

function spamCheck(): boolean {
  const me = getMe();
  if (!me) return false;
  if (mutedRemaining(me) > 0) {
    pushBanner({
      title: 'Kirim pesan dibatasi',
      body: `AI Anti-Spam membatasimu ${fmtDur(mutedRemaining(me) / 1000)} lagi. Kalau ini salah, tulis masalahmu ke admin lewat chat global.`,
      icon: 'shield',
    });
    return true;
  }
  const now = Date.now();
  sendTimes = sendTimes.filter((t) => now - t < SPAM_WINDOW);
  sendTimes.push(now);
  if (sendTimes.length > SPAM_MAX) {
    sendTimes = [];
    const until = now + MUTE_MS;
    const fb = firebase();
    if (fb) updateDoc(doc(fb.db, C.users, me.id), { mutedUntil: until }).catch(() => {});
    pushBanner({
      title: 'AI Anti-Spam: kamu dibatasi 10 menit',
      body: 'Pesanmu terdeteksi berlebihan (mencurigakan). Kalau ini salah atau ada masalah, tulis aja ke admin — admin bisa membuka lebih cepat.',
      icon: 'alert',
    });
    notifyFor(me.id, 'admin', 'Kamu dibatasi sementara', 'AI Anti-Spam mendeteksi pengiriman berlebihan. Masa pembatasan 10 menit. Tulis masalahmu ke admin untuk dibuka lebih cepat.', { chatId: 'c_global' });
    // laporan ke semua admin/developer
    for (const a of Object.values(db.users).filter((x) => x.role === 'admin' || x.role === 'developer')) {
      notifyFor(a.id, 'admin', 'Spam terdeteksi', `${me.name} (@${me.username ?? me.id.slice(0, 6)}) dibatasi otomatis 10 menit oleh AI Anti-Spam.`);
    }
    return true;
  }
  return false;
}

// ---------- mentions: @username / @semua ----------
/** Resolve mention dari teks pesan → uid target + referensi utk disimpan di pesan. */
function resolveMsgMentions(chat: Chat, text: string): MentionResolution {
  const empty: MentionResolution = { uids: [], refs: [], all: false };
  if (!text || (chat.type !== 'group' && chat.type !== 'global')) return empty;
  const sender = getMe()?.id ?? '';
  const candidates = (chat.members ?? []).map((uid) => db.users[uid]).filter(Boolean);
  return resolveMentions(text, candidates, sender);
}


export async function sendMessage(chatId: string, payload: OutMsg): Promise<Message | null> {
  const sender = getMe()?.id;
  const fb = firebase();
  if (!sender || !fb) return null;
  const chat = db.chats[chatId];
  if (!chat) return null;
  // "ke + nama" summon: "ke gpt apa itu React" → jawaban AI (provider gpt)
  // berlaku di SEMUA chat; tidak berlaku untuk pesan balasan AI sendiri.
  if (!routingKe && !payload.assistant && !payload.uri && chat.type !== 'ai') {
    const mKe = /^ke\s+([a-zA-Z0-9_.-]+)\s+([\s\S]+)$/.exec(payload.text?.trim() ?? '');
    if (mKe) {
      const alias = mKe[1].toLowerCase();
      const rest = mKe[2].trim();
      const known = (AI_PROVIDERS as readonly { id: string; label: string }[]).some((p) => p.id === alias);
      const thinking = alias === 'think' || alias === 'pikir';
      void askAssistant(chatId, rest, { model: known ? alias : undefined, thinking, search: thinking });
      return null;
    }
  }
  // channels may restrict posting
  if (chat.type === 'channel' && chat.postPolicy === 'admins' && !chat.admins.includes(sender) && !['admin', 'developer'].includes(db.users[sender]?.role ?? '')) {
    pushBanner({ title: 'Tidak diizinkan', body: 'Hanya admin yang bisa mengirim pesan di channel ini.', icon: 'ban' });
    return null;
  }
  // grup/saluran dibanned admin → member tidak bisa mengirim (admin tetap bisa utk pesan sistem)
  if (chatBannedNow(chat) && !isFullAdmin(getMe())) {
    pushBanner({ title: 'Grup/Saluran dibanned', body: chat.banReason || 'Grup atau saluran ini diblokir admin — tulis banding di layar tinjauan.', icon: 'ban' });
    return null;
  }
  // AI Anti-Spam: pesan sistem/AI tidak ikut dihitung
  if (!payload.assistant && payload.type !== 'system') {
    if (spamCheck()) return null;
  }
  const ref = doc(collection(fb.db, C.chats, chatId, 'messages'));
  const ttl = disappearingMs(chat);
  const local: Message = {
    id: ref.id, chatId, senderId: sender, type: payload.type ?? 'text', text: payload.text?.trim() || undefined,
    uri: payload.uri, fileName: payload.fileName, fileSize: payload.fileSize, duration: payload.duration,
    mime: payload.mime, width: payload.width, height: payload.height, thumb: payload.thumb,
    storagePath: payload.storagePath, replyTo: payload.replyTo, forwarded: payload.forwarded, orderId: payload.orderId, assistant: payload.assistant,
    lat: payload.lat, lng: payload.lng, locationLabel: payload.locationLabel, contactName: payload.contactName, contactPhone: payload.contactPhone,
    poll: payload.poll, votes: payload.poll ? {} : undefined,
    viewOnce: payload.viewOnce, viewedBy: [],
    reasoning: payload.reasoning, expiresAt: ttl ? Date.now() + ttl : undefined, mediaExpiresAt: payload.mediaExpiresAt,
    createdAt: Date.now(), deletedFor: [], reactions: {}, starredBy: [], status: 'sending',
  };
  // mention @username / @semua (grup & global) — disimpan di pesan untuk highlight
  const men = resolveMsgMentions(chat, payload.text ?? '');
  if (men.refs.length) local.mentions = men.refs;
  if (men.all) local.mentionsAll = true;
  // optimistic
  db.messages = { ...db.messages, [chatId]: [...(db.messages[chatId] ?? []), local] };
  bump();
  const persist = {
    chatId, senderId: sender, type: local.type, text: local.text, uri: local.uri, fileName: local.fileName,
    fileSize: local.fileSize, duration: local.duration, mime: local.mime, width: local.width, height: local.height,
    thumb: local.thumb, storagePath: local.storagePath, replyTo: local.replyTo, forwarded: local.forwarded,
    orderId: local.orderId, assistant: local.assistant ?? null, lat: local.lat ?? null, lng: local.lng ?? null,
    locationLabel: local.locationLabel ?? null, contactName: local.contactName ?? null, contactPhone: local.contactPhone ?? null,
    reasoning: local.reasoning ?? null, expiresAt: local.expiresAt ?? null, mediaExpiresAt: local.mediaExpiresAt ?? null,
    poll: local.poll ?? null, votes: {},
    viewOnce: !!local.viewOnce, viewedBy: [],
    mentions: local.mentions ?? [], mentionsAll: !!local.mentionsAll,
    clientTime: local.createdAt, createdAt: serverTimestamp(),
    deletedFor: [], reactions: {}, starredBy: [],
  };
  try {
    await setDoc(ref, clean(persist));
    // denormalised preview + clear my typing
    const pv = messagePreview({ ...local, status: undefined } as Message);
    updateDoc(doc(fb.db, C.chats, chatId), { lastMsg: { text: pv.slice(0, 120), type: local.type, senderId: sender, createdAt: local.createdAt }, [`typing.${sender}`]: 0 }).catch(() => {});
    // STREAK API: rawat api + kucing chat (hanya pesan sungguhan, bukan sistem/AI)
    if (!payload.assistant && payload.type !== 'system') void applyStreak(db.chats[chatId] ?? chat, getMe()!);
    // mention notifications: @username / @semua di grup & global (realtime ke yang disebut)
    for (const u of men.uids.slice(0, 30)) {
      const name = db.users[sender]?.name ?? 'Seseorang';
      const tag = men.all ? 'Semua anggota disebut' : 'Menyebut kamu';
      notifyFor(u, 'group', `${name} · ${tag}`, `${chat.name ?? 'Grup'}: ${(local.text ?? '').slice(0, 80)}`, { chatId });
    }
    // recipients mark delivered when they receive it (listener side)
    return local;
  } catch (e: any) {
    db.messages = { ...db.messages, [chatId]: (db.messages[chatId] ?? []).map((m) => (m.id === ref.id ? { ...m, status: 'failed' as const } : m)) };
    bump();
    pushBanner({ title: 'Pesan gagal terkirim', body: fbError(e), icon: 'alert' });
    return null;
  }
}

export function retryMessage(chatId: string, id: string) {
  const fb = firebase();
  const me = getMe();
  if (!fb || !me) return;
  const m = (db.messages[chatId] ?? []).find((x) => x.id === id && x.status === 'failed');
  if (!m) return;
  db.messages = { ...db.messages, [chatId]: (db.messages[chatId] ?? []).map((x) => (x.id === id ? { ...x, status: 'sending' } : x)) };
  bump();
  const ref = doc(fb.db, C.chats, chatId, 'messages', id);
  const rm = resolveMsgMentions(db.chats[chatId] ?? { type: 'direct' } as Chat, m.text ?? '');
  setDoc(ref, clean({
    chatId, senderId: me.id, type: m.type, text: m.text, uri: m.uri, fileName: m.fileName, fileSize: m.fileSize,
    duration: m.duration, mime: m.mime, width: m.width, height: m.height, thumb: m.thumb, storagePath: m.storagePath,
    replyTo: m.replyTo, forwarded: m.forwarded, lat: m.lat ?? null, lng: m.lng ?? null, locationLabel: m.locationLabel ?? null,
    contactName: m.contactName ?? null, contactPhone: m.contactPhone ?? null, expiresAt: m.expiresAt ?? null,
    mediaExpiresAt: m.mediaExpiresAt ?? null, viewOnce: !!m.viewOnce, viewedBy: m.viewedBy ?? [],
    mentions: rm.refs, mentionsAll: rm.all,
    clientTime: m.createdAt, createdAt: serverTimestamp(), deletedFor: [], reactions: {}, starredBy: [],
  })).catch(() => {});
}

export function editMessage(chatId: string, id: string, text: string) {
  const fb = firebase();
  if (!fb) return;
  updateDoc(doc(fb.db, C.chats, chatId, 'messages', id), { text: text.trim(), editedAt: Date.now() }).catch(() => {});
}

export function deleteForMe(chatId: string, id: string) {
  const me = getMe()!;
  const fb = firebase();
  if (!fb) return;
  updateDoc(doc(fb.db, C.chats, chatId, 'messages', id), { deletedFor: arrayUnion(me.id) }).catch(() => {});
}

export function deleteForAll(chatId: string, id: string) {
  const fb = firebase();
  if (!fb) return;
  updateDoc(doc(fb.db, C.chats, chatId, 'messages', id), { deletedForAll: true, text: null, uri: null, thumb: null, storagePath: null, reactions: {} }).catch(() => {});
}

export function react(chatId: string, id: string, emoji: string) {
  const me = getMe()!;
  const fb = firebase();
  if (!fb) return;
  const m = (db.messages[chatId] ?? []).find((x) => x.id === id);
  if (!m) return;
  if (m.reactions[me.id] === emoji) {
    updateDoc(doc(fb.db, C.chats, chatId, 'messages', id), { [`reactions.${me.id}`]: null }).catch(() => {});
  } else {
    updateDoc(doc(fb.db, C.chats, chatId, 'messages', id), { [`reactions.${me.id}`]: emoji }).catch(() => {});
  }
}

export function toggleStar(chatId: string, id: string) {
  const me = getMe()!;
  const fb = firebase();
  if (!fb) return;
  const m = (db.messages[chatId] ?? []).find((x) => x.id === id);
  if (!m) return;
  updateDoc(doc(fb.db, C.chats, chatId, 'messages', id), { starredBy: m.starredBy.includes(me.id) ? arrayRemove(me.id) : arrayUnion(me.id) }).catch(() => {});
}

// ============================ polling (vote) ============================

/** Vote polling ala WhatsApp — ketuk pilihan untuk memilih / membatalkan. */
export function votePoll(chatId: string, msgId: string, optionIdx: number) {
  const me = getMe()!;
  const fb = firebase();
  if (!fb) return;
  const m = (db.messages[chatId] ?? []).find((x) => x.id === msgId);
  if (!m?.poll) return;
  const cur = m.votes?.[me.id];
  let next: number | number[];
  if (m.poll.multi) {
    const arr = Array.isArray(cur) ? [...cur] : [];
    const i = arr.indexOf(optionIdx);
    if (i >= 0) arr.splice(i, 1); else arr.push(optionIdx);
    next = arr;
  } else {
    next = cur === optionIdx ? -1 : optionIdx;
  }
  updateDoc(doc(fb.db, C.chats, chatId, 'messages', msgId), { [`votes.${me.id}`]: next }).catch(() => {});
}

/** Foto/video SEKALI LIHAT: catat bahwa aku sudah membuka media ini.
 *  Dibaca sekali per pengguna — setelah itu bubble berubah jadi "dibuka". */
export function markViewOnce(chatId: string, msgId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const m = (db.messages[chatId] ?? []).find((x) => x.id === msgId);
  if (!m?.viewOnce || (m.viewedBy ?? []).includes(me.id)) return;
  updateDoc(doc(fb.db, C.chats, chatId, 'messages', msgId), { viewedBy: arrayUnion(me.id) }).catch(() => {});
}

export function forwardMessage(msg: Message, chatIds: string[]) {
  for (const c of chatIds) {
    sendMessage(c, {
      type: msg.type, text: msg.text, uri: msg.uri, fileName: msg.fileName, fileSize: msg.fileSize,
      duration: msg.duration, mime: msg.mime, width: msg.width, height: msg.height, thumb: msg.thumb,
      storagePath: msg.storagePath, forwarded: true, lat: msg.lat, lng: msg.lng, locationLabel: msg.locationLabel,
      contactName: msg.contactName, contactPhone: msg.contactPhone,
    });
  }
}

export async function reportMessage(msg: Message, reason: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  try {
    await addDoc(collection(fb.db, C.reports), { messageId: msg.id, chatId: msg.chatId, reporterId: me.id, reason, createdAt: serverTimestamp(), resolved: false });
    pushBanner({ title: 'Laporan terkirim', body: 'Terima kasih. Moderator akan meninjau laporan ini.', icon: 'shield-check' });
  } catch (e: any) {
    pushBanner({ title: 'Gagal mengirim laporan', body: fbError(e), icon: 'alert' });
  }
}

/** Called by ChatRoom when receiving messages to mark delivered receipts. */
export function markDelivered(chatId: string, msgs: Message[]) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const todo = msgs.filter((m) => m.senderId !== me.id && !m.deliveredAt && m.createdAt > Date.now() - 86400000).slice(0, 30);
  if (!todo.length) return;
  const batch = writeBatch(fb.db);
  for (const m of todo) batch.update(doc(fb.db, C.chats, chatId, 'messages', m.id), { deliveredAt: Date.now() });
  batch.commit().catch(() => {});
}

// ============================ AI assistant ============================

export type AskOpts = {
  history?: { role: 'user' | 'assistant'; content: string }[];
  model?: string;
  thinking?: boolean;
  search?: boolean;
  imageUrl?: string;
  imagePrompt?: string;
};

export async function askAssistant(chatId: string, prompt: string, opts: AskOpts = {}) {
  const me = getMe();
  if (!me) return;
  const history = opts.history ?? [];
  routingKe = true;
  try {
    await sendMessage(chatId, opts.imageUrl ? { type: 'image', uri: opts.imageUrl, text: prompt || undefined } : { text: prompt });
  } finally {
    routingKe = false;
  }
  const typingId = uid('a_');
  db.messages = { ...db.messages, [chatId]: [...(db.messages[chatId] ?? []), { id: typingId, chatId, senderId: 'ai', type: 'text', text: '…', createdAt: Date.now(), deletedFor: [], reactions: {}, starredBy: [], status: 'sending' }] };
  bump();
  const dropTyping = () => {
    db.messages = { ...db.messages, [chatId]: (db.messages[chatId] ?? []).filter((m) => m.id !== typingId) };
    bump();
  };
  try {
    const r = opts.imageUrl
      ? await analyzeImage(opts.imageUrl, opts.imagePrompt || prompt || 'Jelaskan gambar ini secara detail')
      : opts.thinking
      ? await thinkAI(prompt, { search: opts.search, sessionId: chatId })
      : await askAI(prompt, { history, model: opts.model, sessionId: chatId });
    dropTyping();
    await sendMessage(chatId, { text: r.text, assistant: true, reasoning: r.reasoning });
  } catch (e: any) {
    dropTyping();
    await sendMessage(chatId, { text: `AI belum bisa menjawab sekarang. ${String(e?.message ?? 'Coba lagi beberapa saat lagi.').slice(0, 160)}` });
  }
}

// ============================ anime favourites ============================

const favId = (slug: string, u: string) => `${u}__${slug}`;

export function isAnimeFav(slug: string): boolean {
  return db.animeFavs.some((f) => f.slug === slug);
}

export async function toggleAnimeFav(card: { slug: string; title: string; poster?: string }): Promise<boolean> {
  const u = getMe()?.id;
  const fb = firebase();
  if (!u || !fb) return false;
  const existing = db.animeFavs.find((f) => f.slug === card.slug);
  try {
    if (existing) {
      await deleteDoc(doc(fb.db, C.animeFavs, existing.id));
      db.animeFavs = db.animeFavs.filter((f) => f.slug !== card.slug);
    } else {
      const id = favId(card.slug, u);
      const fav: AnimeFav = { id, uid: u, slug: card.slug, title: card.title, poster: card.poster, createdAt: Date.now() };
      await setDoc(doc(fb.db, C.animeFavs, id), clean(fav));
      db.animeFavs = [fav, ...db.animeFavs.filter((f) => f.id !== id)];
    }
    bump();
  } catch (e: any) {
    pushBanner({ title: 'Favorit gagal', body: fbError(e), icon: 'alert' });
  }
  return !existing;
}

// ============================ stories ============================

export const activeStories = (d: DB = db) => {
  const now = Date.now();
  return d.stories.filter((s) => s.expiresAt > now);
};

export function postStory(s: Pick<Story, 'type' | 'text' | 'bg' | 'uri'>) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  // SW mention: @username di teks/caption SW → simpan uid + notif ke yang disebut
  const candidates = Object.values(db.users).filter(Boolean);
  const men = resolveMentions(s.text ?? '', candidates, me.id);
  addDoc(collection(fb.db, C.stories), {
    userId: me.id, type: s.type, text: s.text ?? null, bg: s.bg ?? null, uri: s.uri ?? null,
    createdAt: serverTimestamp(), expiresAt: Date.now() + 24 * 3600000, viewers: [], likes: [],
    mentions: men.uids,
  })
    .then(() => {
      // SW mention realtime: notifikasi ke tiap user yang disebut (@username di SW)
      for (const u of men.uids.slice(0, 30)) {
        notifyFor(u, 'story', `${me.name} menyebut kamu di SW`, (s.text ?? '').slice(0, 80), { storyUserId: me.id });
      }
      // SW developer/admin = PUBLIK ke semua pengguna + notif ke semua user
      if (me.role === 'developer' || me.role === 'admin') {
        const targets = Object.values(db.users).filter((u) => u.id !== me.id && !u.banned).slice(0, 200);
        for (const u of targets) {
          if (men.uids.includes(u.id)) continue; // sudah dapat notif mention
          notifyFor(u.id, 'story', 'Story Developer', `${me.name} baru saja posting Story — lihat sekarang!`, { storyUserId: me.id });
        }
        void fcmPush({ topic: 'all', title: 'Story Developer', body: `${me.name} baru saja posting Story di Zeroid.`, kind: 'story', storyUserId: me.id });
      }
    })
    .catch((e) => {
      recordFbError(e);
      pushBanner({ title: 'Gagal mengirim Story', body: fbError(e), icon: 'alert' });
    });
}

export function viewStory(storyId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const s = db.stories.find((x) => x.id === storyId);
  if (!s || s.userId === me.id || s.viewers.includes(me.id)) return;
  updateDoc(doc(fb.db, C.stories, storyId), { viewers: arrayUnion(me.id) }).catch(() => {});
}

export function likeStory(storyId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const s = db.stories.find((x) => x.id === storyId);
  if (!s) return;
  const liked = s.likes.includes(me.id);
  updateDoc(doc(fb.db, C.stories, storyId), { likes: liked ? arrayRemove(me.id) : arrayUnion(me.id) }).catch(() => {});
  if (!liked && s.userId !== me.id) notifyFor(s.userId, 'story', 'Aktivitas Story', `${me.name} menyukai Story kamu`, { storyUserId: s.userId });
}

export function deleteStory(storyId: string) {
  const me = getMe();
  const fb = firebase();
  const s = db.stories.find((x) => x.id === storyId);
  if (!me || !fb || !s) return;
  if (s.userId !== me.id && !['admin', 'developer', 'moderator'].includes(me.role)) return;
  deleteDoc(doc(fb.db, C.stories, storyId)).catch(() => {});
}

export function replyStory(story: Story, text: string) {
  const id = openDirect(story.userId);
  sendMessage(id, { text: `Membalas Story: ${text}` });
  return id;
}

// ============================ calls ============================

/**
 * NOTIF API PADAM (real-time): hari kosong → api di chat padam → pengguna
 * menerima notifikasi sekali per kejadian (streakDeadNotifiedAt anti dobel).
 * Ditangkap dari snapshot chats supaya tanpa membuka chat pun notif muncul.
 */
function checkFireDead() {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  for (const c of Object.values(db.chats)) {
    const count = c.streakCount ?? 0;
    const lastDay = c.streakDay ?? 0;
    if (count < 3 || !lastDay) continue;
    const dead = Date.now() - lastDay >= 2 * 86400000;
    const notified = (c.streakDeadNotifiedAt ?? 0) >= lastDay;
    if (dead && !notified) {
      const other = c.members.find((x) => x !== me.id) ?? '';
      const name = c.type === 'direct' ? (db.users[other]?.name ?? chatTitle(c, me.id, db)) : (c.name ?? chatTitle(c, me.id, db));
      notifyFor(me.id, 'system', 'Api streak padam', `Api ${count} hari bareng ${name} padam karena sehari kosong. Bisa dihidupkan lagi (sisa ${Math.max(0, 5 - (me.fireRevives?.[new Date().toISOString().slice(0, 7)] ?? 0))}x bulan ini).`, { chatId: c.id });
      updateDoc(doc(fb.db, C.chats, c.id), { streakDeadNotifiedAt: lastDay }).catch(() => {});
    }
  }
}

export function startCall(chatId: string, video: boolean): string | null {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return null;
  const chat = db.chats[chatId];
  if (!chat || chat.type !== 'direct') {
    pushBanner({ title: 'Panggilan', body: 'Panggilan hanya tersedia untuk chat pribadi.', icon: 'phone' });
    return null;
  }
  const callee = chat.members.find((x) => x !== me.id);
  if (!callee) return null;
  const peer = db.users[callee];
  if (!peer) return null;
  // busy check: either side already in an ongoing/ringing call
  const busy = db.calls.find((c) => (c.status === 'ringing' || c.status === 'ongoing') && (c.calleeIds.includes(callee) || c.callerId === callee || c.calleeIds.includes(me.id) || c.callerId === me.id));
  if (busy) {
    pushBanner({ title: 'Sibuk', body: `${peer.name} sedang ada di panggilan lain.`, icon: 'phone' });
    return null;
  }
  const id = uid('call_');
  setDoc(doc(fb.db, C.calls, id), {
    id, chatId, callerId: me.id, calleeIds: [callee], video, status: 'ringing', startedAt: serverTimestamp(),
  }).catch((e) => pushBanner({ title: 'Gagal memulai panggilan', body: fbError(e), icon: 'alert' }));
  const online = isOnline(peer);
  // Push FCM: panggilan masuk berdering juga saat aplikasi ditutup / di luar website
  void fcmPush({
    uids: [callee],
    title: `${peer.name} · panggilan ${video ? 'video' : 'suara'} masuk`,
    body: online ? 'Ketuk untuk menerima panggilan Zeroid.' : 'Sedang offline — buka aplikasi untuk melihat panggilan.',
    kind: 'call',
    chatId,
  });
  if (!online) {
    pushBanner({ title: `${peer.name} sedang offline`, body: 'Panggilan tetap diteruskan + notif dikirim — panggilan akan tersambung saat ia membuka aplikasi.', icon: 'phone' });
    notifyFor(callee, 'call', `Panggilan ${video ? 'video' : 'suara'} dari ${me.name}`, 'Kamu sedang offline — buka aplikasi untuk menelepon balik.', { chatId });
  }
  return id;
}

export function setCallStatus(callId: string, status: Call['status']) {
  const fb = firebase();
  const meId = uid0;
  if (!fb || !meId) return;
  const c = db.calls.find((x) => x.id === callId);
  if (!c) return;
  if (c.status === status) return;
  if (['ended', 'missed', 'declined', 'busy'].includes(c.status) && status !== 'ended') return;
  const patch: any = { status };
  if (status === 'ongoing') patch.connectedAt = Date.now();
  if (['ended', 'missed', 'declined', 'busy'].includes(status)) patch.endedAt = Date.now();
  updateDoc(doc(fb.db, C.calls, callId), patch).catch(() => {});
  if (['ended', 'missed', 'declined', 'busy'].includes(status)) {
    const kind = c.video ? 'Panggilan video' : 'Panggilan suara';
    const text = status === 'ended' && c.connectedAt ? `${kind} · ${fmtDur((Date.now() - c.connectedAt) / 1000)}`
      : status === 'declined' ? `${kind} ditolak` : status === 'busy' ? `${kind} · sibuk` : `${kind} tak terjawab`;
    addDoc(collection(fb.db, C.chats, c.chatId, 'messages'), {
      chatId: c.chatId, senderId: c.callerId, type: 'call', text, clientTime: Date.now(), createdAt: serverTimestamp(),
      deletedFor: [], reactions: {}, starredBy: [],
    }).catch(() => {});
    if (status === 'missed') {
      for (const u of [c.callerId, ...c.calleeIds]) {
        if (u === c.callerId) continue;
        notifyFor(u, 'call', 'Panggilan tak terjawab', `${db.users[c.callerId]?.name ?? 'Seseorang'} · ${kind}`, { chatId: c.chatId });
      }
    }
    // cleanup signaling docs
    cleanupSignals(callId);
  }
}

async function cleanupSignals(callId: string) {
  const fb = firebase();
  if (!fb) return;
  try {
    const sigs = await getDocs(collection(fb.db, C.calls, callId, 'signals'));
    const batch = writeBatch(fb.db);
    sigs.forEach((s) => batch.delete(s.ref));
    await batch.commit();
  } catch {}
}

export const acceptCall = (id: string) => setCallStatus(id, 'ongoing');
export const declineCall = (id: string) => setCallStatus(id, 'declined');
export const endCall = (id: string) => {
  const c = db.calls.find((x) => x.id === id);
  if (!c) return;
  setCallStatus(id, c.status === 'ringing' ? (c.callerId === uid0 ? 'missed' : 'declined') : 'ended');
};

/**
 * Badge "Panggilan N" hilang REAL-TIME begitu tab dibuka: simpan lastCallsSeenAt
 * + tandai notifikasi 'call' sudah dibaca. Dulu badge mentok karena hitungan
 * missed-call 24 jam tidak pernah ditandai terbaca.
 */
export function markCallsSeen() {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  try {
    // optimis: badge hilang detik ini juga
    db.users = { ...db.users, [me.id]: { ...me, lastCallsSeenAt: Date.now() } };
    bump();
    updateDoc(doc(fb.db, C.users, me.id), { lastCallsSeenAt: Date.now() }).catch(() => {});
    // guard n.id: dokumen lama berisi field id:'' yang dulu menimpa id snapshot
    const calls = db.notifications.filter((n) => n.kind === 'call' && !n.read && n.userId === me.id && n.id);
    calls.slice(0, 30).forEach((n) => {
      db.notifications = db.notifications.map((x) => (x.id === n.id ? { ...x, read: true } : x));
      updateDoc(doc(fb.db, C.notifications, n.id), { read: true }).catch(() => {});
    });
    if (calls.length) bump();
  } catch (e) {
    console.warn('markCallsSeen', e); // jangan pernah crash tab Panggilan
  }
}

function watchCalls() {
  const now = Date.now();
  for (const c of db.calls) {
    if (c.status === 'ringing' && now - c.startedAt > 32000) setCallStatus(c.id, 'missed');
  }
}

export function incomingCallFor(meId: string, d: DB = db) {
  return d.calls.find((c) => c.status === 'ringing' && c.calleeIds.includes(meId) && Date.now() - c.startedAt < 32000);
}

// ============================ notifications ============================

export function markNotificationsRead() {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  try {
    const batch = writeBatch(fb.db);
    db.notifications.filter((n) => !n.read && n.id).slice(0, 300).forEach((n) => batch.update(doc(fb.db, C.notifications, n.id), { read: true }));
    batch.commit().catch(() => {});
  } catch (e) {
    console.warn('markNotificationsRead', e);
  }
}

export function clearNotifications() {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  try {
    const batch = writeBatch(fb.db);
    db.notifications.filter((n) => n.userId === me.id && n.id).slice(0, 300).forEach((n) => batch.delete(doc(fb.db, C.notifications, n.id)));
    batch.commit().catch(() => {});
  } catch (e) {
    console.warn('clearNotifications', e);
  }
}

export function deleteNotification(id: string) {
  const fb = firebase();
  if (!fb || !id) return;
  deleteDoc(doc(fb.db, C.notifications, id)).catch(() => {});
}

// ============================ admin ============================

async function audit(action: string, target?: string, detail?: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  addDoc(collection(fb.db, C.audit), { actorId: me.id, actorName: me.name, action, target: target ?? '', detail: detail ?? '', createdAt: serverTimestamp() }).catch(() => {});
}

export const isFullAdmin = (u: User | null) => !!u && (u.role === 'admin' || u.role === 'developer');

/** Apakah akun sedang terkena sanksi (ban permanen / sampai waktu tertentu)? */
export function bannedNow(u: User | null | undefined): boolean {
  if (!u) return false;
  return !!u.banned || (u.suspendedUntil ?? 0) > Date.now() || (u.banUntil ?? 0) > Date.now();
}

/** Sisa waktu ban (ms) — 0 berarti permanen/tidak dibanned. */
export function banRemaining(u: User): number {
  if (u.banned) return 0; // permanen
  const t = Math.max(u.suspendedUntil ?? 0, u.banUntil ?? 0) - Date.now();
  return t > 0 ? t : 0;
}

/**
 * Ban pengguna dengan durasi. durationMs = 0 → permanen.
 * Menulis: users/{uid}.banned|banReason|banUntil + bans/{uid} (buku admin) +
 * hapus appeal lama agar bisa banding ulang setelah di-unban.
 */
export function adminBan(userId: string, reason: string, durationMs: number) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const u = db.users[userId];
  if (!u) return;
  const until = durationMs > 0 ? Date.now() + durationMs : 0;
  const permanent = durationMs <= 0;
  updateDoc(doc(fb.db, C.users, userId), {
    banned: permanent,
    banReason: reason || 'Pelanggaran aturan komunitas',
    suspendedUntil: permanent ? 0 : until,
    banUntil: permanent ? 0 : until,
  }).catch((e) => pushBanner({ title: 'Ban gagal', body: fbError(e), icon: 'alert' }));
  setDoc(doc(fb.db, C.bans, userId), {
    uid: userId, name: u.name, reason: reason || 'Pelanggaran aturan komunitas',
    bannedBy: me.id, bannedByName: me.name, bannedAt: Date.now(), until, active: true,
  }).catch(() => {});
  deleteDoc(doc(fb.db, C.appeals, userId)).catch(() => {});
  audit(permanent ? 'ban' : 'ban_temp', userId, `${reason || '-'} · ${permanent ? 'permanen' : fmtDur(durationMs / 1000)}`);
}

/** Cabut ban + arsipkan catatan. */
export function adminUnban(userId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  updateDoc(doc(fb.db, C.users, userId), { banned: false, banReason: null, suspendedUntil: 0, banUntil: 0 }).catch((e) => pushBanner({ title: 'Unban gagal', body: fbError(e), icon: 'alert' }));
  updateDoc(doc(fb.db, C.bans, userId), { active: false }).catch(() => {});
  audit('unban', userId);
}

/** Pengguna dibanned menulis keterangannya (WhatsApp-style) — sekali per masa ban. */
export async function submitAppeal(message: string): Promise<{ ok: boolean; error?: string }> {
  const me = getMe();
  const fb = firebase();
  const text = message.trim();
  if (!me || !fb) return { ok: false, error: 'Belum masuk.' };
  if (text.length < 10) return { ok: false, error: 'Tulis keterangan minimal 10 karakter.' };
  try {
    await setDoc(doc(fb.db, C.appeals, me.id), {
      uid: me.id, name: me.name, message: text.slice(0, 600),
      status: 'pending', createdAt: Date.now(), updatedAt: Date.now(),
    }, { merge: true });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

/** Admin menyetujui / menolak banding. Setuju = langsung unban. */
export function adminDecideAppeal(appealId: string, approve: boolean, note?: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  updateDoc(doc(fb.db, C.appeals, appealId), {
    status: approve ? 'approved' : 'rejected',
    decidedAt: Date.now(),
    adminNote: (note ?? '').slice(0, 200) || (approve ? 'Bandings diterima — akses dipulihkan.' : 'Keterangan belum cukup untuk pemulihan akses.'),
  }).catch((e) => pushBanner({ title: 'Gagal memproses banding', body: fbError(e), icon: 'alert' }));
  if (approve) adminUnban(appealId);
  const a = db.appeals.find((x) => x.id === appealId);
  if (a) notifyFor(a.uid, 'admin', approve ? 'Banding diterima' : 'Banding ditolak',
    approve ? 'Akses akunmu sudah dipulihkan. Selamat datang kembali!' : 'Keteranganmu belum cukup. Hubungi admin lewat chat global.',
    { chatId: 'c_global' });
  audit(approve ? 'appeal_approve' : 'appeal_reject', appealId, note ?? '');
}

export function myAppeal(uidX: string | undefined): Appeal | undefined {
  return uidX ? db.appeals.find((a) => a.id === uidX) : undefined;
}

// ============================ ban grup & saluran ============================

/**
 * Ban grup/saluran: anggota tidak bisa mengirim pesan dan melihat layar
 * tinjauan berisi alasan dari admin + sisa durasi + form banding.
 * durationMs = 0 → permanen. Admin tetap bisa mengirim pesan sistem.
 */
export function adminBanChat(chatId: string, reason: string, durationMs: number) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const chat = db.chats[chatId];
  if (!chat) return;
  const permanent = durationMs <= 0;
  const until = permanent ? 0 : Date.now() + durationMs;
  const reasonText = reason || 'Melanggar aturan komunitas';
  updateDoc(doc(fb.db, C.chats, chatId), {
    banned: permanent,
    banReason: reasonText,
    banUntil: until,
    banAppeal: null,
  }).catch((e) => pushBanner({ title: 'Ban grup gagal', body: fbError(e), icon: 'alert' }));
  // pesan sistem + notifikasi ke pemilik grup
  sysMsg(chatId, `Grup/saluran "${chat.name ?? chatId}" dibanned oleh admin: ${reasonText}${permanent ? '' : ` — sisa ${fmtDur(durationMs / 1000)}`}`, me.id);
  const owner = db.users[chat.createdBy];
  if (owner) notifyFor(owner.id, 'admin', 'Grup/Saluran dibanned', `${chat.name ?? 'Grup'} dibanned: ${reasonText}. Buka grup untuk menulis banding.`, { chatId });
  audit(permanent ? 'ban_chat' : 'ban_chat_temp', chatId, reasonText);
}

/** Buka ban grup/saluran (setelah tinjauan banding atau langsung). */
export function adminUnbanChat(chatId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const chat = db.chats[chatId];
  updateDoc(doc(fb.db, C.chats, chatId), { banned: false, banReason: null, banUntil: 0 }).catch((e) => pushBanner({ title: 'Unban gagal', body: fbError(e), icon: 'alert' }));
  if (chat) sysMsg(chatId, `Ban pada "${chat.name ?? 'grup'}" dibuka oleh admin. Selamat berkumpul kembali!`, me.id);
  audit('unban_chat', chatId);
}

/** Anggota menulis banding untuk grup/saluran yang dibanned (sekali aktif). */
export async function submitChatAppeal(chatId: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const me = getMe();
  const fb = firebase();
  const text = message.trim();
  if (!me || !fb) return { ok: false, error: 'Belum masuk.' };
  if (text.length < 10) return { ok: false, error: 'Tulis masalah minimal 10 karakter.' };
  const chat = db.chats[chatId];
  if (!chat || !chatBannedNow(chat)) return { ok: false, error: 'Grup ini tidak sedang dibanned.' };
  if (chat.banAppeal?.status === 'pending') return { ok: false, error: 'Banding sudah dikirim — tunggu tinjauan admin.' };
  const appeal: ChatAppeal = {
    message: text.slice(0, 600), by: me.id, byName: me.name,
    status: 'pending', createdAt: Date.now(),
  };
  try {
    await updateDoc(doc(fb.db, C.chats, chatId), { banAppeal: appeal });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

/** Admin memutus banding grup: setuju = unban langsung, tolak = tetap banned. */
export function adminDecideChatAppeal(chatId: string, approve: boolean, note?: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const chat = db.chats[chatId];
  if (!chat?.banAppeal) return;
  const decided: ChatAppeal = {
    ...chat.banAppeal,
    status: approve ? 'approved' : 'rejected',
    decidedAt: Date.now(),
    adminNote: (note ?? '').slice(0, 200) || (approve ? 'Banding diterima — grup dibuka kembali.' : 'Alasan belum cukup kuat untuk membuka ban.'),
  };
  updateDoc(doc(fb.db, C.chats, chatId), { banAppeal: decided }).catch(() => {});
  if (approve) adminUnbanChat(chatId);
  const owner = db.users[chat.createdBy];
  if (owner) notifyFor(owner.id, 'admin', approve ? 'Banding grup diterima' : 'Banding grup ditolak',
    approve ? `${chat.name ?? 'Grup'} sudah dibuka kembali.` : `Banding ${chat.name ?? 'grup'} ditolak: ${decided.adminNote}`,
    { chatId });
  audit(approve ? 'chat_appeal_approve' : 'chat_appeal_reject', chatId, note ?? '');
}

// ============================ centang biru grup & saluran ============================

/** Pasang centang biru grup/saluran dengan masa aktif (hari). days=0 → permanen. */
export function adminVerifyChat(chatId: string, days: number) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const chat = db.chats[chatId];
  if (!chat) return;
  const base = Math.max(Date.now(), chat.verifiedUntil ?? 0);
  updateDoc(doc(fb.db, C.chats, chatId), { verifiedUntil: days > 0 ? base + days * 86400000 : 0, verified: days <= 0 }).catch((e) => pushBanner({ title: 'Gagal', body: fbError(e), icon: 'alert' }));
  // ikon centang biru dirender sebagai SVG oleh MessageBubble (bukan emoji ✅)
  sysMsg(chatId, `"${chat.name ?? 'Grup'}" kini terverifikasi${days > 0 ? ` selama ${days} hari` : ' (permanen)'}.`, me.id, { verified: true });
  audit('verify_chat', chatId, `days=${days}`);
}

/** Cabut centang biru grup/saluran. */
export function adminUnverifyChat(chatId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  updateDoc(doc(fb.db, C.chats, chatId), { verifiedUntil: 0, verified: false }).catch(() => {});
  audit('unverify_chat', chatId);
}

/** Admin membuka batasan AI Anti-Spam lebih cepat. */
export function adminSetMuteOff(userId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  updateDoc(doc(fb.db, C.users, userId), { mutedUntil: 0 }).catch((e) => pushBanner({ title: 'Gagal', body: fbError(e), icon: 'alert' }));
  notifyFor(userId, 'admin', 'Batasan dibuka', 'Admin membuka batasan spam akunmu. Terima kasih sudah berkoordinasi!');
  audit('unmute', userId);
}

export function adminSetRole(userId: string, role: 'user' | 'moderator' | 'admin') {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  updateDoc(doc(fb.db, C.users, userId), { role }).catch(() => {});
  audit('set_role', userId, `role=${role}`);
}

export function adminVerify(userId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  updateDoc(doc(fb.db, C.users, userId), { verified: true }).catch(() => {});
  audit('verify_account', userId);
}

export function adminToggleBlueCheck(userId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const u = db.users[userId];
  updateDoc(doc(fb.db, C.users, userId), { blueCheck: !u?.blueCheck }).catch(() => {});
  audit('toggle_bluecheck', userId, String(!u?.blueCheck));
}

export function adminSetVip(userId: string, days: number) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const u = db.users[userId];
  if (!u) return;
  const base = Math.max(Date.now(), u.vipUntil ?? 0);
  updateDoc(doc(fb.db, C.users, userId), { vipUntil: days > 0 ? base + days * 86400000 : 0 }).catch(() => {});
  audit('set_vip', userId, `days=${days}`);
}

export async function adminBroadcast(title: string, body: string, level: 'info' | 'warning' | 'critical', popup: boolean, days: number) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  try {
    await addDoc(collection(fb.db, C.announcements), {
      title, body, level, popup, createdBy: me.id, createdAt: serverTimestamp(), activeUntil: Date.now() + days * 86400000,
    });
    sysMsg('c_global', `Pengumuman: ${title} — ${body}`, me.id);
    audit('broadcast', undefined, title);
    pushBanner({ title: 'Pengumuman terbit', body: 'Semua pengguna akan melihat banner pengumuman.', icon: 'megaphone' });
  } catch (e: any) {
    pushBanner({ title: 'Gagal', body: fbError(e), icon: 'alert' });
  }
}

export async function adminEndAnnouncement(id: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  updateDoc(doc(fb.db, C.announcements, id), { activeUntil: 0 }).catch(() => {});
  audit('end_announcement', id);
}

export function adminResolveReport(reportId: string, removeMessage: boolean) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const r = db.reports.find((x) => x.id === reportId);
  if (!r) return;
  if (removeMessage) deleteForAll(r.chatId, r.messageId);
  updateDoc(doc(fb.db, C.reports, reportId), { resolved: true }).catch(() => {});
  audit('resolve_report', r.messageId, removeMessage ? 'message removed' : 'dismissed');
}

export function adminDeleteStory(id: string) { deleteStory(id); audit('delete_story', id); }

export function adminToggleMaintenance(enabled: boolean, message?: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || isFullAdmin(me) === false) return;
  setDoc(doc(fb.db, C.config, 'platform'), { maintenance: { enabled, message: message ?? 'Sedang dalam pemeliharaan. Segera kembali.' } }, { merge: true }).catch(() => {});
  audit('maintenance', undefined, enabled ? 'on' : 'off');
}

export function adminDecideOrder(orderId: string, approve: boolean) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || !isFullAdmin(me)) return;
  const o = db.orders.find((x) => x.id === orderId);
  if (!o || o.status !== 'pending' || o.id === '_schema') return;
  const p = productSafe(o.product);
  const batch = writeBatch(fb.db);
  batch.update(doc(fb.db, C.orders, orderId), { status: approve ? 'paid' : 'rejected', decidedAt: Date.now() });
  if (approve) {
    const u = db.users[o.userId];
    if (u) {
      const base = (t?: number) => Math.max(Date.now(), t ?? 0) + o.days * 86400000;
      if (o.product === 'vip') batch.update(doc(fb.db, C.users, o.userId), { vipUntil: base(u.vipUntil) });
      if (o.product === 'member') batch.update(doc(fb.db, C.users, o.userId), { memberUntil: base(u.memberUntil) });
      if (o.product === 'bluecheck') batch.update(doc(fb.db, C.users, o.userId), { blueCheck: true });
      if (o.product === 'security') batch.update(doc(fb.db, C.users, o.userId), { security: true });
    }
    // centang biru untuk GRUP/SALURAN: days=0 → PERMANEN (verified: true)
    if (o.product === 'bluecheck' && o.forChatId) {
      const target = db.chats[o.forChatId];
      if (target) {
        if (o.days > 0) batch.update(doc(fb.db, C.chats, o.forChatId), { verifiedUntil: Math.max(Date.now(), target.verifiedUntil ?? 0) + o.days * 86400000 });
        else batch.update(doc(fb.db, C.chats, o.forChatId), { verified: true, verifiedUntil: 0 });
      }
    }
  }
  batch.commit().catch(() => {});
  notifyFor(o.userId, 'admin', approve ? `${p.title} aktif` : 'Pesanan ditolak',
    approve ? `Pembayaran ${rupiah(o.price)} dikonfirmasi admin. Terima kasih.` : 'Pembayaran belum dapat diverifikasi. Hubungi admin di chat.', { chatId: o.chatId });
  sendMessage(o.chatId, {
    text: approve
      ? `Transaksi dikonfirmasi. ${p.title} (${o.plan}) sudah aktif di profilmu. Terima kasih.`
      : `Maaf, pembayaran untuk ${p.title} belum dapat kami verifikasi. Silakan kirim ulang bukti transfer.`,
  });
  audit('decide_order', orderId, approve ? 'approved' : 'rejected');
}

// ============================ broadcast ke SEMUA user ============================

/**
 * Admin/developer mengirim pesan DM ke SEMUA pengguna sekaligus (satu klik):
 * setiap user dapat chat langsung + notifikasi + push FCM.
 * Batas 60 user per klik biar aman dari kuota — ulangi untuk sisanya.
 */
export async function adminMessageAll(text: string): Promise<{ sent: number; error?: string }> {
  const me = getMe();
  const fb = firebase();
  const body = text.trim();
  if (!me || !fb || !isFullAdmin(me)) return { sent: 0, error: 'Tidak diizinkan.' };
  if (!body) return { sent: 0, error: 'Pesan kosong.' };
  const targets = Object.values(db.users).filter((u) => u.id !== me.id && !u.banned).slice(0, 60);
  let sent = 0;
  for (const u of targets) {
    const cid = openDirect(u.id);
    await sendMessage(cid, { text: body });
    sent++;
  }
  void fcmPush({ topic: 'all', title: `Pesan dari ${me.name}`, body: body.slice(0, 120), kind: 'admin', chatId: 'c_global' });
  audit('message_all', undefined, `${sent} pengguna`);
  pushBanner({ title: 'Broadcast terkirim', body: `Pesan dikirim ke ${sent} pengguna.`, icon: 'megaphone' });
  return { sent };
}

/** Bot Zeroid AI menyebar info update ke chat AI setiap user (satu klik). */
export async function adminBotBroadcast(text: string): Promise<{ sent: number; error?: string }> {
  const me = getMe();
  const fb = firebase();
  const body = text.trim();
  if (!me || !fb || !isFullAdmin(me)) return { sent: 0, error: 'Tidak diizinkan.' };
  if (!body) return { sent: 0, error: 'Pesan kosong.' };
  const targets = Object.values(db.users).filter((u) => !u.banned).slice(0, 60);
  let sent = 0;
  for (const u of targets) {
    const cid = 'ai_' + u.id;
    try {
      await setDoc(doc(fb.db, C.chats, cid), {
        id: cid, type: 'ai', name: 'Zeroid AI', members: [u.id], admins: [u.id], createdBy: u.id,
        createdAt: serverTimestamp(), lastRead: {}, typing: {}, pinnedBy: [], mutedBy: [], archivedBy: [], postPolicy: 'everyone',
      }, { merge: true });
      await addDoc(collection(fb.db, C.chats, cid, 'messages'), {
        chatId: cid, senderId: u.id, type: 'system', text: `Zeroid AI · Update: ${body}`,
        clientTime: Date.now(), createdAt: serverTimestamp(), deletedFor: [], reactions: {}, starredBy: [],
      });
      notifyFor(u.id, 'system', 'Info dari Zeroid AI', body.slice(0, 120));
      sent++;
    } catch {}
  }
  audit('bot_broadcast', undefined, `${sent} pengguna`);
  pushBanner({ title: 'Info bot terkirim', body: `Zeroid AI mengabarkan ${sent} pengguna.`, icon: 'sparkles' });
  return { sent };
}

export const backendMode = isFirebaseConfigured ? `Firebase (${firebaseConfig.projectId || 'terhubung'})` : 'Belum dikonfigurasi';

// ============================ username & contacts ============================

export const normalizeUsername = (s: string) => s.trim().toLowerCase().replace(/^@/, '');
export function usernameError(u: string, selfId?: string): string | null {
  if (!/^[a-z0-9._]{3,20}$/.test(u)) return 'Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.';
  const taken = Object.values(db.users).some((x) => x.id !== selfId && x.username === u);
  if (taken) return `@${u} sudah dipakai.`;
  return null;
}

export async function setUsername(raw: string): Promise<{ ok: boolean; error?: string }> {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return { ok: false };
  const u = normalizeUsername(raw);
  const err = usernameError(u, me.id);
  if (err) return { ok: false, error: err };
  try {
    const ref = doc(fb.db, 'usernames', u);
    const existing = await getDoc(ref);
    if (existing.exists() && existing.data()?.uid !== me.id) return { ok: false, error: `@${u} sudah dipakai.` };
    if (me.username) await deleteDoc(doc(fb.db, 'usernames', me.username)).catch(() => {});
    await setDoc(ref, { uid: me.id });
    updateDoc(doc(fb.db, C.users, me.id), { username: u });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

export function findByUsername(raw: string) {
  const u = normalizeUsername(raw);
  return Object.values(db.users).find((x) => x.username === u && !x.banned && x.id !== uid0);
}

export function addContact(userId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb || userId === me.id) return;
  updateDoc(doc(fb.db, C.users, me.id), { contacts: arrayUnion(userId) }).catch(() => {});
}
export function removeContact(userId: string) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  updateDoc(doc(fb.db, C.users, me.id), { contacts: arrayRemove(userId) }).catch(() => {});
}

// ============================ global message search ============================

export type SearchHit = { chatId: string; message: Message };

/**
 * Search across ALL chats the user is a member of (WhatsApp-style global search).
 * Firestore has no full-text search, so this pulls the newest 200 messages per
 * chat (parallel batches) and filters client-side. Runs on demand, not realtime.
 */
export async function searchAllMessages(raw: string, onProgress?: (found: number, scanned: number) => void): Promise<SearchHit[]> {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return [];
  const q = raw.trim().toLowerCase();
  if (q.length < 2) return [];
  const chats = Object.values(db.chats)
    .filter((c) => isMember(c, me.id) && c.type !== 'ai')
    .sort((a, b) => (b.lastMsg?.createdAt ?? 0) - (a.lastMsg?.createdAt ?? 0));
  const hits: SearchHit[] = [];
  const BATCH = 8;
  for (let i = 0; i < chats.length; i += BATCH) {
    await Promise.all(chats.slice(i, i + BATCH).map(async (c) => {
      try {
        const snap = await getDocs(query(collection(fb.db, C.chats, c.id, 'messages'), orderBy('createdAt', 'desc'), fsLimit(200)));
        for (const d of snap.docs) {
          const m = mapMessage(d.id, d.data());
          if (m.deletedForAll || m.deletedFor.includes(me.id)) continue;
          if (m.type === 'system' || m.type === 'call') continue;
          const hay = `${m.text ?? ''} ${m.fileName ?? ''} ${m.contactName ?? ''} ${m.locationLabel ?? ''}`.toLowerCase();
          if (hay.includes(q)) hits.push({ chatId: c.id, message: m });
        }
      } catch {}
    }));
    onProgress?.(hits.length, Math.min(i + BATCH, chats.length));
  }
  hits.sort((a, b) => b.message.createdAt - a.message.createdAt);
  return hits.slice(0, 80);
}

// ============================ app lock ============================

export function setPin(pin: string | null) {
  updateMe({ pin: pin ? hash(pin) : undefined } as any);
  if (!pin) clearLock();
}
export function unlock(pin: string) {
  const me = getMe();
  if (!me?.pin || me.pin === hash(pin)) {
    locked = false;
    if (isWeb) window.sessionStorage.setItem(LOCK_KEY, '1');
    else AsyncStorage.setItem(LOCK_KEY, '1').catch(() => {});
    bump();
    return true;
  }
  return false;
}
export function clearLock() {
  locked = false;
  if (isWeb) window.sessionStorage.removeItem(LOCK_KEY);
  else AsyncStorage.removeItem(LOCK_KEY).catch(() => {});
  bump();
}

// ============================ OTP via Trigger Email extension ============================

export async function sendOtp(userId: string): Promise<'firebase' | 'unavailable'> {
  const u = db.users[userId];
  const fb = firebase();
  if (!u || !fb) return 'unavailable';
  const code = String(Math.floor(100000 + Math.random() * 900000));
  updateDoc(doc(fb.db, C.users, userId), { otpCode: hash(code), otpExpires: Date.now() + 10 * 60000 }).catch(() => {});
  const via = await sendMail(u.email, 'Kode OTP Zeroid-whatsapp', otpEmailHtml(u.name, code));
  if (via === 'unavailable') {
    pushBanner({ title: 'Email OTP', body: 'Ekstensi Trigger Email belum terpasang — OTP tidak dapat dikirim. Pasang ekstensi di Firebase console (lihat docs/FIREBASE_SETUP.md).', icon: 'alert' });
  }
  return via;
}

export function confirmOtp(userId: string, code: string): { ok: boolean; error?: string } {
  const me = getMe();
  const fb = firebase();
  const u = db.users[userId];
  if (!me || !fb || !u) return { ok: false, error: 'Pengguna tidak ditemukan.' };
  // only the user themself or an admin may confirm
  if (me.id !== userId && !isFullAdmin(me)) return { ok: false, error: 'Tidak diizinkan.' };
  if (!u.otpCode) return { ok: false, error: 'Belum ada OTP yang dikirim.' };
  if ((u.otpExpires ?? 0) < Date.now()) return { ok: false, error: 'OTP kedaluwarsa. Kirim ulang.' };
  if (u.otpCode !== hash(code.trim())) return { ok: false, error: 'Kode OTP salah.' };
  updateDoc(doc(fb.db, C.users, userId), { otpVerified: true, verified: true, otpCode: null, otpExpires: null }).catch(() => {});
  return { ok: true };
}

// ============================ invites ============================

export async function joinByInvite(code: string): Promise<{ ok: boolean; error?: string; chatId?: string }> {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return { ok: false, error: 'Belum masuk.' };
  try {
    const snap = await getDocs(query(collection(fb.db, C.chats), where('inviteCode', '==', code), fsLimit(1)));
    const chat = snap.docs[0];
    if (!chat) return { ok: false, error: 'Link undangan tidak valid.' };
    const data = mapChat(chat.id, chat.data());
    if (data.type !== 'group' && data.type !== 'channel') return { ok: false, error: 'Link undangan tidak valid.' };
    if (!data.members.includes(me.id)) {
      await updateDoc(chat.ref, { members: arrayUnion(me.id) });
      sysMsg(chat.id, `${me.name} bergabung via tautan undangan`, me.id);
    }
    return { ok: true, chatId: chat.id };
  } catch (e: any) {
    return { ok: false, error: fbError(e) };
  }
}

export function regenerateInvite(chatId: string) {
  const fb = firebase();
  if (!fb) return;
  updateDoc(doc(fb.db, C.chats, chatId), { inviteCode: mkInviteCode() }).catch(() => {});
  audit('regenerate_invite', chatId);
}

// ============================ stickers ============================

export function createSticker(uri: string, global = false): Sticker | null {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return null;
  const s: Sticker = { id: uid('st_'), uri, ownerId: me.id, global: global && (isFullAdmin(me)), createdAt: Date.now() };
  addDoc(collection(fb.db, C.stickers), { uri, ownerId: me.id, global: s.global, createdAt: serverTimestamp() }).catch(() => {});
  return s;
}

export function deleteSticker(id: string) {
  const me = getMe();
  const fb = firebase();
  const st = db.stickers.find((x) => x.id === id);
  if (!me || !fb || !st) return;
  if (st.ownerId !== me.id && !isFullAdmin(me)) return;
  deleteDoc(doc(fb.db, C.stickers, id)).catch(() => {});
}

export function stickersFor(userId: string, d: DB = db) {
  return (d.stickers ?? []).filter((s) => s.ownerId === userId || s.global);
}

// ============================ premium orders ============================

// LIMIT PEMBELIAN (anti-spam): maks 5x pencet dalam 1 jam + jeda antar order.
const ORDER_WINDOW = 60 * 60_000; // 1 jam
const ORDER_MAX = 5;

export function orderLimitRemaining(u?: User | null): { left: number; waitMs: number } {
  const now = Date.now();
  const attempts = (u?.orderAttempts ?? []).filter((t) => now - t < ORDER_WINDOW);
  if (attempts.length >= ORDER_MAX) return { left: 0, waitMs: ORDER_WINDOW - (now - Math.min(...attempts)) };
  return { left: ORDER_MAX - attempts.length, waitMs: 0 };
}

/** Apakah product ini sedang aktif di akun? (beli lagi dilarang sampai masa habis) */
export function planActive(k: ProductKey, u?: User | null): boolean {
  if (!u) return false;
  if (k === 'vip') return (u.vipUntil ?? 0) > Date.now();
  if (k === 'member') return (u.memberUntil ?? 0) > Date.now();
  if (k === 'bluecheck') return !!u.blueCheck;
  if (k === 'security') return !!u.security;
  return false;
}

export function createOrder(product: ProductKey, planIdx: number, methodKey: string, forChat?: { id: string; name?: string }): { orderId: string; chatId: string } | { error: string } | null {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return null;
  const p = productOf(product);
  const plan = p.plans[planIdx] ?? p.plans[0];
  // 1) sudah aktif → jangan beli lagi sampai masa habis
  if (!forChat && planActive(product, me)) {
    const until = product === 'vip' ? me.vipUntil : product === 'member' ? me.memberUntil : 0;
    const msg = until ? `sudah aktif hingga ${new Date(until).toLocaleDateString('id-ID')}` : 'sudah aktif (permanen)';
    return { error: `${p.title} kamu ${msg}. Tunggu masa habis sebelum membeli lagi.` };
  }
  // 1b) LIMITED ORDER: satu pesanan aktif per produk — tunggu konfirmasi admin
  //     (atau masa langganan habis) sebelum bisa membeli lagi. Anti-spam order.
  const dupPending = db.orders.find((o) => o.userId === me.id && o.product === product && o.status === 'pending' && o.id !== '_schema');
  if (dupPending) {
    return { error: `Kamu sudah punya pesanan ${p.title} yang masih menunggu konfirmasi admin. Tunggu sampai diputuskan.` };
  }
  // 2) limit 5x per jam + jeda 1 jam antar pembelian
  const { left, waitMs } = orderLimitRemaining(me);
  if (left <= 0) {
    const mins = Math.ceil(waitMs / 60000);
    return { error: `Limit beli tercapai (maks ${ORDER_MAX}x per jam). Coba lagi dalam ${mins} menit.` };
  }
  const method = PAYMENT_METHODS.find((m) => m.key === methodKey) ?? PAYMENT_METHODS[0];
  // find or create the admin direct chat (first admin user)
  const admin = Object.values(db.users).find((u) => u.role === 'admin') ?? Object.values(db.users).find((u) => u.role === 'developer');
  const chatId = admin ? openDirect(admin.id) : openDirect(me.id);
  const orderId = uid('ord_');
  // catat percobaan (untuk limit) — best effort
  updateDoc(doc(fb.db, C.users, me.id), { orderAttempts: [...(me.orderAttempts ?? []).filter((t) => Date.now() - t < ORDER_WINDOW), Date.now()] }).catch(() => {});
  addDoc(collection(fb.db, C.orders), {
    userId: me.id, product, plan: plan.label, price: plan.price, days: plan.days,
    status: 'pending', method: method.label, chatId, createdAt: serverTimestamp(),
    ...(forChat ? { forChatId: forChat.id, forChatName: forChat.name ?? '' } : {}),
  }).catch(() => {});
  if (admin) {
    const label = forChat ? `${p.title} untuk "${forChat.name ?? forChat.id}"` : p.title;
    sendMessage(chatId, { type: 'order', orderId, text: `${label} · ${plan.label} · ${rupiah(plan.price)}` });
    notifyFor(admin.id, 'admin', 'Pesanan baru', `${me.name} memesan ${label} (${rupiah(plan.price)}) via ${method.label}`, { chatId });
  }
  return { orderId, chatId };
}

// ============================ centang biru grup/saluran ============================
// CATATAN: pembelian/patungan centang biru grup & saluran DIHAPUS permanen
// (permintaan pemilik). Centang grup/saluran kini 100% OTOMATIS dari pemilik:
// user/Developer yang punya centang biru di akun → semua grup & saluran
// miliknya ikut terverifikasi lewat chatBadge() — tanpa biaya apa pun.

export const BLUECHECK_POT_TARGET = 49000;

/** Anggota ikut patungan: tambah kontribusi ke pot grup/saluran.
 *  @deprecated fitur patungan dihapus — dipertahankan hanya sebagai no-op agar
 *  pemanggil lama tidak crash. UI-nya sudah tidak ada. */
export async function contributeBlueCheckPot(): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: 'Fitur patungan centang biru sudah dihapus — centang grup/saluran otomatis dari pemilik.' };
}

export const isVip = (u?: User | null) => (u?.vipUntil ?? 0) > Date.now();
export const isMemberPlan = (u?: User | null) => (u?.memberUntil ?? 0) > Date.now();

// ============================ leaderboard (api & koin) ============================

const toLeaderRows = (docs: DocumentData[], key: 'bestStreak' | 'points'): LeaderRow[] =>
  docs
    .map((d) => {
      const v = (d.data() as any) ?? {};
      return {
        id: d.id,
        name: v.name ?? 'Pengguna',
        avatar: v.avatar ?? null,
        score: Number(v[key] ?? 0),
        badge: !!v.blueCheck,
      } as LeaderRow;
    })
    .filter((r) => r.score > 0);

/** Papan peringkat API — streak chat tertinggi sepanjang masa. */
export async function topStreaks(): Promise<LeaderRow[]> {
  const fb = firebase();
  if (!fb) return [];
  try {
    const q1 = query(collection(fb.db, C.users), orderBy('bestStreak', 'desc'), fsLimit(50));
    return toLeaderRows((await getDocs(q1)).docs, 'bestStreak');
  } catch {
    return [];
  }
}

/** Papan peringkat KOIN — pengundang terajin & pemburu reward. */
export async function topKoin(): Promise<LeaderRow[]> {
  const fb = firebase();
  if (!fb) return [];
  try {
    const q1 = query(collection(fb.db, C.users), orderBy('points', 'desc'), fsLimit(50));
    return toLeaderRows((await getDocs(q1)).docs, 'points');
  } catch {
    return [];
  }
}

export type { SpotifyTrack };
