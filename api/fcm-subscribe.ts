/// <reference types="node" />
/**
 * Vercel serverless — daftarkan token FCM (web) ke topic `user_<uid>` + `all`
 * memakai Instance ID API. FCM_SERVER_KEY hanya di server.
 *
 * Body (JSON): { token, uid }
 */
export const config = { runtime: 'nodejs' };

function json(res: any, code: number, data: any) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  const key = process.env.FCM_SERVER_KEY || '';
  if (!key) return json(res, 503, { ok: false, error: 'FCM_SERVER_KEY belum diset di Vercel env.' });
  let body: { token?: string; uid?: string };
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  } catch {
    return json(res, 400, { ok: false, error: 'Body JSON tidak valid.' });
  }
  const token = String(body.token ?? '').trim();
  const uid = String(body.uid ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90);
  if (!token || !uid) return json(res, 400, { ok: false, error: 'token dan uid wajib.' });

  const subscribe = async (topic: string) => {
    const r = await fetch(`https://iid.googleapis.com/iid/v1/${encodeURIComponent(token)}/rel/topics/${topic}`, {
      method: 'POST',
      headers: { Authorization: `key=${key}` },
      signal: AbortSignal.timeout(9000),
    });
    return r.ok || r.status === 400; // 400 = sudah ter-subscribe
  };

  try {
    const [u, all] = await Promise.all([subscribe(`user_${uid}`), subscribe('all')]);
    return json(res, 200, { ok: u || all, topics: [`user_${uid}`, 'all'] });
  } catch (e: any) {
    return json(res, 200, { ok: false, error: String(e?.message ?? 'iid failed').slice(0, 160) });
  }
}
