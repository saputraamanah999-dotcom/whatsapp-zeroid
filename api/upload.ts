/// <reference types="node" />
/**
 * Vercel serverless — media upload to EXTERNAL file hosts (NOT Firebase Storage,
 * per project spec). The Firebase API key never touches this flow; users prove
 * identity with a Firebase ID token that is verified KEYLESSLY against Google's
 * public x509 certificates (no Admin SDK / service account needed).
 *
 * Body (JSON): { token, projectId, name, mime, kind, dataBase64 }
 * Reply (JSON): { ok, url, provider, expiresAt? }
 *
 * Provider chain (each verified live before shipping):
 *   1. ImgBB  (only when IMGBB_KEY env is set) — permanent images, needs free key
 *   2. x0.at  — no key, long retention (30d-1y for small files)  [tested OK]
 *   3. uguu.se — no key, 3 hour retention                        [tested OK]
 *   4. tmpfiles.org — no key, 1 hour retention                   [tested OK]
 * Temporary providers return expiresAt so the client can be honest about it.
 *
 * Guards: ID-token signature check, banned-user check (Firestore REST), per-UID
 * rate limit, strict MIME allowlist + magic-byte sniffing, size cap (serverless
 * request bodies max ~4.5 MB → base64 payload capped at 3.2 MB decoded).
 */
import crypto from 'node:crypto';
import { supabaseEnv, upStorage, logMedia } from './_supabase';

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

const MAX_BYTES = Math.floor(3.2 * 1024 * 1024);
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_MAX = 40;

const uploads = new Map<string, number[]>();
function rateLimited(uid: string): boolean {
  const now = Date.now();
  const arr = (uploads.get(uid) ?? []).filter((t) => now - t < RATE_WINDOW);
  if (arr.length >= RATE_MAX) { uploads.set(uid, arr); return true; }
  arr.push(now);
  uploads.set(uid, arr);
  return false;
}

// ---------------- Firebase ID token verification (keyless) ----------------

type JwtPayload = { aud?: string; iss?: string; exp?: number; iat?: number; sub?: string; user_id?: string };

