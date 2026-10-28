/**
 * Supabase client helpers (tanpa dependency supabase-js — cukup fetch REST).
 *
 * Dipakai untuk:
 *  - uploadDirect(): file BESAR (video/audio/dokumen) diunggah LANGSUNG dari
 *    perangkat ke Supabase Storage → URL publik PERMANEN. Ini solusi utama
 *    masalah "media hilang": litterbox/tmpfiles hanya 72 jam/1 jam, sedangkan
 *    Supabase Storage milik project sendiri dan tidak pernah kadaluarsa.
 *  - bratSticker(): buat stiker BRAT lewat proxy server /api/sylvatica
 *    (kunci Sylvatica aman di server).
 *
 * Env yang dipakai:
 *  - EXPO_PUBLIC_SUPABASE_URL      (public, aman)
 *  - EXPO_PUBLIC_SUPABASE_ANON_KEY (public by design, dilindungi policy bucket)
 */
import { proxyGet } from './proxy';

const SB_URL = String(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
const SB_ANON = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '');
export const SB_BUCKET = 'zeroid';

export const isSupabaseConfigured = /^https:\/\//.test(SB_URL) && SB_ANON.length > 20;

export type UploadDirectResult = { url: string; path: string; expiresAt?: number };

/**
 * Upload langsung ke Supabase Storage (anon, policy bucket mengizinkan insert).
 * @returns null bila Supabase tidak dikonfigurasi / gagal → pemanggil lanjut ke host fallback.
 */
export async function uploadDirect(
  blob: Blob,
  name: string,
  mime: string,
  onProgress?: (pct: number) => void,
  ms = 600000
): Promise<UploadDirectResult | null> {
  if (!isSupabaseConfigured) return null;
  const safe = name.replace(/[^\w.\-() ]/g, '_').slice(0, 80) || 'file';
  const path = `${SB_BUCKET}/files/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  return await new Promise<UploadDirectResult | null>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SB_URL}/storage/v1/object/${path}`);
    xhr.timeout = ms;
    xhr.setRequestHeader('apikey', SB_ANON);
    xhr.setRequestHeader('authorization', `Bearer ${SB_ANON}`);
    xhr.setRequestHeader('content-type', mime || 'application/octet-stream');
    xhr.upload.onprogress = (e) => { if (onProgress && e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / Math.max(1, e.total)) * 100))); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve({ url: `${SB_URL}/storage/v1/object/public/${path}`, path });
      } else resolve(null); // biarkan pemanggil lanjut ke host fallback
    };
    xhr.onerror = () => resolve(null);
    xhr.ontimeout = () => resolve(null);
    xhr.send(blob);
  });
}

export type BratResult = { url?: string; dataUrl?: string };

/** Buat stiker Brat dari teks via server proxy (kunci Sylvatica di server). */
export async function bratSticker(text: string, ms = 45000): Promise<BratResult> {
  const r = await proxyGet(
    `/api/sylvatica?action=brat&text=${encodeURIComponent(text.slice(0, 90))}`, ms
  );
  if (r.ok && (r.data?.url || r.data?.dataUrl)) return { url: r.data.url, dataUrl: r.data.dataUrl };
  throw new Error(r.data?.error ?? `Gagal membuat stiker (HTTP ${r.status}).`);
}

export type TikTokResult = { nowm?: string; wm?: string; mp3?: string; cover?: string; title?: string; author?: string };

/** Unduh TikTok tanpa watermark via server proxy. */
export async function tiktokDownload(url: string, ms = 55000): Promise<TikTokResult> {
  const r = await proxyGet(
    `/api/sylvatica?action=tiktok&url=${encodeURIComponent(url)}`, ms
  );
  if (r.ok && (r.data?.nowm || r.data?.wm || r.data?.mp3)) return r.data as TikTokResult;
  throw new Error(r.data?.error ?? `Gagal mengunduh TikTok (HTTP ${r.status}).`);
}
