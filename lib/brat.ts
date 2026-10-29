/**
 * STIKER BRAT — dibuat LOKAL di perangkat (tanpa endpoint/server).
 * Gaya sampul Brat: latar hijau asam, teks lowercase tebal warna hitam.
 *  - Web   : HTML5 Canvas → PNG data URL (paling kompatibel untuk dikirim).
 *  - Native: SVG data URL (expo-image menampilkan SVG; kualitas tajam di ukuran apa pun).
 * Selalu berhasil — tidak ada lagi stiker kosong karena endpoint mati.
 */
import { Platform } from 'react-native';

const BG = '#8ACE00'; // hijau asam khas brat
const FG = '#111111';

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
  const lines = wrapWords(text, 9);
  const n = Math.max(1, lines.length);
  const fontSize = Math.max(34, Math.min(92, Math.round(340 / Math.max(2.2, n * 0.62))));
  const lh = Math.round(fontSize * 1.16);
  const startY = 256 - ((n - 1) * lh) / 2 + fontSize * 0.34;
  const tspans = lines
    .map((l, i) => `<tspan x="256" y="${Math.round(startY + i * lh)}">${l
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</tspan>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" fill="${BG}"/>` +
    `<text font-family="'Arial Black','Helvetica Neue',Arial,sans-serif" font-weight="900" font-size="${fontSize}" fill="${FG}" text-anchor="middle">${tspans}</text>` +
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
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // pilih ukuran font: mulai besar, kecilkan sampai semua baris muat
      let size = 88;
      let lines: string[] = [];
      for (; size >= 30; size -= 4) {
        ctx.font = `900 ${size}px 'Arial Black','Helvetica Neue',Arial,sans-serif`;
        const maxChars = Math.max(5, Math.floor(452 / (size * 0.62)));
        lines = wrapWords(text, maxChars);
        const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
        if (widest <= 452 && lines.length * size * 1.18 <= 470) break;
      }
      ctx.font = `900 ${size}px 'Arial Black','Helvetica Neue',Arial,sans-serif`;
      const lh = size * 1.18;
      const startY = 256 - ((lines.length - 1) * lh) / 2;
      lines.forEach((l, i) => ctx.fillText(l, 256, startY + i * lh));
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
