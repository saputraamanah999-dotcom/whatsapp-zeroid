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
  signInWithCredential,
  type User as FBUser,
} from 'firebase/auth';
import {
  doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, where, orderBy, limit as fsLimit,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove, increment, writeBatch, Timestamp, type DocumentData,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppNotification, Call, Chat, ChatAppeal, DB, Message, NotifKind, Story, User, Visibility, Sticker, Order, ProductKey, SpotifyTrack, PlatformConfig, AnimeFav, Ban, Appeal } from './types';
import { productOf, rupiah, PAYMENT_METHODS } from './products';
import { sendMail, otpEmailHtml } from './mail';
import { uid, hash, isEmail, duration as fmtDur } from './format';
import { AVATAR_COLORS, setThemeMode, ThemeMode } from './theme';
import { pushBanner, activeChatId, navRef } from './bus';
import { presentLocal } from './notify';
import { askAI, thinkAI, analyzeImage, AI_PROVIDERS } from './ai';
import { firebase, isFirebaseConfigured, COLLECTIONS as C } from './firebase';

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

type Snapshot = { ready: boolean; db: DB; me: User | null; locked: boolean; config: PlatformConfig | null };

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
  const snap: Snapshot = { ready, db, me, locked, config: db.config };
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
  return { ready, db, me, locked, config: db.config };
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
  return 0;
};

function mapUser(id: string, d: DocumentData): User {
  return {
    id, name: d.name ?? 'Pengguna', email: d.email ?? '', about: d.about ?? '', avatar: d.avatar ?? null,
    banner: d.banner ?? null, bannerType: d.bannerType === 'video' ? 'video' : 'image', color: d.color ?? AVATAR_COLORS[0], phone: d.phone, role: d.role ?? 'user',
    username: d.username, developer: !!d.developer, blueCheck: !!d.blueCheck, vipUntil: ts(d.vipUntil),
    memberUntil: ts(d.memberUntil), security: !!d.security, otpVerified: !!d.otpVerified, pin: d.pin, otpCode: d.otpCode, otpExpires: ts(d.otpExpires),
    spotify: d.spotify ?? null, verified: !!d.verified, banned: !!d.banned, suspendedUntil: ts(d.suspendedUntil),
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
    disappearing: d.disappearing ?? 'off',
  };
}

/** Centang biru grup/saluran aktif? (kadaluarsa otomatis lewat verifiedUntil) */
export function chatVerified(c?: Chat | null): boolean {
  if (!c) return false;
  return !!c.verified || (c.verifiedUntil ?? 0) > Date.now();
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
    expiresAt: ts(d.expiresAt) || undefined, mediaExpiresAt: ts(d.mediaExpiresAt) || undefined, reasoning: d.reasoning,
  };
}

