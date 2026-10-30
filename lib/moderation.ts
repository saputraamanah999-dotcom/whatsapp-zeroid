/**
 * AI GUARD — moderasi otomatis konten grup/saluran/global (ala WhatsApp).
 *
 * Deteksi berjalan di klien setiap anggota saat pesan baru masuk:
 *  - konten 18+ / porno (teks, caption media, domain terkenal)
 *  - spam stiker (>= 8 stiker dalam 90 detik oleh pengirim sama)
 *  - bom media (>= 15 media dalam 60 detik oleh pengirim sama)
 *
 * Hasil deteksi dipakai store.ts untuk MENANGGUHKAN grup otomatis
 * ("Grup ini ditangguhkan" ala WhatsApp) + mencatat PELANGGAR (nama +
 * username) lewat pesan sistem & modOffense — supaya developer bisa
 * langsung mengeksekusi ban ke akun yang mengirim.
 *
 * Modul ini MURNI (tanpa efek samping) supaya gampang dites & tidak
 * circular-import dengan store.ts.
 */
import { Message } from './types';

export type ViolationKind = 'porn' | 'profanity' | 'sticker_spam' | 'media_bomb' | 'virtex';

export type Violation = {
  kind: ViolationKind;
  /** alasan teknis untuk modOffense / banReason (prefix [AUTO] ditambah pemanggil) */
  reason: string;
  /** label pendek ramah user untuk pesan sistem & UI */
  label: string;
};

/** kata kunci keras konten porno / 18+ (ID + EN) — cukup 1 kena = pelanggaran berat */
const PORN_WORDS = [
  'bokep', 'porn', 'porno', 'pornhub', 'xvideos', 'xnxx', 'xhamster', 'xxx',
  'ngentot', 'bugil', 'telanjang', 'memek', 'kontol', 'titit', 'toket',
  'ngefuck', 'gocrot', 'colmek', 'jilboob', 'hentai', 'onlyfans', 'nudes',
  'nude', 'pns syur', 'video syur', 'foto syur', 'seks', 'sex video', 'sex link',
  'jitufilthy', 'situs sex', 'situs bokep', 'link bokep', 'film bokep', 'video bokep',
  'abg smp', 'abg sma', 'meiden', 'jav hd', 'jilbab syur', 'tante syur',
];

/** domain terkenal — muncul di link = pelanggaran berat */
const PORN_DOMAINS = [
  'pornhub.com', 'xvideos.com', 'xnxx.com', 'xhamster.com', 'onlyfans.com',
  'redtube.com', 'youporn.com', 'tokopedia-sex', 'hentaistream', 'bokepid',
  'bokepxspot', 'colmek', 'ngentot', 'dewasalink', 'sexvideo', 'xxxvideo',
];

