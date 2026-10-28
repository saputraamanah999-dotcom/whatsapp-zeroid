/// <reference types="node" />
/**
 * Vercel serverless — cabut token FCM dari semua topic (logout / ganti token).
 * Endpoint pendamping /api/fcm-subscribe (sebelumnya tidak ada → 404 diam).
 *
 * Body (JSON): { token }
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

  let body: { token?: string };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  } catch {
    return json(res, 400, { ok: false, error: 'Body JSON tidak valid.' });
  }
  const token = String(body.token ?? '').trim();
  if (!token) return json(res, 400, { ok: false, error: 'token wajib.' });

  try {
    const headers: Record<string, string> = saOk
      ? { Authorization: `Bearer ${(await fcmAccessToken()) ?? ''}` }
      : { Authorization: `key=${legacyKey}` };
    const r = await fetch(`https://iid.googleapis.com/iid/v1/${encodeURIComponent(token)}/rel/topics/all`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(9000),
    });
    return json(res, 200, { ok: r.ok || r.status === 404 });
  } catch (e: any) {
    return json(res, 200, { ok: false, error: String(e?.message ?? 'iid failed').slice(0, 160) });
  }
}
