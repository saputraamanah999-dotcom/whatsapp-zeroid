/// <reference types="node" />
/**
 * Vercel serverless — info APK terbaru untuk halaman /apk.html.
 *
 * GET /api/apk/latest
 * → { ok, ready, version, sizeMB, updated, download: '/api/apk/download' }
 *
 * Sumber: halaman rilis (HTML publik) — TIDAK memakai api.github.com sehingga
 * kebal rate limit IP. Di-cache 5 menit. Nama layanan kode sumber TIDAK PERNAH
 * dikirim ke klien: halaman web hanya melihat domain sendiri.
 */
export const config = { runtime: 'nodejs' };
export const maxDuration = 30;

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
const TAG_PAGE = 'https://github.com/saputraamanah999-dotcom/whatsapp-zeroid/releases/tag/apk-latest';
const ASSETS_PAGE = 'https://github.com/saputraamanah999-dotcom/whatsapp-zeroid/releases/expanded_assets/apk-latest';
const ASSET = 'zeroid-apk-latest.apk';

type Info = { version: string; sizeMB: number; updated: string; at: number };
let cache: Info | null = null;
const TTL = 5 * 60 * 1000;

async function get(url: string, ms = 9000): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

async function fetchInfo(): Promise<Info | null> {
  const [tag, assets] = await Promise.all([get(TAG_PAGE), get(ASSETS_PAGE)]);
  if (!tag && !assets) return cache; // kedua sumber gagal → pakai cache lama

  let version = '';
  if (tag) {
    const m = tag.match(/Release\s+Zeroid APK\s+([0-9][0-9.]*)/i) ?? tag.match(/<title>Release\s+[^<]*?([0-9]+\.[0-9]+\.[0-9]+)/i);
    if (m) version = m[1];
  }
  let sizeMB = 0;
  let updated = '';
  if (assets && assets.includes(ASSET)) {
    const sizeM = assets.match(new RegExp(`${ASSET}[\\s\\S]{0,2000}?([0-9.]+)\\s*(MB|GB)`, 'i'))
      ?? assets.match(/([0-9.]+)\s*(MB|GB)/i);
    if (sizeM) {
      const n = parseFloat(sizeM[1]);
      sizeMB = /gb/i.test(sizeM[2]) ? Math.round(n * 1024 * 10) / 10 : Math.round(n * 10) / 10;
    }
    const dt = assets.match(/datetime="([0-9T:.Z-]+)"/);
    if (dt) updated = dt[1];
  }
  if (!version && !sizeMB) return cache;
  return { version, sizeMB, updated, at: Date.now() };
}

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!cache || Date.now() - cache.at > TTL) {
    const fresh = await fetchInfo();
    if (fresh) cache = fresh;
  }
  const info = cache;

  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800');
  return res.status(200).json({
    ok: true,
    app: 'Zeroid WhatsApp',
    ready: true, // optimis — tombol unduh tetap aktif walau cek gagal
    version: info?.version ?? '',
    sizeMB: info?.sizeMB ?? 0,
    updated: info?.updated ?? '',
    download: '/api/apk/download',
  });
}
