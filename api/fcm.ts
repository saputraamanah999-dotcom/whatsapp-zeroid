/// <reference types="node" />
/**
 * /api/fcm — ROUTER FCM (subscribe/unsubscribe) v20: PENYIMPANAN TOKEN LANGSUNG.
 *
 * MENGAPA BUKAN TOPIC/IID LAGI: API Instance ID (iid.googleapis.com) di-retire
 * Google — scope `instance.id` kini tak bisa menukar access_token (diuji CI:
 * respons hanya id_token) dan endpoint IID menolak token OAuth (401). Push
 * berbasis topic = MUSTAHIL di project ini. Penggantinya: token FCM disimpan
 * di Firestore (koleksi `fcmtokens`, hanya server — rules false) dan
 * /api/notify mengirim LANGSUNG ke tiap token via FCM HTTP v1.
 *
 *   POST /api/fcm?action=subscribe    { token, uid }
 *   POST /api/fcm?action=unsubscribe  { token }
 *
 * Tanpa ?action: body.uid ada → subscribe, hanya token → unsubscribe.
 * URL lama (/api/fcm-subscribe, /api/fcm-unsubscribe) tetap jalan via rewrites.
 */
import crypto from 'node:crypto';
import { parseServiceAccount, serviceAccountProject } from './_fcmAuth';
import { fbPatchDoc, fbDeleteDoc } from './_fbrest';

export const config = { runtime: 'nodejs' };

function json(res: any, code: number, data: any) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data));
}

/** id dokumen token — hash saja (token asli tidak jadi id; tetap tersimpan sebagai field). */
function tokenId(token: string): string {
  return 't_' + crypto.createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 24);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  if (!parseServiceAccount()) return json(res, 503, { ok: false, error: 'Isi FIREBASE_SERVICE_ACCOUNT di Vercel env.' });
  const project = serviceAccountProject() ?? '';

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
  if (!token || token.length < 20 || token.length > 4096) return json(res, 400, { ok: false, error: 'token wajib (20-4096 karakter).' });
  if (mode === 'subscribe' && !uid) return json(res, 400, { ok: false, error: 'uid wajib untuk subscribe.' });

  try {
    if (mode === 'unsubscribe') {
      const ok = await fbDeleteDoc(project, `fcmtokens/${tokenId(token)}`);
      return json(res, 200, { ok: true, mode: 'unsubscribe', removed: ok });
    }
    // subscribe → simpan/refresh token (1 dokumen per token; uid sebagai field).
    // fbPatchDoc mengirim fields APA ADANYA ke REST → nilai wajib Firestore-typed.
    const id = tokenId(token);
    const ok = await fbPatchDoc(project, `fcmtokens/${id}`, {
      uid: { stringValue: uid },
      token: { stringValue: token },
      at: { integerValue: String(Date.now()) },
    });
    return json(res, 200, { ok, mode: 'subscribe', topics: [], store: 'fcmtokens' });
  } catch (e: any) {
    return json(res, 200, { ok: false, error: String(e?.message ?? 'store failed').slice(0, 160) });
  }
}
