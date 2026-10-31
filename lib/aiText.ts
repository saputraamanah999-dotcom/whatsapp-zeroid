/**
 * Pembersih teks AI — ZERID WhatsApp (BAGIAN 5: metadata internal tidak boleh
 * tampil ke pengguna).
 *
 * Beberapa model upstream kadang membocorkan format internal alat, mis.:
 *   :::writing{variant="chat_message" ...}\nIsi jawaban\n:::
 *   <think>penalaran internal</think>Isi jawaban
 *   [TOOL_CALL]{...} / {"variant":"chat_message", ...}
 *
 * Fungsi ini MENGHAPUS pembungkus metadatanya TANPA menghapus isi jawaban yang
 * sebenarnya (aturan: jangan buang konten asli). Murni fungsi teks — dipakai
 * di server (api/ai.ts) maupun klien (render pesan lama yang masih mengandung
 * metadata).
 */

const BOT_UID = 'zeroid-bot';

/** Ambil isi jawaban dari dalam metadata pseudo-JSON (key="value" / key: value). */
function extractInner(jsonish: string): string {
  // 1) coba JSON betul-betul valid
  try {
    const obj = JSON.parse(`{${jsonish}}`);
    const cand = obj?.content ?? obj?.text ?? obj?.message ?? '';
    if (typeof cand === 'string' && cand.trim()) return cand.trim();
  } catch { /* pseudo-JSON — lanjut regex */ }
  // 2) pseudo-JSON: content="…" / content: "…" / text=… / message=…
  const m = jsonish.match(/\b(?:content|text|message)\s*[:=]\s*("|'|`)((?:[^\\]|\\.)*?)\1/i);
  if (m?.[2]) {
    return m[2]
      .replace(/\\n/g, '\n').replace(/\\r/g, '')
      .replace(/\\t/g, '\t').replace(/\\(.)/g, '$1')
      .trim();
  }
  return '';
}

/** Hapus SATU blok `:::tag{...}` — kembalikan [teks setelah pembuka, sisa string]. */
function eatDirective(src: string, start: number): { inner: string; next: number } {
  // src[start..] dimulai dengan ":::"; temukan "{" lalu tutup kurung seimbang
  const brace = src.indexOf('{', start);
  if (brace === -1) return { inner: '', next: start + 3 };
  let depth = 0;
  let inStr: string | null = null;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const extracted = extractInner(src.slice(brace + 1, i));
        // posisi setelah "}" — buang penutup ":::" bila tersedia
        let j = i + 1;
        const tail = src.slice(j, j + 12);
        const closeM = tail.match(/^\s*:::/);
        if (closeM) j += closeM[0].length;
        return { inner: extracted, next: j };
      }
    }
  }
  return { inner: '', next: src.length };
}

/** Bersihkan metadata internal dari teks AI tanpa menghapus jawabannya. */
export function cleanAiText(input: string): string {
  let t = String(input ?? '');
  if (!t) return '';
  let changed = false;

  // 1) <think>…</think> — penalaran internal DeepSeek tidak untuk pengguna
  const thinkRe = /<think>[\s\S]*?<\/think>/gi;
  if (thinkRe.test(t)) { t = t.replace(thinkRe, ''); changed = true; }
  // <think> tanpa penutup (terpotong) sampai akhir — buang semuanya
  const thinkOpen = /<think>[\s\S]*$/i;
  if (thinkOpen.test(t)) { t = t.replace(thinkOpen, ''); changed = true; }

  // 2) Direktif :::tag{...} (writing/social_post/…)
  const dirRe = /:::\s*[A-Za-z_-]+\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = dirRe.exec(t))) {
    const { inner, next } = eatDirective(t, m.index);
    const before = t.slice(0, m.index);
    const after = t.slice(next);
    // sisipkan kembali isi yang diekstrak (bila ada) — jawaban tidak boleh hilang
    t = (inner ? `${before}${before && !before.endsWith('\n') ? '\n' : ''}${inner}\n` : before) + after;
    changed = true;
    dirRe.lastIndex = 0; // string berubah — mulai lagi
    if (t.length > 200000) break; // pengaman
  }

  // 3) Penutup ::: yang yatim (baris tersendiri) — buang
  if (/^\s*:::\s*$/m.test(t)) { t = t.replace(/^\s*:::\s*$/gm, ''); changed = true; }

  // 4) Penanda tool-call internal umum di awal jawaban (penutup ] opsional)
  if (/^\s*\[(?:TOOL_CALL|FUNCTION_CALL|INST|SYSTEM)\b/i.test(t)) {
    t = t.replace(/^\s*\[(?:TOOL_CALL|FUNCTION_CALL|INST|SYSTEM)\b[^\n]*(?:\n|$)/i, '');
    changed = true;
  }

  // 5) Rapikan spasi berlebih hasil penghapusan (maks 2 baris kosong)
  if (changed) {
    t = t.replace(/\n{3,}/g, '\n\n').trim();
    // kalau sampai habis (semua isi ternyata hanya metadata), jangan kirim kosong —
    // penelepon memutuskan fallback-nya
  }
  return t;
}

/** Apakah teks ini milik bot/assistant (perlu dibersihkan saat render)? */
export function isAiText(m: { assistant?: boolean | null; senderId?: string | null }): boolean {
  return !!m.assistant || m.senderId === BOT_UID;
}
