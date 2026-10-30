/// <reference types="node" />
/**
 * Vercel serverless — unduh APK lewat DOMAIN SENDIRI (tanpa memperlihatkan
 * layanan kode sumber ke pengguna).
 *
 * GET /api/apk-dl
 *  1) URL unduh rilis BERSIFAT TETAP (tidak butuh API apa pun → kebal rate limit).
 *  2) Ikuti sekali dengan redirect:'manual' → dapatkan Location berupa URL CDN
 *     bertanda tangan yang TIDAK memuat alamat repo → alihkan pengguna ke sana
 *     (unduhan langsung dari CDN global, cepat, server kami tidak meneruskan byte).
 *  3) Bila langkah 2 gagal → alihkan ke URL unduh langsung (masih berfungsi).
 *
 * File APK diperbarui otomatis oleh workflow "Build APK Zeroid"
 * (build 2-ABI ARM — jauh lebih ringan dari build universal lama 162MB).
 */
export const config = { runtime: 'nodejs' };
export const maxDuration = 30;

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
const DIRECT_URL = 'https://github.com/saputraamanah999-dotcom/whatsapp-zeroid/releases/download/apk-latest/zeroid-apk-latest.apk';

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // Ikuti 302 rilis secara manual → Location = URL CDN bertanda tangan
  // (signed) yang tidak menamparang alamat repo apa pun.
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(DIRECT_URL, { redirect: 'manual', headers: { 'user-agent': UA } });
    clearTimeout(t);
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc && /^https:\/\//.test(loc)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, loc);
    }
  } catch { /* lanjut fallback */ }

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, DIRECT_URL);
}
