/**
 * ZEROID BOT HOST — otak bot "Zeroid Bot" (zeroid-bot).
 *
 * SIAPA YANG MENJALANKAN: hanya perangkat ADMIN DEVELOPER (role developer/admin)
 * yang sedang online. Admin Developer memasukkan bot ke grup/saluran mana pun;
 * dari perangkat admin, host ini mendengarkan chat yang beranggotakan bot dan
 * membalas secara real-time.
 *
 * ATURAN BALASAN (anti-spam):
 *  - chat pribadi dengan bot            → semua pesan dijawab;
 *  - grup/saluran/global                → hanya bila pesan menyebut @zeroidbot / @zeroid / "bot";
 *  - jeda minimal 6 detik per chat, maks 4 balasan/menit per chat, maks 30/menit global;
 *  - typing indicator "Zeroid Bot" muncul real-time saat bot mikir.
 *
 * Pesan bot ditulis DENGAN senderId=zeroid-bot — diizinkan rules v16 khusus
 * untuk admin global (penulis admin + senderId bot + bot benar-benar anggota).
 */
import React, { useEffect } from 'react';
import {
  collection, doc, onSnapshot, query, where, orderBy, limit as fsLimit,
  setDoc, updateDoc, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { firebase, COLLECTIONS as C } from '../lib/firebase';
import { useStore, getMe, getDB, BOT_UID, isFullAdmin } from '../lib/store';
import { askAI } from '../lib/ai';

const MENTION_RE = /(^|\s)@?(zeroidbot|zeroid\s?bot|zeroid)\b/i;
const PER_CHAT_GAP_MS = 6000;
const PER_CHAT_WINDOW = 4;  // balasan per menit per chat
const GLOBAL_WINDOW = 30;   // balasan per menit global

let messageUnsubs = new Map<string, () => void>();
let lastReplyAt = new Map<string, number>();
let perMinute = new Map<string, number[]>();
let globalStamps: number[] = [];
let bootedAt = Date.now();

function underLimits(chatId: string): boolean {
  const now = Date.now();
  const last = lastReplyAt.get(chatId) ?? 0;
  if (now - last < PER_CHAT_GAP_MS) return false;
  const pm = (perMinute.get(chatId) ?? []).filter((t) => now - t < 60_000);
  if (pm.length >= PER_CHAT_WINDOW) return false;
  globalStamps = globalStamps.filter((t) => now - t < 60_000);
  if (globalStamps.length >= GLOBAL_WINDOW) return false;
  return true;
}

function stamp(chatId: string) {
  const now = Date.now();
  lastReplyAt.set(chatId, now);
  perMinute.set(chatId, [...(perMinute.get(chatId) ?? []).filter((t) => now - t < 60_000), now]);
  globalStamps = [...globalStamps.filter((t) => now - t < 60_000), now];
}

async function setBotTyping(chatId: string, on: boolean) {
  const fb = firebase();
  const chatDoc = (getDB().chats as any)?.[chatId];
  if (!fb || !chatDoc) return;
  const typing = { ...(chatDoc.typing ?? {}), [BOT_UID]: on ? Date.now() : 0 };
  updateDoc(doc(fb.db, C.chats, chatId), { typing }).catch(() => {});
}

async function sendBotMessage(chatId: string, text: string, reasoning?: string) {
  const fb = firebase();
  if (!fb) return;
  const ref = doc(collection(fb.db, C.chats, chatId, 'messages'));
  const now = Date.now();
  await setDoc(ref, {
    chatId,
    senderId: BOT_UID,
    type: 'text',
    text: text.slice(0, 4000),
    reasoning: reasoning?.slice(0, 4000) ?? null,
    assistant: false,
    bubble: 'default',
    clientTime: now,
    createdAt: serverTimestamp(),
    deletedFor: [],
    reactions: {},
    starredBy: [],
    viewOnce: false,
    viewedBy: [],
    mentions: [],
    mentionsAll: false,
  });
  const pv = text.slice(0, 120);
  updateDoc(doc(fb.db, C.chats, chatId), {
    lastMsg: { text: pv, type: 'text', senderId: BOT_UID, createdAt: now },
  }).catch(() => {});
}

async function replyIn(chatId: string, history: { role: 'user' | 'assistant'; content: string }[], prompt: string, chatName: string) {
  stamp(chatId);
  void setBotTyping(chatId, true);
  try {
    const r = await askAI(prompt, {
      history,
      sessionId: `bot_${chatId}`,
      aiName: 'Zeroid Bot',
      aiBio: 'Bot resmi ZEROID WhatsApp (SAPUTRA || DEV WEBSITE). Ramah, ringkas, bahasa pengguna. Kalau diminta fitur/error, sarankan kirim masukan lewat menu Masukan & Bantuan.',
    });
    await sendBotMessage(chatId, r.text, r.reasoning);
  } catch {
    await sendBotMessage(chatId, 'Aku lagi nggak bisa jawab sekarang. Coba beberapa saat lagi ya 🙏').catch(() => {});
  } finally {
    void setBotTyping(chatId, false);
  }
}

function wireChatMessages(chatId: string) {
  if (messageUnsubs.has(chatId)) return;
  const fb = firebase();
  if (!fb) return;
  const q = query(collection(fb.db, C.chats, chatId, 'messages'), orderBy('createdAt', 'desc'), fsLimit(6));
  let first = true;
  const unsub = onSnapshot(q, (s) => {
    // lewati snapshot pertama (riwayat lama) supaya bot tidak membalas pesan lama
    if (first) { first = false; return; }
    const me = getMe();
    if (!me || !isFullAdmin(me)) return;
    const chatDoc = (getDB().chats as any)?.[chatId];
    if (!chatDoc || !(chatDoc.members ?? []).includes(BOT_UID)) return;
    for (const ch of s.docChanges()) {
      if (ch.type !== 'added') continue;
      const d = ch.doc.data() as any;
      const sid = String(d.senderId ?? '');
      const created = typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : Number(d.createdAt ?? d.clientTime ?? 0);
      if (!created || created < bootedAt - 5000) continue;          // pesan lama → abaikan
      if (sid === BOT_UID) continue;                                // pesan bot sendiri
      if (d.type === 'system' || d.type === 'call') continue;
      const text = String(d.text ?? '').trim();
      if (!text) continue;
      const isDirectWithBot = chatDoc.type === 'direct' && (chatDoc.members ?? []).length === 2;
      const mentioned = MENTION_RE.test(text);
      if (!isDirectWithBot && !mentioned) continue;
      if (!underLimits(chatId)) continue;
      const hist = s.docs
        .filter((x) => x.id !== ch.doc.id)
        .slice(0, 6)
        .map((x) => {
          const v = x.data() as any;
          const who = String(v.senderId ?? '') === BOT_UID ? 'assistant' : 'user';
          return { role: who as 'user' | 'assistant', content: String(v.text ?? '').slice(0, 300) };
        })
        .filter((h) => h.content)
        .reverse();
      const who = getDB().users[sid]?.name ?? 'Seseorang';
      const place = chatDoc.name ? `grup "${chatDoc.name}"` : 'chat';
      void replyIn(chatId, hist, `[Di ${place}, ${who} menulis]: ${text}`, String(chatDoc.name ?? ''));
      break; // satu balasan per snapshot
    }
  }, () => {});
  messageUnsubs.set(chatId, unsub);
}

export default function BotHost() {
  const { me } = useStore();
  useStore() as any; // ikut re-render saat db berubah (chat bot baru)

  useEffect(() => {
    if (!me || !isFullAdmin(me)) return;
    bootedAt = Date.now();
    const fb = firebase();
    if (!fb) return;
    // semua chat yang beranggotakan bot (real-time; admin Developer boleh list chats)
    const qb = query(collection(fb.db, C.chats), where('members', 'array-contains', BOT_UID), fsLimit(200));
    const unsubChats = onSnapshot(qb, (s) => {
      const ids = new Set(s.docs.map((d) => d.id));
      // pasang listener pesan untuk chat bot; lepas untuk chat yang bot-nya keluar
      ids.forEach((id) => wireChatMessages(id));
      messageUnsubs.forEach((unsub, id) => {
        if (!ids.has(id)) { try { unsub(); } catch {} messageUnsubs.delete(id); }
      });
    }, () => {});
    // AUTO-SEED: pastikan profil BOT ada (admin Developer boleh membuat users/zeroid-bot
    // lewat rules v16) — tanpa ini nama bot tidak muncul di balon chat.
    getDoc(doc(fb.db, C.users, BOT_UID))
      .then((snap) => {
        if (!snap.exists()) {
          setDoc(doc(fb.db, C.users, BOT_UID), {
            name: 'Zeroid Bot',
            email: 'bot@zeroid.app',
            about: 'Bot resmi ZEROID WhatsApp (SAPUTRA || DEV WEBSITE). Sebut @zeroid di grup/saluran untuk mengajakku bicara!',
            avatar: null,
            color: '#7B61FF',
            bot: true,
            verified: true,
            createdAt: Date.now(),
            lastSeen: Date.now(),
          }).catch(() => {});
          setDoc(doc(fb.db, 'usernames', 'zeroidbot'), { uid: BOT_UID }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      try { unsubChats(); } catch {}
      messageUnsubs.forEach((u) => { try { u(); } catch {} });
      messageUnsubs = new Map();
    };
  }, [me?.id, me?.role]);

  return null;
}
