/// <reference types="node" />
/**
 * Vercel serverless proxy — Sylvatica (https://sylvatica.my.id).
 * SYLVATICA_APIKEY hanya di server; kunci tidak pernah dikirim ke client.
 *
 * Actions:
 *  - brat    : buat stiker BRAT dari teks → PNG. Gambar diunggah ke Supabase
 *              Storage (URL PERMANEN) bila tersedia; fallback = data URL base64.
 *              GET  /api/sylvatica?action=brat&text=<teks>
 *  - tiktok  : unduh video TikTok tanpa watermark (jere tidak punya ini).
 *              GET  /api/sylvatica?action=tiktok&url=<tiktok url>
 *  - ai      : chat fallback bila Jerexd limit/gagal (dipakai api/ai.ts).
 *              GET  /api/sylvatica?action=ai&prompt=<teks>
 *
 * Endpoint sylvatica terverifikasi langsung (2026-10):
 *   /api/maker/brat?text=&apikey=     → PNG 700x700
 *   /api/ai/chatgpt?prompt=&apikey=   → { result: { response } }
 *   /api/download/tiktok?url=&apikey= → { result: { downloads: { nowm: [...] } } }
 */
export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

import { upStorage, supabaseEnv, logMedia } from './_supabase';

const BASE = 'https://sylvatica.my.id/api';

function key(): string {
  return process.env.SYLVATICA_APIKEY ?? '';
}

const bad = (res: any, status: number, error: string) => res.status(status).json({ error });

async function sylvGet(path: string, timeoutMs = 30000): Promise<{ ok: boolean; status: number; data: any; buf?: Buffer }> {
  const k = key();
  const r = await fetch(`${BASE}${path}${path.includes('?') ? '&' : '?'}apikey=${encodeURIComponent(k)}`, {
    headers: { accept: 'application/json, image/png, */*' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const ct = r.headers.get('content-type') ?? '';
  if (ct.includes('image/')) {
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: r.ok, status: r.status, data: null, buf };
  }
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

/** Chat fallback — dipanggil api/ai.ts saat Jerexd limit/gagal. */
export async function sylvaticaAI(prompt: string, timeoutMs = 45000): Promise<string | null> {
  if (!key()) return null;
  try {
    const r = await sylvGet(`/ai/chatgpt?prompt=${encodeURIComponent(prompt.slice(0, 3000))}`, timeoutMs);
    const out = r.data?.result?.response ?? r.data?.result ?? r.data?.message;
    if (typeof out === 'string' && out.trim() && r.data?.status !== false) return out.trim();
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return bad(res, 405, 'Method not allowed');
  if (!key()) return bad(res, 503, 'Layanan stiker belum dikonfigurasi (SYLVATICA_APIKEY tidak ada di server).');

  const q = req.query ?? {};
  const action = String(q.action ?? 'brat');

  try {
    // ---------- BRAT sticker ----------
    if (action === 'brat') {
      const text = String(q.text ?? '').trim().slice(0, 90);
      if (!text) return bad(res, 400, 'Teks stiker kosong.');
      const r = await sylvGet(`/maker/brat?text=${encodeURIComponent(text)}`, 35000);
      if (!r.ok || !r.buf || r.buf.length < 100) {
        const msg = String(r.data?.message ?? r.data?.error ?? `HTTP ${r.status}`);
        return bad(res, 502, `Gagal membuat stiker: ${msg.slice(0, 140)}`);
      }
      // 1) host permanen di Supabase bila tersedia
      const env = supabaseEnv();
      if (env) {
        const up = await upStorage(env, r.buf, 'image/png', `brat_${text.replace(/\s+/g, '_').slice(0, 24)}.png`, 'sticker');
        if (up) {
          void logMedia(env, { kind: 'sticker_brat', url: up.url, path: up.path, mime: 'image/png', size: r.buf.length, created_at: new Date().toISOString() });
          return res.status(200).json({ ok: true, url: up.url, provider: 'supabase' });
        }
      }
      // 2) fallback: data URL (masih jadi stiker valid, hanya tidak permanen)
      return res.status(200).json({ ok: true, dataUrl: `data:image/png;base64,${r.buf.toString('base64')}`, provider: 'inline' });
    }

    // ---------- TikTok download ----------
    if (action === 'tiktok') {
      const url = String(q.url ?? '').trim();
      if (!/^https:\/\/(www\.|vm\.|vt\.)?tiktok\.com\//i.test(url)) return bad(res, 400, 'URL TikTok tidak valid.');
      const r = await sylvGet(`/download/tiktok?url=${encodeURIComponent(url)}`, 50000);
      if (!r.ok || !r.data?.result) return bad(res, 502, `Gagal: ${String(r.data?.message ?? `HTTP ${r.status}`).slice(0, 140)}`);
      const d = r.data.result;
      const dl = d?.downloads ?? {};
      const pick = (a: any): string | null => (Array.isArray(a) && typeof a[0] === 'string' ? a[0] : typeof a === 'string' ? a : null);
      return res.status(200).json({
        ok: true,
        nowm: pick(dl.nowm), wm: pick(dl.wm), mp3: pick(dl.mp3 ?? dl.audio),
        cover: d?.cover ?? null, title: d?.title ?? '', author: d?.author?.nickname ?? d?.author ?? '',
      });
    }

    return bad(res, 400, 'Aksi tidak dikenal.');
  } catch (e: any) {
    return bad(res, 504, e?.name === 'AbortError' ? 'Waktu tunggu habis.' : 'Gagal menghubungi Sylvatica.');
  }
}
