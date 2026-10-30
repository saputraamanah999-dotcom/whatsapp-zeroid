/// <reference types="node" />
/**
 * /api/guard — ROUTER penggabung 3 endpoint pelindung (HEMAT KUOTA 12
 * SERVERLESS FUNCTIONS HOBBY — dulu 3 file terpisah, kini SATU file):
 *
 *   ?action=ban-gate     (dulu /api/ban-gate)   POST { deviceHash?, email? }
 *   ?action=ip-ban       (dulu /api/ip-ban)     GET  → { ip, hash }
 *   ?action=login-guard  (dulu /api/login-guard) POST { email, deviceHash? }
 *
 * URL lama TETAP JALAN via rewrites vercel.json (belts & suspenders) — klien
 * baru mengirim ?action= langsung. Perilaku tiap aksi 100% sama dengan
 * implementasi aslinya.
 *
 * —— ban-gate: gerbang server anti ban-evasion. Server menghitung hash IP
 *    sendiri, membaca banips/{hash}, banips/{s24_...}, devices/{hash} via
 *    service account (tidak bisa dimanipulasi klien). Hanya email pemilik
 *    ban (bannedEmail) yang boleh masuk untuk lihat info & banding.
 * —— ip-ban: kembalikan IP publik pemanggil + sha256 sebagai id banips.
 * —— login-guard: pelindung akun admin/developer — gagal login berulang ke
 *    akun staff → ban IP+perangkat (6 jam, lalu permanen) + laporan FCM.
 */
import crypto from 'node:crypto';
import { parseServiceAccount, fcmAccessToken, serviceAccountProject } from './_fcmAuth';
import { fbQuery, fbCreateDoc, fbPatchDoc } from './_fbrest';

/** Kirim push ke SEMUA token milik daftar uid (v20 — token langsung, tanpa
 *  topic: API IID di-retire Google, scope instance.id tak bisa dipakai). */