function norm(s: string): string {
  return s.toLowerCase().replace(/[0134578]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b' }[c] ?? c)).replace(/[^a-z0-9.\/\s]/g, ' ').replace(/\s+/g, ' ');
}

/** Deteksi konten 18+ pada satu teks (pesan / caption). Null = bersih. */
export function pornHit(raw: string): Violation | null {
  if (!raw) return null;
  const t = norm(raw);
  for (const d of PORN_DOMAINS) if (t.includes(d)) return { kind: 'porn', reason: `tautan/konten 18+ (${d})`, label: 'konten 18+' };
  for (const w of PORN_WORDS) {
    if (w.includes(' ') ? t.includes(w) : new RegExp(`(^| )${w}( |$)`).test(t)) {
      return { kind: 'porn', reason: 'konten 18+/porno terdeteksi', label: 'konten 18+' };
    }
  }
  return null;
}

/*
 * ANTI-BUG / VIRTEX (v21 — permintaan user: "anti bug crash … orang yang nge
 * virtex … langsung delete dan kena pelanggaran buat usernya").
 * Virtex = bom karakter raksasa/berulang/karakter kendali tak terlihat yang
 * membuat aplikasi penerima lag, overflow, atau crash.
 */
export const VIRTEX_MAX_LEN = 2600;      // ambang pesan dianggap virtex
const ZWSP = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g; // zero-width & bidi

/**
 * Deteksi virtex / bom karakter pada satu teks. Null = aman.
 * Heuristik server-friendly (dipakai ulang di api/ai.ts sebagai salinan ringkas):
 *  - panjang >= 2600 karakter, ATAU
 *  - karakter kendali tak terlihat >= 40, ATAU
 *  - satu karakter sama berulang >= 180 kali, ATAU
 *  - satu baris tanpa spasi >= 900 karakter (dump HEX/junk panjang).
 */
export function virtexHit(raw: string): Violation | null {
  const t = String(raw ?? '');
  if (!t) return null;
  if (t.length >= VIRTEX_MAX_LEN) return { kind: 'virtex', reason: `teks raksasa (${t.length} karakter)`, label: 'virtext/bom teks' };
  const ctrl = t.match(ZWSP);
  if (ctrl && ctrl.length >= 40) return { kind: 'virtex', reason: `karakter kendali tersembunyi (${ctrl.length})`, label: 'karakter perusak' };
  const run = t.match(/(.)\1{179,}/s);
  if (run) return { kind: 'virtex', reason: `karakter berulang raksasa (${run[0].length}x "${run[1]}")`, label: 'spam karakter' };
  for (const line of t.split('\n')) {
    if (line.replace(/\s/g, '').length >= 900) return { kind: 'virtex', reason: 'baris dump tanpa spasi raksasa', label: 'dump teks' };
  }
  return null;
}

/** kata kasar (ID + EN) — AI Guard skill: ban berjam-jam otomatis */
const PROFANITY_WORDS = [
  'anjing', 'bajingan', 'bangsat', 'bangke', 'bego', 'bodoh', 'brengsek', 'goblok',
  'tolol', 'idiot', 'kampret', 'kontol', 'memek', 'ngentot', 'pepek', 'pantek',
  'tetek', 'titit', 'asu', 'sundala', 'fuck', 'fucking', 'bitch', 'asshole', 'bastard', 'dickhead',
];

/** Deteksi kata kasar pada satu teks. Null = bersih. */
export function profanityHit(raw: string): Violation | null {
  if (!raw) return null;
  const t = norm(raw);
  for (const w of PROFANITY_WORDS) {
    if (new RegExp(`(^| )${w}( |$)`).test(t)) {
      return { kind: 'profanity', reason: 'kata kasar terdeteksi', label: 'kata kasar' };
    }
  }
  return null;
}

/** Pesan yang dianggap "media" untuk penghitungan spam (stiker/gambar/video). */
function isMedia(m: Message): boolean {
  return m.type === 'sticker' || m.type === 'image' || m.type === 'video';
}

/**
 * Deteksi pelanggaran untuk pesan yang BARU MASUK di grup.
 * `recent` = pesan-pesan sebelumnya di chat yang sama (sudah terurut).
 * Hanya dipanggil untuk chat group / channel / global, pesan non-sistem.
 */
export function detectViolation(msg: Message, recent: Message[]): Violation | null {
  if (msg.type === 'system' || msg.assistant) return null;

  // 0) VIRTEX / BOM KARAKTER (anti bug crash) — dicek paling awal supaya
  //    aplikasi penerima tidak sempat menggambar teks raksasanya
  const vx = virtexHit(msg.text ?? '');
  if (vx) return vx;

  // 1) konten 18+: teks langsung, caption media, maupun isi tautan
  const textHit = pornHit(msg.text ?? '');
  if (textHit) return textHit;
  if (msg.type === 'image' || msg.type === 'video' || msg.type === 'sticker') {
    const cap = pornHit(msg.fileName ?? '');
    if (cap) return cap;
  }

  // 1b) kata kasar (AI Guard skill) — teks pesan biasa
  const prof = profanityHit(msg.text ?? '');
  if (prof) return prof;

  // 2) spam stiker: >= 8 stiker dalam 90 detik oleh pengirim sama
  const now = msg.createdAt || Date.now();
  const same = recent.filter((m) => m.senderId === msg.senderId && !m.deletedForAll);
  if (msg.type === 'sticker') {
    const wins = same.filter((m) => m.type === 'sticker' && now - m.createdAt < 90_000);
    if (wins.length + 1 >= 8) {
      return { kind: 'sticker_spam', reason: 'spam stiker berlebihan', label: 'spam stiker' };
    }
  }

  // 3) bom media: >= 15 media dalam 60 detik oleh pengirim sama
  if (isMedia(msg)) {
    const wins = same.filter((m) => isMedia(m) && now - m.createdAt < 60_000);
    if (wins.length + 1 >= 15) {
      return { kind: 'media_bomb', reason: 'bom media (gambar/video beruntun)', label: 'bom media' };
    }
  }
  return null;
}
