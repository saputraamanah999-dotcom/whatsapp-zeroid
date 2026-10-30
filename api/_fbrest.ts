/// <reference types="node" />
/**
 * FIRESTORE + IDENTITY REST (server-only, TANPA dependency firebase-admin).
 * Dipakai /api/ai (bot-reply) untuk:
 *  - verifikasi Firebase ID token pengirim (Identity Toolkit accounts:lookup)
 *  - membaca dokumen chat (keanggotaan) dengan kredensial SERVICE ACCOUNT
 *  - menulis pesan bot + memperbarui chat (bypass rules secara aman —
 *    hanya kode server yang punya kunci)
 *
 * Kredensial dari env FIREBASE_SERVICE_ACCOUNT (raw JSON / base64) — kunci
 * tidak pernah keluar dari server. Web API key diambil dari
 * EXPO_PUBLIC_FIREBASE_API_KEY (nilai publik yang memang untuk client).
 */
import crypto from 'crypto';
import { parseServiceAccount } from './_fcmAuth';

const tokCache = new Map<string, { token: string; exp: number }>();

/** Access token OAuth2 untuk scope tertentu (cache per scope). */
export async function googleAccessToken(scope: string): Promise<string | null> {
  const sa = parseServiceAccount();
  if (!sa) return null;
  const hit = tokCache.get(scope);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;

  const iat = Math.floor(Date.now() / 1000);
  const b64 = (s: Buffer | string) =>
    Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600, scope,
  }));
  let sig: string;
  try {
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(`${header}.${claims}`);
    sig = b64(signer.sign(sa.private_key!.replace(/\\n/g, '\n')));
  } catch {
    return null;
  }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${sig}` }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { access_token?: string; expires_in?: number };
    if (!d.access_token) return null;
    tokCache.set(scope, { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 });
    return d.access_token;
  } catch {
    return null;
  }
}

const DATASTORE_SCOPE = 'https://www.googleapis.com/auth/datastore';

function base(project: string, path: string): string {
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`;
}

// ---------- value encoders (Firestore REST typed values) ----------
export const fsStr = (v: string) => ({ stringValue: String(v).slice(0, 4000) });
export const fsNum = (v: number) => ({ doubleValue: Number(v) || 0 });
export const fsInt = (v: number) => ({ integerValue: String(Math.round(Number(v) || 0)) });
export const fsBool = (v: boolean) => ({ booleanValue: !!v });
export const fsNull = () => ({ nullValue: null });
export const fsArr = (vals: any[]) => ({ arrayValue: { values: vals } });
export const fsMap = (fields: Record<string, any>) => ({ mapValue: { fields } });
export const fsServerTime = () => ({ serverValue: 'REQUEST_TIME' });

// ---------- decoders ----------
export function decodeFsValue(v: any): any {
  if (v == null || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('integerValue' in v) return Number(v.integerValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decodeFsValue);
  if ('mapValue' in v) return decodeFsFields(v.mapValue.fields ?? {});
  return undefined;
}
export function decodeFsFields(fields: Record<string, any> | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields ?? {})) out[k] = decodeFsValue(v);
  return out;
}

// ---------- documents ----------
/** GET dokumen (service account). Null bila tidak ada / gagal. */
export async function fbGetDoc(project: string, path: string): Promise<Record<string, any> | null> {
  const tok = await googleAccessToken(DATASTORE_SCOPE);
  if (!tok) return null;
  try {
    const r = await fetch(base(project, path), {
      headers: { authorization: `Bearer ${tok}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    return d?.fields ? decodeFsFields(d.fields) : {};
  } catch {
    return null;
  }
}

/** CREATE dokumen dengan ID tertentu (service account). */
export async function fbCreateDoc(
  project: string,
  parentPath: string,
  docId: string,
  fields: Record<string, any>
): Promise<boolean> {
  const tok = await googleAccessToken(DATASTORE_SCOPE);
  if (!tok) return false;
  try {
    const r = await fetch(`${base(project, parentPath)}?documentId=${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** PATCH dokumen dengan updateMask merge (hanya field yang dikirim yang berubah). */
export async function fbPatchDoc(project: string, path: string, fields: Record<string, any>): Promise<boolean> {
  const tok = await googleAccessToken(DATASTORE_SCOPE);
  if (!tok) return false;
  const mask = Object.keys(fields).map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`).join('&');
  try {
    const r = await fetch(`${base(project, path)}${mask ? `?${mask}` : ''}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields }),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// ---------- identity ----------
/**
 * Verifikasi ID token pengguna lewat Identity Toolkit (accounts:lookup).
 * Hanya menerima token VALID yang belum kedaluwarsa → mengembalikan uid.
 * Ini OTENTIKASI; otorisasi (keanggotaan chat) tetap diperiksa terpisah.
 */
export async function verifyIdToken(idToken: string): Promise<{ uid: string; email?: string } | null> {
  const key = process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? process.env.FIREBASE_WEB_API_KEY ?? '';
  if (!key || !idToken || idToken.length < 20 || idToken.length > 4000) return null;
  try {
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d: any = await r.json();
    const uid = String(d?.users?.[0]?.localId ?? '');
    if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null;
    return { uid, email: d?.users?.[0]?.email };
  } catch {
    return null;
  }
}
