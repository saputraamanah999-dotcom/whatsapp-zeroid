/**
 * EMOJI GAYA iPHONE — stiker Brat & tempat lain harus menampilkan emoji Apple,
 * bukan emoji Android (permintaan user: "emojinya harus iPhone").
 *
 * Sumber gambar: paket npm `emoji-datasource-apple` lewat CDN jsDelivr —
 * file PNG 64px per kode titik Unicode (mis. 1f600.png), CORS terbuka.
 * Fallback otomatis: bila URL dengan fe0f gagal, dicoba tanpa fe0f.
 */

const EMOJI_CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64';

function codepoints(char: string): string {
  const cps: string[] = [];
  for (const cp of Array.from(char)) cps.push(cp.codePointAt(0)!.toString(16));
  return cps.join('-');
}

/** URL gambar emoji gaya Apple untuk SATU karakter emoji. */
export function appleEmojiUrl(char: string): string {
  return `${EMOJI_CDN}/${codepoints(char)}.png`;
}

/** URL alternatif (tanpa fe0f) — dipakai saat utama gagal dimuat. */
export function appleEmojiUrlAlt(char: string): string | null {
  const cps = Array.from(char)
    .map((c) => c.codePointAt(0)!.toString(16))
    .filter((c) => c !== 'fe0f');
  const joined = cps.join('-');
  if (joined === codepoints(char)) return null;
  return `${EMOJI_CDN}/${joined}.png`;
}

export type EmojiSegment = { kind: 'text'; value: string } | { kind: 'emoji'; value: string };

// Regex emoji modern (\p{Extended_Pictographic}) — Hermes & browser modern mendukung.
// Dibangun sekali; bila runtime menolak, fallback ke daftar rentang manual.
let EMOJI_RE: RegExp | null = null;
try {
  EMOJI_RE = new RegExp(
    '(\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])*)',
    'gu'
  );
} catch {
  EMOJI_RE = null;
}
const EMOJI_RE_FALLBACK =
  /([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]+)/gu;

/** Pecah teks jadi segmen teks vs emoji (urut, tanpa kehilangan isi). */
export function splitEmojiSegments(text: string): EmojiSegment[] {
  if (!text) return [];
  const re = EMOJI_RE ?? EMOJI_RE_FALLBACK;
  const out: EmojiSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: 'text', value: text.slice(last, i) });
    out.push({ kind: 'emoji', value: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

/** true bila string mengandung minimal satu emoji. */
export function hasEmoji(text: string): boolean {
  return splitEmojiSegments(text).some((s) => s.kind === 'emoji');
}
