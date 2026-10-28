/**
 * Central client for the server-side proxies (/api/ai, /api/jere).
 * The Jerexd API key NEVER lives in the client — the browser/app only talks
 * to our own serverless functions.
 *
 * Base URL resolution:
 *  1. EXPO_PUBLIC_API_BASE env (e.g. https://zeroid-anda.vercel.app) — wajib
 *     untuk build Android/APK dan untuk hosting web yang BUKAN deployment
 *     Vercel yang sama dengan folder api/.
 *  2. Kalau tidak diset: di web dipakai path relatif (same-origin) — cocok
 *     untuk deployment Vercel tempat folder api/ ikut ter-deploy.
 *  3. Di native (APK) tanpa EXPO_PUBLIC_API_BASE → error jelas, bukan gagam.
 */
import { Platform } from 'react-native';

const RAW_BASE = String(process.env.EXPO_PUBLIC_API_BASE ?? '').trim();
export const API_BASE = RAW_BASE.replace(/\/+$/, '');

export function proxyUrl(path: string): string {
  if (API_BASE) return `${API_BASE}${path}`;
  if (Platform.OS === 'web') return path;
  throw new Error(
    'Untuk aplikasi Android/APK, layanan AI/Musik/Anime butuh alamat server. ' +
      'Isi EXPO_PUBLIC_API_BASE di file .env (contoh: https://zeroid-anda.vercel.app) lalu build ulang APK.'
  );
}

function timeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, clear: () => clearTimeout(t) };
}

/** Map a fetch failure / HTTP status into a message the user can act on. */
async function failMessage(res: Response | null, e: any): Promise<Error> {
  if (res) {
    const data = await res.json().catch(() => null);
    const detail = String(data?.error ?? '').slice(0, 200);
    if (res.status === 404)
      return new Error(
        detail ||
          'Server proxy /api tidak ditemukan (404). Deploy project ke Vercel (folder api/ ikut ter-deploy) atau set EXPO_PUBLIC_API_BASE ke URL deployment Vercel Anda.'
      );
    if (res.status === 503)
      return new Error(detail || 'Layanan belum dikonfigurasi di server (kunci API belum diset).');
    if (res.status === 429)
      return new Error(detail || 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.');
    return new Error(detail || `Server error (HTTP ${res.status}).`);
  }
  if (e?.name === 'AbortError') return new Error('Waktu tunggu server habis. Coba lagi.');
  return new Error(
    'Tidak dapat menghubungi server proxy. Periksa koneksi internet, pastikan deployment Vercel aktif, atau set EXPO_PUBLIC_API_BASE dengan benar.'
  );
}

/** POST JSON ke proxy dengan penanganan error yang bisa dipahami pengguna. */
export async function proxyPost<T = any>(path: string, body: any, ms = 45000): Promise<T> {
  const { signal, clear } = timeout(ms);
  try {
    const res = await fetch(proxyUrl(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    if (!res.ok) throw await failMessage(res, null);
    const data = (await res.json().catch(() => null)) as T;
    if (data == null) throw new Error('Respons server tidak valid.');
    return data;
  } catch (e: any) {
    if (e instanceof Error && e.message && !/Network request failed|Failed to fetch/i.test(e.message)) throw e;
    throw await failMessage(null, e);
  } finally {
    clear();
  }
}

/** GET JSON ke proxy (dipakai untuk health check). Returns { ok, status, data }. */
export async function proxyGet(path: string, ms = 10000): Promise<{ ok: boolean; status: number; data: any }> {
  const { signal, clear } = timeout(ms);
  try {
    const res = await fetch(proxyUrl(path), { method: 'GET', signal });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } finally {
    clear();
  }
}
