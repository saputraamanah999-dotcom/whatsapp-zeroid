/// <reference types="node" />
/**
 * Vercel serverless — kirim PUSH NOTIFICATION FCM v20: LANGSUNG KE TOKEN.
 *
 * MENGAPA BUKAN TOPIC: API Instance ID (IID) di-retire Google — scope
 * instance.id tak bisa menukar access_token (diuji: respons hanya id_token)
 * dan IID menolak token OAuth (401). Push topic = mustahil. Kini token FCM
 * tiap perangkat disimpan di koleksi `fcmtokens` (server-only) oleh
 * /api/fcm?action=subscribe, dan notifikasi dikirim LANGSUNG ke token
 * (message:{token}) via FCM HTTP v1. Token mati (404/410) dihapus otomatis.
 *
 * Body (JSON): { uids?: string[], topic?: 'all', title, body, kind?, data? }
 *  - uids → semua token milik uid tsb (query fcmtokens)
 *  - topic 'all' (broadcast admin) → SEMUA token tersimpan (maks 500)
 *
 * Legacy FCM_SERVER_KEY (project lama) masih mendukung topic via /fcm/send.
 * Kunci hanya hidup di env server — tidak pernah ke client.
 */
import crypto from 'node:crypto';
import { fcmAccessToken, serviceAccountProject } from './_fcmAuth';
import { verifyIdToken, fbQuery, fbDeleteDoc } from './_fbrest';

export const config = { runtime: 'nodejs' };

function json(res: any, code: number, data: any) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data));
}

// ---- rate limit per UID (push spam dari akun kompormen) ----
const pushHits = new Map<string, number[]>();
function pushRateLimited(uid: string): boolean {
  const now = Date.now();
  const arr = (pushHits.get(uid) ?? []).filter((t) => now - t < 5 * 60_000);
  if (arr.length >= 60) { pushHits.set(uid, arr); return true; }
  arr.push(now);
  pushHits.set(uid, arr);
  if (pushHits.size > 8000) pushHits.clear(); // jaga memori instance
  return false;
}

type Body = {
  uids?: string[];
  topic?: string;
  title?: string;
  body?: string;
  kind?: string;
  data?: Record<string, string>;
};

/** id dokumen token di fcmtokens — SAMA dengan api/fcm.ts. */
function tokenId(token: string): string {
  return 't_' + crypto.createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 24);
}

/** Ambil semua token FCM milik uid-uid ini (query koleksi fcmtokens, SA). */
async function tokensForUids(project: string, uids: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const uid of uids.slice(0, 60)) {
    try {
      const docs = await fbQuery(project, 'fcmtokens', [{ field: 'uid', op: 'EQUAL', value: { stringValue: uid } }], 60);
      for (const d of docs) {
        const t = String(d.fields?.token ?? '');
        if (t && t.length >= 20) out.push(t);
      }
    } catch { /* lanjut uid berikutnya */ }
  }
  return [...new Set(out)];
}

/** Semua token tersimpan (broadcast admin) — maks 500 dokumen. */
async function allTokens(project: string): Promise<string[]> {
  try {
    const docs = await fbQuery(project, 'fcmtokens', [], 500);
    return [...new Set(docs.map((d) => String(d.fields?.token ?? '')).filter((t) => t.length >= 20))];
  } catch { return []; }
}

/** Kirim 1 token via FCM HTTP v1; false = gagal (panggilan menandai utk dihapus). */
async function sendV1Token(token: string, title: string, text: string, data: Record<string, string>, high: boolean, origin: string, channelId: string): Promise<{ ok: boolean; status: number }> {
  const bearer = await fcmAccessToken();
  const project = serviceAccountProject();
  if (!bearer || !project) return { ok: false, status: 0 };
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body: text },
        data,
        android: {
          priority: high ? 'high' : 'normal',
          notification: { sound: 'default', channel_id: channelId, tag: data.chatId || channelId, visibility: 'PUBLIC' },
        },
        webpush: {
          headers: { Urgency: high ? 'high' : 'normal' },
          notification: { icon: '/icon-192.png', badge: '/icon-192.png', tag: data.chatId || channelId, renotify: true },
          fcmOptions: { link: origin || '/' },
        },
      },
    }),
    signal: AbortSignal.timeout(9000),
  });
  return { ok: r.ok, status: r.status };
}

