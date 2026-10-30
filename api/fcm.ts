/// <reference types="node" />
/**
 * /api/fcm — ROUTER penggabung 2 endpoint FCM (hemat kuota 12 serverless
 * functions Hobby — dulu 2 file, kini satu):
 *
 *   POST /api/fcm?action=subscribe    { token, uid }      (dulu /api/fcm-subscribe)
 *   POST /api/fcm?action=unsubscribe  { token }           (dulu /api/fcm-unsubscribe)
 *
 * Tanpa ?action: body.uid ada → subscribe, hanya token → unsubscribe.
 * URL lama tetap jalan via rewrites vercel.json.
 *
 * DUA MODE (otomatis):
 *  1. OAuth2 service account (FIREBASE_SERVICE_ACCOUNT) — project baru.
 *  2. Legacy FCM_SERVER_KEY — fallback project lama.
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

  let body: { token?: string; uid?: string; action?: string };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  } catch {
    return json(res, 400, { ok: false, error: 'Body JSON tidak valid.' });
  }

  const action = String(req.query?.action ?? body.action ?? '').toLowerCase();
  const mode = action === 'unsubscribe' || action === 'un' || action === 'off'
    ? 'unsubscribe'
    : action === 'subscribe' || action === 'on'
    ? 'subscribe'
    : (body.uid ? 'subscribe' : 'unsubscribe'); // fallback cerdas tanpa action

  const token = String(body.token ?? '').trim();
  const uid = String(body.uid ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90);
  if (!token) return json(res, 400, { ok: false, error: 'token wajib.' });
  if (mode === 'subscribe' && !uid) return json(res, 400, { ok: false, error: 'uid wajib untuk subscribe.' });

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
    if (mode === 'unsubscribe') {
      const r = await fetch(`https://iid.googleapis.com/iid/v1/${encodeURIComponent(token)}/rel/topics/all`, {
        method: 'DELETE',
        headers: h.bearer ? { Authorization: `Bearer ${h.bearer}` } : { Authorization: `key=${h.legacy}` },
        signal: AbortSignal.timeout(9000),
      });
      return json(res, 200, { ok: r.ok || r.status === 404, mode: 'unsubscribe' });
    }
    const [u, all] = await Promise.all([subscribe(`user_${uid}`, h), subscribe('all', h)]);
    return json(res, 200, { ok: u || all, topics: [`user_${uid}`, 'all'], mode: h.bearer ? 'v1' : 'legacy' });
  } catch (e: any) {
    return json(res, 200, { ok: false, error: String(e?.message ?? 'iid failed').slice(0, 160) });
  }
}