function b64urlToJson(s: string): any {
  return JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

let certsCache: { at: number; certs: Record<string, string> } | null = null;

async function googleCerts(): Promise<Record<string, string>> {
  if (certsCache && Date.now() - certsCache.at < 3600_000) return certsCache.certs;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  if (!r.ok) throw new Error('cert_fetch_failed');
  const certs = (await r.json()) as Record<string, string>;
  certsCache = { at: Date.now(), certs };
  return certs;
}

async function verifyIdToken(token: string, projectId: string): Promise<string | null> {
  const parts = token.split('.');
  // NOTE: Firebase project IDs can legitimately be as short as 4 chars
  // ("projekwhattsaf" is 14). The old `length < 20` guard rejected EVERY valid
  // token for this project — the root cause of "Sesi tidak valid" on upload.
  if (parts.length !== 3 || !projectId || projectId.length < 4) return null;
  let header: any, payload: JwtPayload;
  try { header = b64urlToJson(parts[0]); payload = b64urlToJson(parts[1]); } catch { return null; }
  if (header?.alg !== 'RS256') return null;
  let pem: string | undefined;
  try { pem = (await googleCerts())[header.kid]; } catch { return null; }
  if (!pem) return null;
  const sig = Buffer.from(parts[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const ok = crypto.createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(pem, sig);
  if (!ok) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.exp || payload.exp < now || now < (payload.iat ?? 0)) return null;
  return payload.user_id ?? payload.sub ?? null;
}

/** Banned-user check through Firestore REST (rules let users read their own doc). */
async function isBanned(projectId: string, token: string, uid: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?mask.fieldPaths=banned`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return false;
    const d: any = await r.json();
    return d?.fields?.banned?.booleanValue === true;
  } catch { return false; }
}

// ---------------- validation ----------------

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mp4', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'application/pdf', 'text/plain', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

/** Magic-byte sniff — never trust the declared mime alone. */
function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  const h = buf.subarray(0, 12);
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return 'image/jpeg';
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return 'image/png';
  if (h.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (h.toString('ascii', 4, 8) === 'ftyp') return h.toString('ascii', 8, 12).startsWith('qt') ? 'video/quicktime' : 'video/mp4';
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return 'video/webm'; // matroska/webm
  if (h.toString('ascii', 0, 4) === 'OggS') return 'audio/ogg';
  if (h.toString('ascii', 0, 3) === 'ID3' || (h[0] === 0xff && (h[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (h.toString('ascii', 0, 4) === '%PDF') return 'application/pdf';
  if (h[0] === 0x50 && h[1] === 0x4b) return 'application/zip'; // also docx/xlsx/pptx
  return null;
}

const safeName = (n: string) => n.replace(/[^\w.\-() ]/g, '_').replace(/\.{2,}/g, '.').slice(0, 90) || 'file';

// ---------------- providers ----------------

/**
 * Supabase Storage — PERMANEN (milik project sendiri). Prioritas pertama untuk
 * video/audio/dokumen; gambar tetap coba ImgBB dulu (CDN cepat), lalu Supabase.
 */
async function upSupabase(buf: Buffer, name: string, mime: string, kind: string, uid: string): Promise<{ url: string } | null> {
  const env = supabaseEnv();
  if (!env) return null;
  const up = await upStorage(env, buf, mime, name, `${kind}/${uid}`);
  if (!up) return null;
  void logMedia(env, { kind, url: up.url, path: up.path, mime, size: buf.length, owner: uid, created_at: new Date().toISOString() });
  return { url: up.url };
}

async function upImgbb(buf: Buffer, mime: string): Promise<{ url: string } | null> {
  const key = process.env.IMGBB_KEY ?? '';
  if (!key || !mime.startsWith('image/')) return null;
  const fd = new FormData();
  fd.append('image', new Blob([new Uint8Array(buf)], { type: mime }), 'image');
  const r = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(key)}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) });
  if (!r.ok) return null;
  const j: any = await r.json().catch(() => null);
  const url = j?.data?.display_url ?? j?.data?.url;
  return typeof url === 'string' && /^https:\/\//.test(url) ? { url } : null;
}

async function upX0(buf: Buffer, name: string, mime: string): Promise<{ url: string } | null> {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buf)], { type: mime }), name);
  const r = await fetch('https://x0.at/', { method: 'POST', body: fd, headers: { 'user-agent': 'zeroid-upload/1.0' }, signal: AbortSignal.timeout(45000) });
  if (!r.ok) return null;
  const url = (await r.text()).trim();
  return /^https:\/\//.test(url) ? { url } : null;
}

async function upUguu(buf: Buffer, name: string, mime: string): Promise<{ url: string; expiresAt: number } | null> {
  const fd = new FormData();
  fd.append('files[]', new Blob([new Uint8Array(buf)], { type: mime }), name);
  const r = await fetch('https://uguu.se/upload?output=json', { method: 'POST', body: fd, signal: AbortSignal.timeout(45000) });
  if (!r.ok) return null;
  const j: any = await r.json().catch(() => null);
  const url = j?.files?.[0]?.url;
  return typeof url === 'string' && /^https:\/\//.test(url) ? { url, expiresAt: Date.now() + 3 * 3600_000 } : null;
}

async function upTmpfiles(buf: Buffer, name: string, mime: string): Promise<{ url: string; expiresAt: number } | null> {
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(buf)], { type: mime }), name);
  const r = await fetch('https://tmpfiles.org/api/v1/upload', { method: 'POST', body: fd, signal: AbortSignal.timeout(45000) });
  if (!r.ok) return null;
  const j: any = await r.json().catch(() => null);
  const page = j?.data?.url;
  if (typeof page !== 'string' || !/^https:\/\//.test(page)) return null;
  // page URL → direct download URL (tmpfiles.org/{id}/f → tmpfiles.org/dl/{id}/f)
  const url = page.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  return { url, expiresAt: Date.now() + 3600_000 };
}

/** Cheap liveness check — a provider URL that does not answer is not a success. */
async function urlAlive(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-0' }, signal: AbortSignal.timeout(12000) });
    return r.status === 200 || r.status === 206;
  } catch { return false; }
}

const bad = (res: any, status: number, error: string) => res.status(status).json({ error });

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'zeroid-upload' });
  if (req.method !== 'POST') return bad(res, 405, 'Method not allowed');

  let body: any;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return bad(res, 400, 'Body tidak valid.'); }
  const token = String(body?.token ?? '');
  const projectId = String(body?.projectId ?? '');
  const name = safeName(String(body?.name ?? 'file'));
  const mime = String(body?.mime ?? '').toLowerCase().split(';')[0].trim();
  const b64 = String(body?.dataBase64 ?? '');

  if (!token || !projectId) return bad(res, 401, 'Autentikasi diperlukan.');
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) return bad(res, 400, 'File kosong.');
  if (buf.length > MAX_BYTES) return bad(res, 413, `File terlalu besar (maks ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB di server ini).`);

  const uid = await verifyIdToken(token, projectId);
  if (!uid) return bad(res, 401, 'Sesi tidak valid. Masuk ulang lalu coba lagi.');
  if (rateLimited(uid)) return bad(res, 429, 'Terlalu banyak unggahan. Coba lagi beberapa menit lagi.');
  if (await isBanned(projectId, token, uid)) return bad(res, 403, 'Akun diblokir — tidak dapat mengunggah.');

  if (!ALLOWED_MIME.has(mime)) return bad(res, 415, `Jenis file tidak didukung (${mime || 'tidak dikenal'}).`);
  const sniffed = sniff(buf);
  // Pengecualian container yang memang identik secara format:
  //  - webm audio (VN Chrome/Firefox) terdeteksi sebagai 'video/webm' (magic byte Matroska sama)
  //  - audio/mp4 & audio/m4a terdeteksi sebagai 'video/mp4' (box ftyp sama)
  const containerAlias =
    (sniffed === 'video/webm' && (mime === 'audio/webm' || mime === 'video/webm')) ||
    (sniffed === 'video/mp4' && (mime === 'audio/mp4' || mime === 'audio/m4a')) ||
    (sniffed === 'audio/wav' && mime === 'video/webm'); // opus di RIFF jarang, guard lembut
  if (!sniffed || (sniffed !== mime && !containerAlias)) {
    return bad(res, 415, 'Isi file tidak cocok dengan jenis yang diklaim.');
  }

  const tries: Array<() => Promise<{ url: string; expiresAt?: number } | null>> = [
    // gambar: ImgBB dulu (CDN + permanen) → Supabase Storage (permanen) → host sementara.
    // video/audio/dokumen: Supabase Storage dulu (permanen!) → host sementara.
    () => (mime.startsWith('image/') ? upImgbb(buf, mime) : Promise.resolve(null)),
    () => upSupabase(buf, name, mime, mime.startsWith('image/') ? 'images' : 'files', uid),
    () => upX0(buf, name, mime),
    () => upUguu(buf, name, mime),
    () => upTmpfiles(buf, name, mime),
  ];
  for (const p of tries) {
    try {
      const r = await p();
      if (!r) continue;
      if (!(await urlAlive(r.url))) continue;
      return res.status(200).json({ ok: true, url: r.url, provider: new URL(r.url).host, ...(r.expiresAt ? { expiresAt: r.expiresAt } : {}) });
    } catch { /* next provider */ }
  }
  return bad(res, 502, 'Semua layanan hosting sedang gagal. Coba lagi beberapa saat.');
}
