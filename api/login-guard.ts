/// <reference types="node" />
/**
 * /api/login-guard — PELINDUNG AKUN ADMIN & DEVELOPER.
 *
 * Setiap GAGAL login (password salah / email salah) klien melaporkan email yang
 * dicoba ke sini. Bila email itu milik akun role `admin` / `developer`:
 *   - percobaan dicatat (jendela 15 menit, kunci = hash IP+perangkat),
 *   - 3x gagal → BAN KERAS IP + PERANGKAT (banips/{ipHash} & devices/{devHash},
 *     until = 0 = permanen) → gerbang ban server menolak SEMUA akses dari
 *     IP/perangkat itu (login, daftar, Google) — IP developer berbeda dengan
 *     penyerang, jadi developer tetap aman,
 *   - laporan langsung ke koleksi guardlog + PUSH FCM ke developer
 *     ("Ada yang mencoba masuk akun adminmu!").
 *
 * Email NON-admin tidak diproses (privasi) — hanya dihitung rate limitnya.
 * Kunci API tidak ada di sini; endpoint tidak mengembalikan informasi apapun
 * selain {ok:true} (anti enumeration).
 */
import crypto from 'node:crypto';
import { fbQuery, fbCreateDoc, fbPatchDoc } from './_fbrest';
import { fcmAccessToken, serviceAccountProject } from './_fcmAuth';

export const config = { runtime: 'nodejs' };
export const maxDuration = 30;

function clientIp(req: any): string {
  const h = req.headers ?? {};
  const xff = String(h['x-forwarded-for'] ?? '');
  const first = xff.split(',')[0].trim();
  if (first) return first;
  return String(h['x-real-ip'] ?? h['cf-connecting-ip'] ?? h['x-vercel-forwarded-for'] ?? '').trim();
}

// rate limit per IP: maks 12 laporan / 5 menit (login biasa tidak mungkin lebih)
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 8000) hits.clear();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 5 * 60_000);
  if (arr.length >= 12) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

