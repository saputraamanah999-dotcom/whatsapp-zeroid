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

export type ViolationKind = 'porn' | 'sticker_spam' | 'media_bomb';

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

  // 1) konten 18+: teks langsung, caption media, maupun isi tautan
  const textHit = pornHit(msg.text ?? '');
  if (textHit) return textHit;
  if (msg.type === 'image' || msg.type === 'video' || msg.type === 'sticker') {
    const cap = pornHit(msg.fileName ?? '');
    if (cap) return cap;
  }

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
