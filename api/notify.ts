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
 * FCM_SERVER_KEY hanya hidup di env Vercel — tidak pernah ke client.
 * Legacy endpoint fcm.googleapis.com/fcm/send dipakai karena server key ini
 * adalah kunci klasik (bukan OAuth service account).
 */
export const config = { runtime: 'nodejs' };

const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

function json(res: any, code: number, data: any) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(data));
}

type Body = {
  uids?: string[];
  topic?: string;
  title?: string;
  body?: string;
  kind?: string;
  data?: Record<string, string>;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  const key = process.env.FCM_SERVER_KEY || '';
  if (!key) return json(res, 503, { ok: false, error: 'FCM belum dikonfigurasi di server (FCM_SERVER_KEY kosong).' });

  let payload: Body;
  try {
    payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  } catch {
    return json(res, 400, { ok: false, error: 'Body JSON tidak valid.' });
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

  const isCall = kind === 'call';
  let sent = 0;
  let failed = 0;
  // FCM legacy API: kirim per topic (satu request per topic)
  await Promise.all(topics.map(async (topic) => {
    try {
      const r = await fetch(FCM_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `key=${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: `/topics/${topic}`,
          priority: isCall ? 'high' : 'normal',
          notification: {
            title,
            body: text,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            click_action: 'OPEN_ZEROID',
            sound: isCall ? 'default' : undefined,
            tag: data.chatId || topic,
          },
          data,
        }),
        signal: AbortSignal.timeout(9000),
      });
      if (r.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }));

  return json(res, 200, { ok: sent > 0, sent, failed, topics: topics.length });
}
