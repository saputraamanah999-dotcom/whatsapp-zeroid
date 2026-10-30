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
import { parseServiceAccount, serviceAccountProject, } from './_fcmAuth';
import { fbPatchDoc, fbDeleteDoc, verifyIdToken } from './_fbrest';

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

// rate limit per IP (anti banjir tulis Firestore): 30 subscribe / 5 menit
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 8000) hits.clear();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 5 * 60_000);
  if (arr.length >= 30) { hits.set(ip, arr); return true; }
  arr.push(now); hits.set(ip, arr);
  return false;
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

  // AUDIT v20 ANTI PENYADAPAN: token push = kredensial kirim pesan ke perangkat.
  // Tanpa verifikasi, penyerang bisa memasang token-nya sendiri atas nama uid
  // KORBAN → menerima notifikasi korban. Kini:
  //  - Bearer ID token ADA & valid → caller.uid WAJIB == uid (403 kalau beda);
  //  - tanpa header (APK lama) → diterima tapi ditandai unverified:true;
  //    /api/notify melewatinya utk konten pribadi (message/group/call).
  let verified = false;
  const auth = String(req.headers.authorization ?? '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (bearer) {
    const caller = await verifyIdToken(bearer);
    if (!caller) return json(res, 401, { ok: false, error: 'Sesi tidak valid — masuk ulang.' });
    if (mode === 'subscribe' && caller.uid !== uid) return json(res, 403, { ok: false, error: 'Token hanya boleh dipasang untuk akun sendiri.' });
    verified = true;
  } else {
    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
    if (rateLimited(ip)) return json(res, 429, { ok: false, error: 'Terlalu banyak permintaan.' });
  }

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
      unverified: { booleanValue: !verified },
    });
    return json(res, 200, { ok, mode: 'subscribe', topics: [], store: 'fcmtokens', verified });
  } catch (e: any) {
    return json(res, 200, { ok: false, error: String(e?.message ?? 'store failed').slice(0, 160) });
  }
}
