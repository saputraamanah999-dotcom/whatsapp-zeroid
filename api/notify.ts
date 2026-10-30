/// <reference types="node" />
/**
 * Vercel serverless — kirim PUSH NOTIFICATION FCM (pesan masuk, panggilan,
 * story developer, broadcast admin). Notifikasi muncul DI LUAR aplikasi/website
 * (status bar Android / notifikasi browser).
 *
 * Body (JSON): { uids?: string[], topic?: string, title, body, kind?, data? }
 *  - uids: daftar uid penerima → dikirim ke topic `user_<uid>` (di-subscribe
 *          oleh /api/fcm-subscribe dan registerPushToken native)
 *  - topic: topic langsung, mis. `all` (broadcast)
 *
 * DUA MODE KIRIM (otomatis):
 *  1. FCM HTTP v1 (UTAMA)  — pakai FIREBASE_SERVICE_ACCOUNT (service account,
 *     satu-satunya cara di project Firebase baru; legacy API dimatikan Google).
 *  2. Legacy (FALLBACK)    — FCM_SERVER_KEY `AAAA...` untuk project lama.
 *
 * Kunci hanya hidup di env server — tidak pernah ke client.
 */
import { fcmAccessToken, serviceAccountProject } from './_fcmAuth';
import { verifyIdToken } from './_fbrest';

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

/** Kirim 1 topic via FCM HTTP v1. */
async function sendV1(topic: string, title: string, text: string, data: Record<string, string>, high: boolean, origin: string, channelId: string): Promise<boolean> {
  const token = await fcmAccessToken();
  const project = serviceAccountProject();
  if (!token || !project) return false;
  const r = await fetch(`${'https://fcm.googleapis.com/v1/projects'}/${project}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        topic,
        notification: { title, body: text },
        data,
        android: {
          priority: high ? 'high' : 'normal',
          notification: {
            sound: 'default',
            channel_id: channelId,
            tag: data.chatId || topic,
            visibility: 'PUBLIC',
          },
        },
        webpush: {
          headers: { Urgency: high ? 'high' : 'normal' },
          notification: { icon: '/icon-192.png', badge: '/icon-192.png', tag: data.chatId || topic, renotify: true },
          fcmOptions: { link: origin || '/' },
        },
      },
    }),
    signal: AbortSignal.timeout(9000),
  });
  return r.ok;
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
  for (const u of (payload.uids ?? []).slice(0, 60)) {
    if (u) topics.push(`user_${String(u).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 90)}`);
  }
  if (!topics.length) return json(res, 400, { ok: false, error: 'uids atau topic wajib diisi.' });

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

  await Promise.all(topics.map(async (topic) => {
    try {
      const ok = saOk
        ? await sendV1(topic, title, text, data, high, origin, channelId)
        : await sendLegacy(topic, title, text, data, legacyKey, high);
      if (ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }));

  return json(res, 200, { ok: sent > 0, sent, failed, topics: topics.length, mode: saOk ? 'v1' : 'legacy' });
}