/** Kirim 1 topic via legacy API (project lama yang masih punya server key). */
async function sendLegacy(topic: string, title: string, text: string, data: Record<string, string>, key: string, high: boolean): Promise<boolean> {
  const r = await fetch('https://fcm.googleapis.com/fcm/send', {
    method: 'POST',
    headers: { Authorization: `key=${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: `/topics/${topic}`,
      priority: high ? 'high' : 'normal',
      notification: {
        title,
        body: text,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        click_action: 'OPEN_ZEROID',
        sound: high ? 'default' : undefined,
        tag: data.chatId || topic,
      },
      data,
    }),
    signal: AbortSignal.timeout(9000),
  });
  return r.ok;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

  const saOk = !!process.env.FIREBASE_SERVICE_ACCOUNT;
  const legacyKey = process.env.FCM_SERVER_KEY || '';
  if (!saOk && !legacyKey) {
    return json(res, 503, { ok: false, error: 'FCM belum dikonfigurasi di server: isi FIREBASE_SERVICE_ACCOUNT (project baru) atau FCM_SERVER_KEY (legacy) di Vercel env.' });
  }

  // OTENTIKASI WAJIB (AUDIT FIX) — dulu endpoint ini TERBUKA: siapa pun bisa
  // mengirim push ke topik mana pun (spam/phishing "dari Zeroid"). Sekarang
  // wajib Firebase ID token; topik 'all' (broadcast global) hanya admin.
  const auth = String(req.headers.authorization ?? '');
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : String(req.body?.token ?? '');
  const caller = await verifyIdToken(bearer);
  if (!caller) return json(res, 401, { ok: false, error: 'Sesi tidak valid — masuk ulang.' });
  if (pushRateLimited(caller.uid)) return json(res, 429, { ok: false, error: 'Terlalu banyak notifikasi. Coba lagi nanti.' });

  let payload: Body;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  } catch {
    return json(res, 400, { ok: false, error: 'Body JSON tidak valid.' });
  }

  const wantsAll = !payload.uids?.length && String(payload.topic ?? '') === 'all';
  if (wantsAll) {
    // cek role admin via Firestore REST (identitas caller, read sendiri tidak cukup
    // — gunakan service account bila ada; tanpa SA: tolak)
    let isAdmin = false;
    try {
      const tok = await fcmAccessToken();
      const project = serviceAccountProject();
      if (tok && project) {
        const r = await fetch(
          `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${caller.uid}?mask.fieldPaths=role&mask.fieldPaths=developer`,
          { headers: { authorization: `Bearer ${tok}` }, signal: AbortSignal.timeout(8000) }
        );
        if (r.ok) {
          const d: any = await r.json();
          const role = d?.fields?.role?.stringValue ?? '';
          isAdmin = role === 'admin' || role === 'developer' || d?.fields?.developer?.booleanValue === true;
        }
      }
    } catch { /* isAdmin tetap false */ }
    if (!isAdmin) return json(res, 403, { ok: false, error: 'Broadcast ke semua pengguna hanya untuk admin.' });
  }

  const title = String(payload.title ?? 'Zeroid WhatsApp').slice(0, 120);
  const text = String(payload.body ?? '').slice(0, 240);
  const kind = String(payload.kind ?? 'message');
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data ?? {})) data[k] = String(v ?? '').slice(0, 200);
  data.kind = kind;

  const topics: string[] = [];
  if (payload.topic) topics.push(String(payload.topic).replace(/[^a-zA-Z0-9-_.~%]/g, '').slice(0, 80));
  const targetUids = (payload.uids ?? []).map((u) => String(u).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90)).filter(Boolean).slice(0, 60);
  if (!topics.length && !targetUids.length) return json(res, 400, { ok: false, error: 'uids atau topic wajib diisi.' });

  const high = kind === 'call';
  // CHANNEL ANDA — popup notifikasi di luar aplikasi (APK): pesan/grup/story/
  // panggilan/pengumuman admin dipetakan ke channel yang dibuat aplikasi saat
  // masuk (lib/notify.ts setupNotifications). Tanpa channel_id ini Android bisa
  // menaruh notifikasi di channel "Misc" dengan importance rendah → tidak muncul
  // sebagai popup layar kunci/heads-up.
  const channelByKind: Record<string, string> = {
    call: 'calls',
    group: 'groups',
    story: 'stories',
    admin: 'announcements',
    message: 'messages',
  };
  const channelId = channelByKind[kind] ?? 'messages';
  const origin = String(req.headers?.origin ?? '').slice(0, 200);
  let sent = 0;
  let failed = 0;

  const project = serviceAccountProject() ?? '';
  const stale: string[] = [];

  // PATH UTAMA v20 — token langsung (saOk). Legacy server-key tetap topic.
  if (saOk && project) {
    let targets: string[] = [];
    if (topics.includes('all')) targets = await allTokens(project);
    if (targetUids.length) targets = targets.concat(await tokensForUids(project, targetUids));
    targets = [...new Set(targets)].slice(0, 500);
    if (!targets.length) return json(res, 200, { ok: false, sent: 0, failed: 0, reason: 'tidak ada token terdaftar untuk penerima' });
    await Promise.all(targets.map(async (tk) => {
      try {
        const r = await sendV1Token(tk, title, text, data, high, origin, channelId);
        if (r.ok) sent++;
        else {
          failed++;
          // token tidak terdaftar lagi (uninstall) → hapus dari store
          if (r.status === 404 || r.status === 410) stale.push(tk);
        }
      } catch { failed++; }
    }));
    void Promise.all(stale.slice(0, 100).map((tk) => fbDeleteDoc(project, `fcmtokens/${tokenId(tk)}`).catch(() => null)));
    return json(res, 200, { ok: sent > 0, sent, failed, targets: targets.length, mode: 'v1-token' });
  }

  // FALLBACK legacy (project lama dgn server key): topic tetap jalan di sana
  await Promise.all(topics.map(async (topic) => {
    try {
      const ok = await sendLegacy(topic, title, text, data, legacyKey, high);
      if (ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }));

  return json(res, 200, { ok: sent > 0, sent, failed, topics: topics.length, mode: 'legacy' });
}
