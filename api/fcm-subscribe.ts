/// <reference types="node" />
/**
 * Vercel serverless — daftarkan token FCM (web) ke topic `user_<uid>` + `all`
 * memakai Instance ID API.
 *
 * DUA MODE (otomatis):
 *  1. OAuth2 service account (FIREBASE_SERVICE_ACCOUNT) — untuk project baru
 *     yang tidak punya legacy server key lagi.
 *  2. Legacy FCM_SERVER_KEY — fallback project lama.
 *
 * Body (JSON): { token, uid }
 */
import { fcmAccessToken } from './_fcmAuth';

export const config = { runtime: 'nodejs' };

function json(res: any, code: number, data: any) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  const saOk = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  const legacyKey = process.env.FCM_SERVER_KEY || '';
  if (!saOk && !legacyKey) return json(res, 503, { ok: false, error: 'Isi FIREBASE_SERVICE_ACCOUNT (project baru) atau FCM_SERVER_KEY (legacy) di Vercel env.' });

  let body: { token?: string; uid?: string };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  } catch {
    return json(res, 400, { ok: false, error: 'Body JSON tidak valid.' });
  }
  const token = String(body.token ?? '').trim();
  const uid = String(body.uid ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90);
  if (!token || !uid) return json(res, 400, { ok: false, error: 'token dan uid wajib.' });

  const auth = async () => {
    if (saOk) {
      const t = await fcmAccessToken();
      if (!t) throw new Error('oauth gagal — cek FIREBASE_SERVICE_ACCOUNT');
      return { bearer: t, legacy: '' };
    }
    return { bearer: '', legacy: legacyKey };
  };

  const subscribe = async (topic: string, h: { bearer: string; legacy: string }) => {
    const headers: Record<string, string> = h.bearer ? { Authorization: `Bearer ${h.bearer}` } : { Authorization: `key=${h.legacy}` };
    const r = await fetch(`https://iid.googleapis.com/iid/v1/${encodeURIComponent(token)}/rel/topics/${topic}`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(9000),
    });
    return r.ok || r.status === 400; // 400 = sudah ter-subscribe
  };

  try {
    const h = await auth();
    const [u, all] = await Promise.all([subscribe(`user_${uid}`, h), subscribe('all', h)]);
    return json(res, 200, { ok: u || all, topics: [`user_${uid}`, 'all'], mode: h.bearer ? 'v1' : 'legacy' });
  } catch (e: any) {
    return json(res, 200, { ok: false, error: String(e?.message ?? 'iid failed').slice(0, 160) });
  }
}