async function pushToUsers(project: string, uids: string[], title: string, body: string): Promise<void> {
  try {
    const tok = await fcmAccessToken();
    if (!tok) return;
    const proj = serviceAccountProject() ?? project;
    for (const uid of uids.slice(0, 20)) {
      let docs: { id: string; fields: Record<string, any> }[] = [];
      try {
        docs = await fbQuery(proj, 'fcmtokens', [{ field: 'uid', op: 'EQUAL', value: { stringValue: uid } }], 40);
      } catch { continue; }
      await Promise.all(docs.map((d) => {
        const tk = String(d.fields?.token ?? '');
        if (tk.length < 20) return Promise.resolve(null);
        return fetch(`https://fcm.googleapis.com/v1/projects/${proj}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token: tk,
              notification: { title, body },
              data: { kind: 'admin' },
              android: { priority: 'high', notification: { channel_id: 'admin', visibility: 'PUBLIC' } },
            },
          }),
          signal: AbortSignal.timeout(8000),
        }).catch(() => null);
      }));
    }
  } catch { /* best effort */ }
}

export const config = { runtime: 'nodejs' };
export const maxDuration = 30;

// ============================================================ util bersama
function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function clientIp(req: any): string {
  const h = req.headers ?? {};
  const xff = String(h['x-forwarded-for'] ?? '');
  const first = xff.split(',')[0].trim();
  return first || String(h['x-real-ip'] ?? h['cf-connecting-ip'] ?? h['x-vercel-forwarded-for'] ?? '').trim();
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}

function json(res: any, code: number, data: any) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function fsS(v: string) { return { stringValue: String(v ?? '').slice(0, 300) }; }
function fsInt(v: number) { return { integerValue: String(Math.round(Number(v) || 0)) }; }

// ============================================================ ban-gate
let dsToken: { token: string; exp: number } | null = null;

/** Access token OAuth2 scope Firestore datastore (cache terpisah dari FCM). */
async function datastoreToken(): Promise<string | null> {
  const sa = parseServiceAccount();
  if (!sa) return null;
  if (dsToken && dsToken.exp > Date.now() + 60_000) return dsToken.token;
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp: iat + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claims);
  const jwt = header + '.' + claims + '.' + b64url(signer.sign(sa.private_key as string));
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    dsToken = { token: j.access_token, exp: Date.now() + 300_000 };
    return dsToken.token;
  } catch { return null; }
}

/** id dokumen banips: hash IP penuh + hash subnet (anti ganti-WiFi-IP). */
function ipHashes(ip: string): string[] {
  if (!ip) return [];
  const out = [sha(ip)];
  if (ip.includes('.')) {
    out.push('s24_' + sha(ip.split('.').slice(0, 3).join('.')));
  } else if (ip.includes(':')) {
    out.push('s24_' + sha(ip.split(':').slice(0, 4).join(':')));
  }
  return out;
}

async function fsDoc(token: string, pid: string, col: string, id: string): Promise<any | null> {
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/${col}/${id}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const f = j.fields ?? {};
    const out: any = {};
    for (const k of Object.keys(f)) {
      const v = f[k];
      out[k] = v.integerValue != null ? Number(v.integerValue) : v.booleanValue != null ? !!v.booleanValue : (v.stringValue ?? null);
    }
    return out;
  } catch { return null; }
}

async function actionBanGate(req: any, res: any): Promise<void> {
  const ip = clientIp(req);
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body ?? {};
  const deviceHash = String(body.deviceHash ?? '').slice(0, 80);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 120);

  const sa = parseServiceAccount();
  if (!sa) {
    // service account belum dipasang → klien akan fallback ke baca Firestore langsung
    return void res.status(200).json({ blocked: false, degraded: true, ipHash: ip ? sha(ip) : '' });
  }
  const token = await datastoreToken();
  if (!token) return void res.status(200).json({ blocked: false, degraded: true, ipHash: ip ? sha(ip) : '' });
  const pid = sa.project_id!;

  const ids: [string, string, string][] = [
    ...ipHashes(ip).map((h) => ['banips', h, ip.includes('.') && h.startsWith('s24_') ? 'subnet' : 'ip'] as [string, string, string]),
    ...(deviceHash ? [['devices', deviceHash, 'device'] as [string, string, string]] : []),
  ];

  const now = Date.now();
  for (const [col, id, by] of ids) {
    const d = await fsDoc(token, pid, col, id);
    if (!d) continue;
    const until = Number(d.until ?? 0);
    if (until > 0 && until <= now) continue; // blokir sudah lewat
    const bannedEmail = String(d.email ?? '').toLowerCase();
    return void res.status(200).json({
      blocked: true,
      until,
      reason: String(d.reason ?? 'Perangkat/IP tercatat pada akun yang diblokir admin.'),
      bannedEmail,
      matchedBy: by,
      own: !!email && !!bannedEmail && email === bannedEmail, // email yang dibanned boleh masuk
    });
  }
  return void res.status(200).json({ blocked: false, ipHash: ip ? sha(ip) : '', subnet: ipHashes(ip)[1] ?? '' });
}

// ============================================================ ip-ban
function actionIpBan(req: any, res: any): void {
  if (req.method !== 'GET') return void json(res, 405, { error: 'Method not allowed' });
  const ip = clientIp(req);
  if (!ip) return void res.status(200).json({ ip: '', hash: '' });
  return void res.status(200).json({ ip: ip.slice(0, 45), hash: sha(String(ip)) });
}

// ============================================================ login-guard
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


async function actionLoginGuard(req: any, res: any): Promise<void> {
  if (req.method !== 'POST') return void json(res, 405, { ok: false });

  const ip = clientIp(req);
  if (!ip || rateLimited(ip)) return void json(res, 200, { ok: true });

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body ?? {};
  const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200);
  const deviceHash = String(body?.deviceHash ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
  if (!email.includes('@') || email.length < 5) return void json(res, 200, { ok: true });

  const project = process.env.FIREBASE_PROJECT_ID ?? process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';
  if (!project) return void json(res, 200, { ok: true });

  try {
    // hanya akun staff yang dilindungi di sini
    const found = await fbQuery(project, 'users', [{ field: 'email', op: 'EQUAL', value: { stringValue: email } }], 1);
    const acc = found[0];
    const role = String(acc?.fields?.role ?? 'user');
    if (!acc || (role !== 'admin' && role !== 'developer')) return void json(res, 200, { ok: true });

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
      await fbCreateDoc(project, 'guardlog', `lg_${now}_${Math.random().toString(36).slice(2, 6)}`, {
        uid: fsS(acc.id), name: fsS(String(acc.fields?.name ?? 'Admin')), role: fsS(role),
        chatId: fsS(''), chatName: fsS('Login guard'), chatType: fsS('system'),
        kind: fsS('login_attempt'), reason: fsS(`percobaan login gagal ke akun ${role} (ke-${state.count} dari ${MAX_TRIES})`),
        excerpt: fsS(`IP hash ${ipHashShort.slice(0, 16)}… · perangkat ${deviceHash ? deviceHash.slice(0, 10) + '…' : 'tidak diketahui'}`),
        action: fsS('dimonitor — ban otomatis pada percobaan ke-3'),
        until: fsInt(0), byCaller: fsS('login-guard'), msgId: fsS(''), at: fsInt(now),
      });
      await pushToUsers(project, [String(acc.id)], `⚠️ Percobaan login akun ${role}`, `Percobaan gagal ke-${state.count} ke ${email} dari IP/perangkat tak dikenal. Ban otomatis pada percobaan ke-${MAX_TRIES}.`);
      return void json(res, 200, { ok: true });
    }

    // ===== BAN OTOMATIS IP + PERANGKAT =====
    //   3-5x gagal dalam 15 menit  → ban 6 JAM;  6x+ gagal → ban PERMANEN.
    // Akun TIDAK pernah diblokir — hanya sumber (IP/perangkat) penyerang.
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
    await pushToUsers(project, [String(acc.id)], permanent ? '🛡️ Serangan diblokir permanen' : '🛡️ Sumber dicurigai diblokir 6 jam',
      `${state.count}x percobaan gagal ke akun ${role} (${email}). IP & perangkat penyerang ${permanent ? 'diblokir PERMANEN' : 'diblokir 6 jam'} otomatis.`);
    return void json(res, 200, { ok: true, banned: true });
  } catch {
    return void json(res, 200, { ok: true });
  }
}

// ============================================================ router
export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = String(req.query?.action ?? '').toLowerCase().replace(/[^a-z-]/g, '');
  switch (action) {
    case 'ban-gate':
    case 'bangate':
    case 'gate':
      return actionBanGate(req, res);
    case 'ip-ban':
    case 'ipban':
    case 'ip':
      return actionIpBan(req, res);
    case 'login-guard':
    case 'loginguard':
      return actionLoginGuard(req, res);
    default:
      // fallback tanpa action (klien lama yang memanggil /api/guard mentah):
      // GET → info IP; POST ber-deviceHash → ban-gate
      if (req.method === 'GET') return actionIpBan(req, res);
      return actionBanGate(req, res);
  }
}
