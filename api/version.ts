/**
 * Vercel serverless — ENDPOINT SISTEM (3 aksi dalam 1 fungsi, hemat kuota
 * fungsi Vercel Hobby yang berbatas 12 per deployment).
 *
 * 1) GET /api/version
 *    Info versi yang LIVE di deployment ini (VERCEL_GIT_COMMIT_SHA disuntikkan
 *    otomatis oleh Git integration) — untuk menjawab "web masih lama?".
 *
 * 2) GET /api/version?action=apk-info
 *    Info APK terbaru untuk halaman /apk: { version, sizeMB, updated }.
 *    Sumber: halaman rilis (HTML publik) — TIDAK memakai api.github.com sehingga
 *    kebal rate limit IP. Di-cache 5 menit. Nama layanan kode sumber TIDAK
 *    PERNAH dikirim ke klien: halaman web hanya melihat domain sendiri.
 *
 * 3) GET /api/version?action=apk-dl
 *    Unduh APK lewat DOMAIN SENDIRI (tanpa memperlihatkan layanan kode sumber):
 *    ikuti sekali redirect:'manual' → dapatkan Location berupa URL CDN bertanda
 *    tangan yang TIDAK memuat alamat repo → alihkan pengguna ke sana (unduhan
 *    langsung dari CDN global, cepat, server kami tidak meneruskan byte).
 *    File APK diperbarui otomatis oleh workflow "Build APK Zeroid" (2-ABI ARM).
 */
export const config = { runtime: 'nodejs' };
export const maxDuration = 30;

// ---------------- APK helpers ----------------

const APK_UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36';
const APK_TAG_PAGE = 'https://github.com/saputraamanah999-dotcom/whatsapp-zeroid/releases/tag/apk-latest';
const APK_ASSETS_PAGE = 'https://github.com/saputraamanah999-dotcom/whatsapp-zeroid/releases/expanded_assets/apk-latest';
const APK_ASSET = 'zeroid-apk-latest.apk';
const APK_DIRECT_URL = `https://github.com/saputraamanah999-dotcom/whatsapp-zeroid/releases/download/apk-latest/${APK_ASSET}`;

type ApkInfo = { version: string; sizeMB: number; updated: string; at: number };
let apkCache: ApkInfo | null = null;
const APK_TTL = 5 * 60 * 1000;

async function getHtml(url: string, ms = 9000): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { headers: { 'user-agent': APK_UA }, signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

async function apkInfo(): Promise<ApkInfo | null> {
  if (apkCache && Date.now() - apkCache.at <= APK_TTL) return apkCache;
  const [tag, assets] = await Promise.all([getHtml(APK_TAG_PAGE), getHtml(APK_ASSETS_PAGE)]);
  if (!tag && !assets) return apkCache; // kedua sumber gagal → pakai cache lama

  let version = '';
  if (tag) {
    const m = tag.match(/Release\s+Zeroid APK\s+([0-9][0-9.]*)/i);
    if (m) version = m[1];
  }
  let sizeMB = 0;
  let updated = '';
  if (assets && assets.includes(APK_ASSET)) {
    const sizeM = assets.match(new RegExp(`${APK_ASSET}[\\s\\S]{0,2000}?([0-9.]+)\\s*(MB|GB)`, 'i'));
    if (sizeM) {
      const n = parseFloat(sizeM[1]);
      sizeMB = /gb/i.test(sizeM[2]) ? Math.round(n * 1024 * 10) / 10 : Math.round(n * 10) / 10;
    }
    const dt = assets.match(/datetime="([0-9T:.Z-]+)"/);
    if (dt) updated = dt[1];
  }
  if (!version && !sizeMB) return apkCache;
  apkCache = { version, sizeMB, updated, at: Date.now() };
  return apkCache;
}

async function handleApkInfo(res: any) {
  const info = await apkInfo();
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=1800');
  return res.status(200).json({
    ok: true,
    app: 'Zeroid WhatsApp',
    ready: true, // optimis — tombol unduh tetap aktif walau cek gagal
    version: info?.version ?? '',
    sizeMB: info?.sizeMB ?? 0,
    updated: info?.updated ?? '',
    download: '/api/version?action=apk-dl',
  });
}

async function handleApkDownload(res: any) {
  // Ikuti 302 rilis secara manual → Location = URL CDN bertanda tangan (signed)
  // yang tidak menamparang alamat repo apa pun.
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch(APK_DIRECT_URL, { redirect: 'manual', headers: { 'user-agent': APK_UA } });
    clearTimeout(t);
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc && /^https:\/\//.test(loc)) {
      res.setHeader('Cache-Control', 'no-store');
      return res.redirect(302, loc);
    }
  } catch { /* lanjut fallback */ }

  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, APK_DIRECT_URL);
}

// ---------------- handler utama ----------------

export default async function handler(req: any, res: any) {
  const action = String(req?.query?.action ?? '');

  if (action === 'apk-info') {
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    return handleApkInfo(res);
  }
  if (action === 'apk-dl') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.status(405).json({ ok: false, error: 'Method not allowed' });
    return handleApkDownload(res);
  }

  // default: info versi deployment (perilaku lama, tidak berubah)
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    ok: true,
    service: 'zeroid-whatsapp',
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commitMsg: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    deployedAt: process.env.VERCEL_DEPLOYMENT_CREATED_AT ?? null,
    buildStamp: '2026-10-28-ronde-supabase-brat-banchat',
    env: {
      jere: !!process.env.JEREXD_APIKEY,
      imgbb: !!process.env.IMGBB_KEY,
      sylvatica: !!process.env.SYLVATICA_APIKEY,
      supabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
  });
}
