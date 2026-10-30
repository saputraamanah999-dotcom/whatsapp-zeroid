/**
 * Mention engine — @username di grup/global & SW (Status).
 *
 * Fitur:
 * - Ketik "@" di Composer → daftar anggota muncul (saring per nama/username).
 * - "@semua" (alias @all/@everyone/@sini) menyebut SEMUA anggota grup/global.
 * - Mention disimpan di pesan (mentions: [{uid, name}]) supaya highlight tetap
 *   akurat walau username beranti, plus notifikasi realtime ke yang disebut.
 * - Story/SW: caption teks boleh @username → disimpan sebagai daftar uid +
 *   notifikasi ke tiap user yang disebut.
 */
import { MentionRef, User } from './types';

export const MENTION_RE = /@([a-zA-Z0-9._]{1,32})/g;

/** alias "tag semua orang" di grup/global */
export const MENTION_ALL_ALIASES = ['semua', 'all', 'everyone', 'sini'];

export function mentionHandles(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) out.add(m[1].toLowerCase());
  return [...out];
}

/** true kalau teks mengandung @semua / @all / @everyone / @sini */
export function hasMentionAll(text: string): boolean {
  return mentionHandles(text).some((h) => MENTION_ALL_ALIASES.includes(h));
}

export type MentionResolution = {
  /** uid unik yang diberi notifikasi (tanpa pengirim) */
  uids: string[];
  /** referensi utk disimpan di pesan: siapa saja yang disebut */
  refs: MentionRef[];
  /** @semua dipakai → semua anggota disebut */
  all: boolean;
};

/**
 * Resolve teks → daftar target mention.
 * @param candidates user yang BOLEH disebut (anggota grup / semua user di global & SW)
 * @param meId pengirim (tidak menyebut diri sendiri)
 * @param allowAll v17: @semua/@all/@everyone/@sini HANYA untuk admin grup & admin
 *        global — user biasa yang mengetik alias itu diperlakukan teks biasa
 *        (tidak ada lagi tag-all oleh user biasa), mention individu tetap jalan.
 */
export function resolveMentions(text: string, candidates: User[], meId: string, allowAll = true): MentionResolution {
  if (!text || !text.includes('@')) return { uids: [], refs: [], all: false };
  const handles = mentionHandles(text);
  if (!handles.length) return { uids: [], refs: [], all: false };
  const all = allowAll && handles.some((h) => MENTION_ALL_ALIASES.includes(h));
  const byName = new Map<string, User>();
  for (const u of candidates) {
    if (!u || u.id === meId || u.banned) continue;
    if (u.username) byName.set(u.username.toLowerCase(), u);
  }
  if (all) {
    const refs: MentionRef[] = candidates
      .filter((u) => u.id !== meId && !u.banned)
      .slice(0, 50)
      .map((u) => ({ uid: u.id, name: u.username || u.name }));
    return { uids: refs.map((r) => r.uid), refs, all: true };
  }
  const refs: MentionRef[] = [];
  const uids: string[] = [];
  for (const h of handles) {
    if (MENTION_ALL_ALIASES.includes(h)) continue;
    const u = byName.get(h);
    if (u && !uids.includes(u.id)) {
      uids.push(u.id);
      refs.push({ uid: u.id, name: u.username || u.name });
    }
  }
  return { uids, refs, all: false };
}

export type MentionPart = { text: string; uid?: string };

/**
 * Pecah teks jadi bagian biasa & bagian mention (untuk render highlight).
 * Cocokkan token @name dengan daftar mention tersimpan di pesan — aman walau
 * ada teks lain di sekitarnya (URL, titik, emoji).
 */
export function splitMentionParts(text: string, mentions?: MentionRef[] | null): MentionPart[] {
  if (!text) return [];
  if (!mentions || !mentions.length) return [{ text }];
  const byName = new Map<string, string>();
  for (const r of mentions) if (r?.name) byName.set(r.name.toLowerCase(), r.uid);
  const parts: MentionPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const idx = m.index ?? 0;
    const handle = m[1].toLowerCase();
    const uid = byName.get(handle);
    if (!uid) continue;
    if (idx > last) parts.push({ text: text.slice(last, idx) });
    parts.push({ text: m[0], uid });
    last = idx + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}

/** kandidat mention di Composer: anggota grup/global, selalu ada "@semua" di atas */
export function mentionCandidates(chatMembers: string[] | undefined, users: Record<string, User>, query: string, allowAll: boolean): { label: string; sub: string; uid?: string; insert: string; all?: boolean }[] {
  const out: { label: string; sub: string; uid?: string; insert: string; all?: boolean }[] = [];
  if (allowAll) {
    out.push({ label: 'Semua', sub: 'Tag semua anggota (@semua)', insert: 'semua', all: true });
  }
  const q = query.toLowerCase();
  for (const uid of chatMembers ?? []) {
    const u = users[uid];
    if (!u) continue;
    const handle = u.username ?? '';
    if (!handle) continue;
    if (q && !handle.toLowerCase().includes(q) && !u.name.toLowerCase().includes(q)) continue;
    out.push({ label: u.name, sub: `@${handle}`, uid, insert: handle });
    if (out.length >= 7) break;
  }
  return out;
}

/** token @ aktif di posisi kursor → query pencarian (untuk popup saran) */
export function activeMentionQuery(text: string): string | null {
  const m = /(?:^|\s)@([a-zA-Z0-9._]*)$/.exec(text ?? '');
  return m ? m[1] : null;
}

/** ganti token @ yang sedang diketik dengan handle terpilih */
export function applyMention(text: string, insert: string): string {
  return text.replace(/@([a-zA-Z0-9._]*)$/, `@${insert} `);
}