function mapStory(id: string, d: DocumentData): Story {
  return {
    id, userId: d.userId, type: d.type ?? 'text', text: d.text, bg: d.bg, uri: d.uri,
    createdAt: ts(d.createdAt), expiresAt: ts(d.expiresAt), viewers: d.viewers ?? [], likes: d.likes ?? [],
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
  }, (e) => console.warn('chats sub', e)));

  // public discovery: global chat + channels
  chatSubs.push(onSnapshot(query(collection(fb.db, C.chats), where('type', 'in', ['global', 'channel']), fsLimit(100)), (s) => {
    const chats = { ...db.chats };
    s.docChanges().forEach((c) => { chats[c.doc.id] = mapChat(c.doc.id, c.doc.data()); });
    db.chats = chats; bump();
  }, (e) => console.warn('public chats sub', e)));

  // stories (24h)
  storySub = onSnapshot(query(collection(fb.db, C.stories), orderBy('createdAt', 'desc'), fsLimit(200)), (s) => {
    const now = Date.now();
    db.stories = s.docs.map((d) => mapStory(d.id, d.data())).filter((x) => x.expiresAt > now);
    bump();
  }, (e) => console.warn('stories sub', e));

  // my notifications (+ foreground local banners honoring per-user prefs)
  notifSub = onSnapshot(query(collection(fb.db, C.notifications), where('userId', '==', fbUid), orderBy('createdAt', 'desc'), fsLimit(60)), (s) => {
    const prevMax = db.notifications.reduce((mx, n) => Math.max(mx, n.createdAt), 0);
    const next = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AppNotification[];
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

  // incoming calls (ringing) + my recent call history
  callSubs.push(onSnapshot(query(collection(fb.db, C.calls), where('calleeIds', 'array-contains', fbUid), orderBy('startedAt', 'desc'), fsLimit(20)), (s) => {
    const byId = new Map(db.calls.map((c) => [c.id, c]));
    s.docs.forEach((d) => byId.set(d.id, mapCall(d.id, d.data())));
    db.calls = [...byId.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 60);
    bump();
  }, (e) => console.warn('calls-in sub', e)));
  callSubs.push(onSnapshot(query(collection(fb.db, C.calls), where('callerId', '==', fbUid), orderBy('startedAt', 'desc'), fsLimit(20)), (s) => {
    const byId = new Map(db.calls.map((c) => [c.id, c]));
    s.docs.forEach((d) => byId.set(d.id, mapCall(d.id, d.data())));
    db.calls = [...byId.values()].sort((a, b) => b.startedAt - a.startedAt).slice(0, 60);
    bump();
  }, (e) => console.warn('calls-out sub', e)));

  // my stickers + global stickers
  miscSubs.push(onSnapshot(query(collection(fb.db, C.stickers), where('ownerId', '==', fbUid)), (s) => {
    const mine = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Sticker[];
    db.stickers = [...mine, ...db.stickers.filter((x) => x.global)];
    bump();
  }, () => {}));
  miscSubs.push(onSnapshot(query(collection(fb.db, C.stickers), where('global', '==', true), fsLimit(100)), (s) => {
    const globals = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Sticker[];
    db.stickers = [...db.stickers.filter((x) => x.ownerId !== fbUid), ...globals];
    bump();
  }, () => {}));

  // my anime favourites (private, per-user)
  miscSubs.push(onSnapshot(query(collection(fb.db, C.animeFavs), where('uid', '==', fbUid), fsLimit(300)), (s) => {
    db.animeFavs = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as AnimeFav[];
    bump();
  }, () => {}));

  // my appeal (terlihat saat dibanned — status banding realtime)
  miscSubs.push(onSnapshot(doc(fb.db, C.appeals, fbUid), (s) => {
    const a = s.exists() ? ({ id: s.id, ...(s.data() as any) } as Appeal) : null;
    db.appeals = a
      ? [a, ...db.appeals.filter((x) => x.id !== fbUid)]
      : db.appeals.filter((x) => x.id !== fbUid);
    bump();
  }, () => {}));

  // my orders
  miscSubs.push(onSnapshot(query(collection(fb.db, C.orders), where('userId', '==', fbUid), orderBy('createdAt', 'desc'), fsLimit(30)), (s) => {
    const byId = new Map(db.orders.map((o) => [o.id, o]));
    s.docs.forEach((d) => byId.set(d.id, { id: d.id, ...(d.data() as any) }));
    db.orders = [...byId.values()].sort((a: any, b: any) => b.createdAt - a.createdAt);
    bump();
  }, (e) => console.warn('orders sub', e)));

  // announcements + platform config
  miscSubs.push(onSnapshot(query(collection(fb.db, C.announcements), orderBy('createdAt', 'desc'), fsLimit(10)), (s) => {
    db.announcements = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any;
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
      db.reports = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any; bump();
    }, () => {}));
    adminSubs.push(onSnapshot(query(collection(fb.db, C.orders), orderBy('createdAt', 'desc'), fsLimit(60)), (s) => {
      const byId = new Map(db.orders.map((o) => [o.id, o]));
      s.docs.forEach((d) => byId.set(d.id, { id: d.id, ...(d.data() as any) }));
      db.orders = [...byId.values()].sort((a: any, b: any) => b.createdAt - a.createdAt); bump();
    }, () => {}));
    adminSubs.push(onSnapshot(query(collection(fb.db, C.audit), orderBy('createdAt', 'desc'), fsLimit(80)), (s) => {
      db.audit = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any; bump();
    }, () => {}));
    adminSubs.push(onSnapshot(query(collection(fb.db, C.appeals), orderBy('createdAt', 'desc'), fsLimit(100)), (s) => {
      db.appeals = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any; bump();
    }, (e) => console.warn('appeals sub', e)));
    adminSubs.push(onSnapshot(query(collection(fb.db, C.bans), orderBy('bannedAt', 'desc'), fsLimit(100)), (s) => {
      db.bans = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any; bump();
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
      await setDoc(ref, {
        name: u.displayName ?? u.email?.split('@')[0] ?? 'Pengguna', email: u.email ?? '',
        about: 'Hai! Aku pakai Zeroid-whatsapp.', avatar: u.photoURL ?? null, color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        role: 'user', verified: u.emailVerified, banned: false, lastSeen: serverTimestamp(), createdAt: serverTimestamp(),
        privacy: { lastSeen: 'everyone', profilePhoto: 'everyone', about: 'everyone', groups: 'everyone', readReceipts: true, storyReplies: true },
        notif: { messages: true, groups: true, stories: true, calls: true, preview: true, sound: true },
        blocked: [], contacts: [],
      }).catch(() => {});
    }
    if (snap && snap.exists() && (snap.data() as any).banned) {
      // JANGAN sign-out: pengguna dibanned tetap masuk supaya bisa melihat
      // BannedScreen (alasan + sisa durasi + form banding ala WhatsApp).
      ready = true; bump();
      return;
    }
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

export function unreadCount(chat: Chat, meId: string) {
  const lr = chat.lastRead[meId] ?? 0;
  const now = Date.now();
  return (db.messages[chat.id] ?? []).filter((m) => m.createdAt > lr && m.senderId !== meId && m.type !== 'system' && !m.deletedFor.includes(meId) && !(m.expiresAt && m.expiresAt < now)).length;
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
    case 'image': return `Foto${m.text ? ` · ${m.text}` : ''}`;
    case 'video': return `Video${m.text ? ` · ${m.text}` : ''}`;
    case 'audio': return `Pesan suara${m.duration ? ` (${fmtDur(m.duration)})` : ''}`;
    case 'document': return m.fileName ?? 'Dokumen';
    case 'sticker': return 'Stiker';
    case 'location': return 'Lokasi';
    case 'contact': return `Kontak: ${m.contactName ?? ''}`;
    case 'order': return m.text ?? 'Pesanan';
    case 'call': return m.text ?? 'Panggilan';
    default: return m.text ?? '';
  }
}

function notifyFor(userId: string, kind: NotifKind, title: string, body: string, extra: Partial<AppNotification> = {}) {
  const fb = firebase();
  if (!fb || !userId) return;
  addDoc(collection(fb.db, C.notifications), clean({ id: '', userId, kind, title, body, createdAt: serverTimestamp(), read: false, ...extra })).catch(() => {});
}

// ============================ auth ============================

function fbError(e: any): string {
  const c = String(e?.code ?? '');
  if (c.includes('email-already-in-use')) return 'Email sudah terdaftar.';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Email atau password salah.';
  if (c.includes('weak-password')) return 'Password terlalu lemah (minimal 6 karakter).';
  if (c.includes('too-many-requests')) return 'Terlalu banyak percobaan. Coba lagi nanti.';
  if (c.includes('invalid-email')) return 'Format email tidak valid.';
  if (c.includes('network')) return 'Tidak ada koneksi internet.';
  if (c.includes('operation-not-allowed')) return 'Metode masuk ini belum diaktifkan di Firebase console.';
  if (c.includes('requires-recent-login')) return 'Sesi sudah lama. Keluar lalu masuk kembali, dan ulangi tindakan ini.';
  if (c.includes('permission-denied') || c.includes('insufficient permissions'))
    return 'Server menolak aksi ini (izin Firestore). Admin perlu mempublikasikan Rules v4 terbaru di Firebase Console.';
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
    if (Platform.OS === 'web') await signInWithPopup(fb.auth, provider);
    else {
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
export function updateMe(patch: Updatable) {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  // strip protected fields defensively (rules also enforce this)
  const safe: any = { ...patch };
  delete safe.role; delete safe.banned; delete safe.vipUntil; delete safe.memberUntil;
  delete safe.blueCheck; delete safe.verified; delete safe.developer;
  updateDoc(doc(fb.db, C.users, me.id), safe).catch((e) => pushBanner({ title: 'Gagal menyimpan', body: fbError(e), icon: 'alert' }));
  if (fb.auth.currentUser && (patch.name || patch.avatar !== undefined)) {
    fbUpdateProfile(fb.auth.currentUser, {
      displayName: patch.name ?? me.name,
      photoURL: patch.avatar && /^https?:/.test(patch.avatar) ? patch.avatar : fb.auth.currentUser.photoURL,
    }).catch(() => {});
  }
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

function sysMsg(chatId: string, text: string, senderId: string) {
  const fb = firebase();
  if (!fb) return;
  addDoc(collection(fb.db, C.chats, chatId, 'messages'), {
    chatId, senderId, type: 'system', text, clientTime: Date.now(), createdAt: serverTimestamp(),
    deletedFor: [], reactions: {}, starredBy: [],
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
  updateDoc(doc(fb.db, C.chats, chatId), { [flag]: arr.includes(me.id) ? arrayRemove(me.id) : arrayUnion(me.id) }).catch(() => {});
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
  if (!me || !fb || Date.now() - lastTypingWrite < 2500) return;
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
  return Object.entries(chat.typing ?? {}).filter(([u, t]) => u !== meId && (t as number) > 0 && Date.now() - (t as number) < 4000).map(([u]) => u);
}

// ============================ messages ============================

export type OutMsg = Partial<Pick<Message, 'type' | 'text' | 'uri' | 'fileName' | 'fileSize' | 'duration' | 'mime' | 'width' | 'height' | 'thumb' | 'storagePath' | 'replyTo' | 'forwarded' | 'orderId' | 'assistant' | 'lat' | 'lng' | 'locationLabel' | 'contactName' | 'contactPhone' | 'reasoning' | 'mediaExpiresAt'>>;

/** disappearing-message TTL in ms for a chat, or 0 when off */
export const disappearingMs = (c?: Chat | null): number =>
  c?.disappearing === '24h' ? 24 * 3600000 : c?.disappearing === '7d' ? 7 * 86400000 : c?.disappearing === '90d' ? 90 * 86400000 : 0;

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
  const ref = doc(collection(fb.db, C.chats, chatId, 'messages'));
  const ttl = disappearingMs(chat);
  const local: Message = {
    id: ref.id, chatId, senderId: sender, type: payload.type ?? 'text', text: payload.text?.trim() || undefined,
    uri: payload.uri, fileName: payload.fileName, fileSize: payload.fileSize, duration: payload.duration,
    mime: payload.mime, width: payload.width, height: payload.height, thumb: payload.thumb,
    storagePath: payload.storagePath, replyTo: payload.replyTo, forwarded: payload.forwarded, orderId: payload.orderId, assistant: payload.assistant,
    lat: payload.lat, lng: payload.lng, locationLabel: payload.locationLabel, contactName: payload.contactName, contactPhone: payload.contactPhone,
    reasoning: payload.reasoning, expiresAt: ttl ? Date.now() + ttl : undefined, mediaExpiresAt: payload.mediaExpiresAt,
    createdAt: Date.now(), deletedFor: [], reactions: {}, starredBy: [], status: 'sending',
  };
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
    clientTime: local.createdAt, createdAt: serverTimestamp(),
    deletedFor: [], reactions: {}, starredBy: [],
  };
  try {
    await setDoc(ref, clean(persist));
    // denormalised preview + clear my typing
    const pv = messagePreview({ ...local, status: undefined } as Message);
    updateDoc(doc(fb.db, C.chats, chatId), { lastMsg: { text: pv.slice(0, 120), type: local.type, senderId: sender, createdAt: local.createdAt }, [`typing.${sender}`]: 0 }).catch(() => {});
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
  setDoc(ref, clean({
    chatId, senderId: me.id, type: m.type, text: m.text, uri: m.uri, fileName: m.fileName, fileSize: m.fileSize,
    duration: m.duration, mime: m.mime, width: m.width, height: m.height, thumb: m.thumb, storagePath: m.storagePath,
    replyTo: m.replyTo, forwarded: m.forwarded, lat: m.lat ?? null, lng: m.lng ?? null, locationLabel: m.locationLabel ?? null,
    contactName: m.contactName ?? null, contactPhone: m.contactPhone ?? null, expiresAt: m.expiresAt ?? null,
    mediaExpiresAt: m.mediaExpiresAt ?? null,
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
  addDoc(collection(fb.db, C.stories), {
    userId: me.id, type: s.type, text: s.text ?? null, bg: s.bg ?? null, uri: s.uri ?? null,
    createdAt: serverTimestamp(), expiresAt: Date.now() + 24 * 3600000, viewers: [], likes: [],
  }).catch((e) => pushBanner({ title: 'Gagal mengirim Story', body: fbError(e), icon: 'alert' }));
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
  const batch = writeBatch(fb.db);
  db.notifications.filter((n) => !n.read).slice(0, 300).forEach((n) => batch.update(doc(fb.db, C.notifications, n.id), { read: true }));
  batch.commit().catch(() => {});
}

export function clearNotifications() {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return;
  const batch = writeBatch(fb.db);
  db.notifications.filter((n) => n.userId === me.id).slice(0, 300).forEach((n) => batch.delete(doc(fb.db, C.notifications, n.id)));
  batch.commit().catch(() => {});
}

export function deleteNotification(id: string) {
  const fb = firebase();
  if (!fb) return;
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
  sysMsg(chatId, `✅ "${chat.name ?? 'Grup'}" kini terverifikasi${days > 0 ? ` selama ${days} hari` : ' (permanen)'}.`, me.id);
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
  if (!o || o.status !== 'pending') return;
  const p = productOf(o.product);
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
    // centang biru untuk GRUP/SALURAN: pasang verifiedUntil = now + days (kadaluarsa otomatis)
    if (o.product === 'bluecheck' && o.forChatId) {
      const target = db.chats[o.forChatId];
      if (target) batch.update(doc(fb.db, C.chats, o.forChatId), { verifiedUntil: Math.max(Date.now(), target.verifiedUntil ?? 0) + o.days * 86400000 });
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

export const backendMode = isFirebaseConfigured ? 'Firebase (projekwhattsaf)' : 'Belum dikonfigurasi';

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

export function createOrder(product: ProductKey, planIdx: number, methodKey: string, forChat?: { id: string; name?: string }): { orderId: string; chatId: string } | null {
  const me = getMe();
  const fb = firebase();
  if (!me || !fb) return null;
  const p = productOf(product);
  const plan = p.plans[planIdx] ?? p.plans[0];
  const method = PAYMENT_METHODS.find((m) => m.key === methodKey) ?? PAYMENT_METHODS[0];
  // find or create the admin direct chat (first admin user)
  const admin = Object.values(db.users).find((u) => u.role === 'admin') ?? Object.values(db.users).find((u) => u.role === 'developer');
  const chatId = admin ? openDirect(admin.id) : openDirect(me.id);
  const orderId = uid('ord_');
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

export const isVip = (u?: User | null) => (u?.vipUntil ?? 0) > Date.now();
export const isMemberPlan = (u?: User | null) => (u?.memberUntil ?? 0) > Date.now();
export type { SpotifyTrack };