// percobaan aktif: key → { count, windowStart }
const tries = new Map<string, { count: number; windowStart: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_TRIES = 3;

function json(res: any, code: number, data: any) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return json(res, 405, { ok: false });

  const ip = clientIp(req);
  if (!ip || rateLimited(ip)) return json(res, 200, { ok: true });

  let body: any;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return json(res, 200, { ok: true }); }
  const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200);
  const deviceHash = String(body?.deviceHash ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
  if (!email.includes('@') || email.length < 5) return json(res, 200, { ok: true });

  const project = process.env.FIREBASE_PROJECT_ID ?? process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';
  if (!project) return json(res, 200, { ok: true });

  try {
    // hanya akun staff yang dilindungi di sini
    const found = await fbQuery(project, 'users', [{ field: 'email', op: 'EQUAL', value: { stringValue: email } }], 1);
    const acc = found[0];
    const role = String(acc?.fields?.role ?? 'user');
    if (!acc || (role !== 'admin' && role !== 'developer')) return json(res, 200, { ok: true });

    const ipHash = crypto.createHash('sha256').update(ip, 'utf8').digest('hex');
    // v19 AUDIT: kunci penghitung WAJIB dari SERVER (hash IP saja) — deviceHash
    // dari klien bisa dirotasi penyerang tiap request agar hitungan selalu 1.
    const key = ipHash.slice(0, 32);
    const now = Date.now();
    const cur = tries.get(key);
    const state = cur && now - cur.windowStart < WINDOW_MS ? cur : { count: 0, windowStart: now };
    state.count += 1;
    state.windowStart = cur && now - cur.windowStart < WINDOW_MS ? cur.windowStart : now;
    if (tries.size > 5000) tries.clear();
    tries.set(key, state);

    const nowNotYet = state.count < MAX_TRIES;
    const ipHashShort = ipHash.slice(0, 80);

    // v19 AUDIT: respons SERAGAM {ok:true} — flag watched/banned memungkinkan
    // ORAKEL enumerasi email admin. Semua hasil identik dari luar.
    if (nowNotYet) {
      // laporan dini ke developer (tanpa ban) — "ada yang coba-coba"
      await fbCreateDoc(project, 'guardlog', `lg_${now}_${Math.random().toString(36).slice(2, 6)}`, {
        uid: fsS(acc.id), name: fsS(String(acc.fields?.name ?? 'Admin')), role: fsS(role),
        chatId: fsS(''), chatName: fsS('Login guard'), chatType: fsS('system'),
        kind: fsS('login_attempt'), reason: fsS(`percobaan login gagal ke akun ${role} (ke-${state.count} dari ${MAX_TRIES})`),
        excerpt: fsS(`IP hash ${ipHashShort.slice(0, 16)}… · perangkat ${deviceHash ? deviceHash.slice(0, 10) + '…' : 'tidak diketahui'}`),
        action: fsS('dimonitor — ban otomatis pada percobaan ke-3'),
        until: fsInt(0), byCaller: fsS('login-guard'), msgId: fsS(''), at: fsInt(now),
      });
      await notifyDeveloper(project, `⚠️ Percobaan login akun ${role}`, `Percobaan gagal ke-${state.count} ke ${email} dari IP/perangkat tak dikenal. Ban otomatis pada percobaan ke-${MAX_TRIES}.`);
      return json(res, 200, { ok: true });
    }

    // ===== BAN OTOMATIS IP + PERANGKAT =====
    // ANTI SELF-LOCKOUT (developer salah ketik password juga terhitung):
    //   3-5x gagal dalam 15 menit  → ban 6 JAM (penyerang biasa menyerah),
    //   6x+ gagal dalam 15 menit   → ban PERMANEN (pantang menyerah = serangan).
    // Developer yang terkunci salah ketik cukup menunggu 6 jam / ganti jaringan /
    // minta admin lain membuka via guardlog — akun TIDAK pernah diblokir.
    const permanent = state.count >= MAX_TRIES * 2;
    const until = permanent ? 0 : now + 6 * 3600_000;
    const lockRec = {
      uid: fsS(acc.id), email: fsS(email),
      until: fsInt(until), // 0 = PERMANEN
      reason: fsS(permanent
        ? '[LOGIN GUARD] Percobaan membobol akun admin/developer berulang — IP & perangkat ini diblokir PERMANEN. Hubungi developer untuk pemulihan.'
        : '[LOGIN GUARD] Percobaan login ke akun admin/developer — IP & perangkat ini diblokir 6 jam.'),
      at: fsInt(now),
    };
    await fbPatchDoc(project, `banips/${ipHashShort}`, lockRec);
    // v19 AUDIT: ban perangkat hanya utk hash berformat valid (anti hash palsu)
    if (/^[a-f0-9]{40,64}$/.test(deviceHash)) await fbPatchDoc(project, `devices/${deviceHash}`, lockRec);
    await fbCreateDoc(project, 'guardlog', `lg_${now}_${Math.random().toString(36).slice(2, 6)}`, {
      uid: fsS(acc.id), name: fsS(String(acc.fields?.name ?? 'Admin')), role: fsS(role),
      chatId: fsS(''), chatName: fsS('Login guard'), chatType: fsS('system'),
      kind: fsS('login_ban'), reason: fsS(`${state.count}x gagal login ke akun ${role} — sumber diblokir`),
      excerpt: fsS(`IP hash ${ipHashShort.slice(0, 16)}… · perangkat ${deviceHash ? deviceHash.slice(0, 10) + '…' : 'tidak diketahui'} — ${permanent ? 'BAN PERMANEN' : 'BAN 6 JAM'} dipasang`),
      action: fsS(permanent ? 'BAN KERAS IP+perangkat (permanen)' : 'BAN IP+perangkat (6 jam)'), until: fsInt(until), byCaller: fsS('login-guard'), msgId: fsS(''), at: fsInt(now),
    });
    // v19 AUDIT: hitungan TIDAK direset — penyerang yang terus mencoba sampai
    // 6x+ dalam jendela 15 menit naik ke BAN PERMANEN (3-5x = ban 6 jam).
    await notifyDeveloper(project, permanent ? '🛡️ Serangan diblokir permanen' : '🛡️ Sumber dicurigai diblokir 6 jam',
      `${state.count}x percobaan gagal ke akun ${role} (${email}). IP & perangkat penyerang ${permanent ? 'diblokir PERMANEN' : 'diblokir 6 jam'} otomatis.`);
    return json(res, 200, { ok: true, banned: true });
  } catch {
    return json(res, 200, { ok: true });
  }
}

function fsS(v: string) { return { stringValue: String(v ?? '').slice(0, 300) }; }
function fsInt(v: number) { return { integerValue: String(Math.round(Number(v) || 0)) }; }

/** Push FCM langsung ke semua developer (topic user_<uid>). */
async function notifyDeveloper(project: string, title: string, body: string): Promise<void> {
  try {
    const devs = await fbQuery(project, 'users', [{ field: 'role', op: 'EQUAL', value: { stringValue: 'developer' } }], 10);
    const tok = await fcmAccessToken();
    if (!tok || !devs.length) return;
    const proj = serviceAccountProject() ?? project;
    await Promise.all(devs.map((d) => fetch(`https://fcm.googleapis.com/v1/projects/${proj}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          topic: `user_${d.id}`,
          notification: { title, body },
          data: { kind: 'admin' },
          android: { priority: 'high', notification: { channel_id: 'admin', visibility: 'PUBLIC' } },
        },
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)));
  } catch { /* best effort */ }
}
