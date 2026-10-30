/**
 * STIKER BRAT — dibuat LOKAL di perangkat (tanpa endpoint/server).
 * Gaya Brat PUTIH (sesuai permintaan): latar putih bersih, teks lowercase tebal warna hitam.
 * LAYOUT ASLI BRAT (ala brat generator): teks RATA KIRI-ATAS di sudut — BUKAN di
 * tengah. Teks kecil di pojok kiri atas persis seperti contoh aslinya.
 *  - Web   : HTML5 Canvas → PNG data URL (paling kompatibel untuk dikirim).
 *  - Native: SVG data URL (expo-image menampilkan SVG; kualitas tajam di ukuran apa pun).
 * Selalu berhasil — tidak ada lagi stiker kosong karena endpoint mati.
 */
import { Platform } from 'react-native';

const BG = '#FFFFFF'; // PUTIH polos — gaya brat putih (bukan hijau asam lagi)
const FG = '#111111';
const PAD = 34;       // jarak teks dari tepi kiri & atas (gaya brat asli)

function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur.length) lines.push(cur);
  return lines.slice(0, 9);
}

function bratSvg(text: string): string {
  const lines = wrapWords(text, 11);
  const n = Math.max(1, lines.length);
  // teks besar untuk teks pendek (1-2 kata), mengecil otomatis untuk teks panjang
  const fontSize = Math.max(30, Math.min(120, Math.round(444 / Math.max(2.6, n * 0.85))));
  const lh = Math.round(fontSize * 1.12);
  const tspans = lines
    .map((l, i) => `<tspan x="${PAD}" y="${Math.round(PAD + fontSize * 0.82 + i * lh)}">${l
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</tspan>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="${BG}"/>` +
    `<text font-family="'Arial','Helvetica Neue',Helvetica,sans-serif" font-weight="bold" font-size="${fontSize}" fill="${FG}" text-anchor="start">${tspans}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function bratCanvasPng(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 512;
      const ctx = cv.getContext('2d');
      if (!ctx) return reject(new Error('canvas tidak tersedia'));
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = FG;
      // RATA KIRI-ATAS — teks mulai dari pojok kiri atas (gaya brat asli),
      // BUKAN di tengah lagi.
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      // pilih ukuran font: mulai besar, kecilkan sampai semua baris muat
      let size = 116;
      let lines: string[] = [];
      for (; size >= 26; size -= 4) {
        ctx.font = `bold ${size}px Arial,'Helvetica Neue',Helvetica,sans-serif`;
        const maxChars = Math.max(5, Math.floor(448 / (size * 0.55)));
        lines = wrapWords(text, maxChars);
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        if (widest <= 448 && PAD + size * 0.82 + (lines.length - 1) * size * 1.12 <= 478) break;
      }
      ctx.font = `bold ${size}px Arial,'Helvetica Neue',Helvetica,sans-serif`;
      const lh = size * 1.12;
      lines.forEach((l, i) => ctx.fillText(l, PAD, Math.round(PAD + size * 0.82 + i * lh)));
      resolve(cv.toDataURL('image/png'));
    } catch (e) {
      reject(e);
    }
  });
}

/** Stiker Brat LOKAL — selalu menghasilkan gambar (PNG di web, SVG di native). */
export async function bratStickerLocal(text: string): Promise<string> {
  const clean = (text || '').toLowerCase().trim().slice(0, 120);
  if (!clean) throw new Error('Teks kosong');
  if (Platform.OS === 'web') {
    try { return await bratCanvasPng(clean); } catch { return bratSvg(clean); }
  }
  return bratSvg(clean);
}
