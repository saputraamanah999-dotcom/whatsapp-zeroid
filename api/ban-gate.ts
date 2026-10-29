/// <reference types="node" />
/**
 * /api/ban-gate — GERBANG SERVER anti ban-evasion ZEROID.
 *
 * Dipanggil klien (POST JSON { deviceHash?, email? }) SEBELUM:
 *  - membuat akun baru (email/password maupun Google),
 *  - login dengan akun apa pun.
 *
 * Server menghitung sendiri hash IP pemanggil (x-forwarded-for / Vercel header),
 * lalu membaca Firestore via REST dengan hak service account (TIDAK bisa
 * dimanipulasi klien):
 *   banips/{sha256(ip)}        → blokir per IP
 *   banips/{s24_sha256(subnet)} → blokir per /24 (IPv4) atau /64 prefix (IPv6)
 *   devices/{deviceHash}       → blokir per perangkat
 *
 * Respons:
 *   { blocked: true, until, reason, bannedEmail, matchedBy }
 *   bannedEmail = email akun yang dibanned. SATU-SATUNYA akun yang boleh
 *   masuk pada perangkat/IP ini adalah email itu sendiri (lihat info ban +
 *   tulis banding ke developer) — akun lain / akun baru DITOLAK.
 *
 * Env (hanya server): FIREBASE_SERVICE_ACCOUNT — sama dengan FCM.
 */
import crypto from 'node:crypto';
import { parseServiceAccount } from './_fcmAuth';

export const config = { runtime: 'nodejs' };

let dsToken: { token: string; exp: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Access token OAuth2 dengan scope Firestore datastore (cache terpisah dari FCM). */
async function accessToken(): Promise<string | null> {
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

function clientIp(req: any): string {
  const h = req.headers ?? {};
  const xff = String(h['x-forwarded-for'] ?? '');
  const first = xff.split(',')[0].trim();
  const ip = first || String(h['x-real-ip'] ?? h['cf-connecting-ip'] ?? h['x-vercel-forwarded-for'] ?? '').trim();
  // Vercel menyimpan IP asli di sini bila di belakang proxy tambahan
  return ip.replace(/^::1$/, '').slice(0, 45);
}

function sha(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/** id dokumen banips: hash IP penuh + hash subnet (lebih lebar, anti ganti-WiFi-IP). */
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

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = clientIp(req);
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body ?? {};
  const deviceHash = String(body.deviceHash ?? '').slice(0, 80);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 120);

  const sa = parseServiceAccount();
  if (!sa) {
    // service account belum dipasang → klien akan fallback ke baca Firestore langsung
    return res.status(200).json({ blocked: false, degraded: true, ipHash: ip ? sha(ip) : '' });
  }
  const token = await accessToken();
  if (!token) return res.status(200).json({ blocked: false, degraded: true, ipHash: ip ? sha(ip) : '' });
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
    return res.status(200).json({
      blocked: true,
      until,
      reason: String(d.reason ?? 'Perangkat/IP tercatat pada akun yang diblokir admin.'),
      bannedEmail,
      matchedBy: by,
      own: !!email && !!bannedEmail && email === bannedEmail, // email yang dibanned boleh masuk
    });
  }
  return res.status(200).json({ blocked: false, ipHash: ip ? sha(ip) : '', subnet: ipHashes(ip)[1] ?? '' });
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return {}; }
}
