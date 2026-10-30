/**
 * MD — format teks ala WhatsApp di dalam pesan (**tebal**, *miring*, _miring_,
 * ~~coret~~, `kode`). Dulu: tanda bintang tampil mentah "asal ada" di tengah
 * teks; kini dirender sebagai gaya sungguhan, juga aman jika penanda tidak
 * tertutup (ditampilkan polos).
 *
 * Parser kecil tanpa dependensi — token = potongan teks + gaya.
 */

export type MdStyle = { b?: boolean; i?: boolean; s?: boolean; code?: boolean };
export type MdToken = { text: string; style: MdStyle };

const RULE = /(\*\*([\s\S]+?)\*\*)|(__([\s\S]+?)__)|(\*([^*\n]+?)\*)|((?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9]))|(~~([\s\S]+?)~~)|(`([^`\n]+?)`)/g;

function pushMerged(out: MdToken[], text: string, style: MdStyle) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && JSON.stringify(last.style) === JSON.stringify(style)) last.text += text;
  else out.push({ text, style });
}

/** Tokenisasi teks ber-markdown; penanda tak tertutup tetap tampil apa adanya. */
export function parseMd(input: string): MdToken[] {
  const text = String(input ?? '');
  if (!text) return [];
  // jalan cepat: tanpa karakter penanda → satu token polos
  if (!/[*_~`]/.test(text)) return [{ text, style: {} }];
  const out: MdToken[] = [];
  let lastIdx = 0;
  RULE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RULE.exec(text))) {
    if (m.index > lastIdx) pushMerged(out, text.slice(lastIdx, m.index), {});
    if (m[1]) pushMerged(out, m[2], { b: true });
    else if (m[3]) pushMerged(out, m[4], { b: true });
    else if (m[5]) pushMerged(out, m[6], { i: true });
    else if (m[7]) pushMerged(out, m[8], { i: true });
    else if (m[9]) pushMerged(out, m[10], { s: true });
    else if (m[11]) pushMerged(out, m[12], { code: true });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) pushMerged(out, text.slice(lastIdx), {});
  return out.length ? out : [{ text, style: {} }];
}

/** Ada format di teks ini? (dipakai untuk memilih renderer) */
export function hasMd(input: string): boolean {
  return /(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(\*[^*\n]+\*)|((^|[^A-Za-z0-9])_[^_\n]+_([^A-Za-z0-9]|$))|(~~[\s\S]+~~)|(`[^`\n]+`)/.test(String(input ?? ''));
}
