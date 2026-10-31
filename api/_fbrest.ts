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
/** Timestamp SAFI untuk documents:create (serverValue hanya sah di commit).
 *  WAJIB dipakai utk createdAt pesan bot/guard — kalau integerValue, pesan
 *  urut DI BAWAH semua pesan timestamp (tipe number < timestamp di Firestore). */
export const fsTimeMs = (v?: number) => ({ timestampValue: new Date(Number(v) || Date.now()).toISOString() });

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
  // PENGAMAN (v23): {serverValue:'REQUEST_TIME'} hanya sah di API commit —
  // di documents:create Firestore menolak SELURUH dokumen (400) sehingga
  // bot/guard bisu tanpa jejak. Konversi otomatis ke epoch ms.
  const cleanFields = sanitizeCreateFields(fields);
  try {
    const r = await fetch(`${base(project, parentPath)}?documentId=${encodeURIComponent(docId)}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ fields: cleanFields }),
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/** Ganti {serverValue:'REQUEST_TIME'} dengan {integerValue: Date.now()} secara rekursif. */
function sanitizeCreateFields(fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields ?? {})) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ((v as any).serverValue === 'REQUEST_TIME') { out[k] = { timestampValue: new Date().toISOString() }; continue; }
      if ((v as any).mapValue?.fields) {
        out[k] = { mapValue: { fields: sanitizeCreateFields((v as any).mapValue.fields) } };
        continue;
      }
      if ((v as any).arrayValue?.values) {
        out[k] = { arrayValue: { values: (v as any).arrayValue.values.map((x: any) => {
          if (x && typeof x === 'object' && x.serverValue === 'REQUEST_TIME') return { timestampValue: new Date().toISOString() };
          if (x && typeof x === 'object' && x.mapValue?.fields) return { mapValue: { fields: sanitizeCreateFields(x.mapValue.fields) } };
          return x;
        }) } };
        continue;
      }
    }
    out[k] = v;
  }
  return out;
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

/** DELETE dokumen (service account). */
export async function fbDeleteDoc(project: string, path: string): Promise<boolean> {
  const tok = await googleAccessToken(DATASTORE_SCOPE);
  if (!tok) return false;
  try {
    const r = await fetch(base(project, path), {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tok}` },
      signal: AbortSignal.timeout(10000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * QUERY dokumen (service account) — structuredQuery di lingkup parentPath.
 * `filters`: [{field, op: 'EQUAL'|'GREATER_THAN'|'LESS_THAN'|'IN', value}] —
 * value SUDAH berbentuk Firestore value ({stringValue}, {timestampValue}, …).
 * Mengembalikan array dokumen ter-decode (id + fields).
 */
export async function fbQuery(
  project: string,
  parentPath: string,
  filters: { field: string; op: string; value: any }[],
  limitN = 20,
  orderBy?: { field: string; desc?: boolean }
): Promise<{ id: string; fields: Record<string, any> }[]> {
  const tok = await googleAccessToken(DATASTORE_SCOPE);
  if (!tok) return [];
  const seg = parentPath.split('/').filter(Boolean);
  const collectionId = seg.pop() ?? '';
  const structured: any = {
    from: [{ collectionId, allDescendants: false }],
    limit: Math.max(1, Math.min(limitN, 200)),
  };
  if (filters.length === 1) {
    structured.where = { fieldFilter: { field: { fieldPath: filters[0].field }, op: filters[0].op, value: filters[0].value } };
  } else if (filters.length > 1) {
    structured.where = {
      compositeFilter: {
        op: 'AND',
        filters: filters.map((c) => ({ fieldFilter: { field: { fieldPath: c.field }, op: c.op, value: c.value } })),
      },
    };
  }
  if (orderBy) structured.orderBy = [{ field: { fieldPath: orderBy.field }, direction: orderBy.desc ? 'DESCENDING' : 'ASCENDING' }];
  const scope = seg.length ? `${seg.join('/')}/` : '';
  try {
    const r = await fetch(`${base(project, scope)}:runQuery`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
      body: JSON.stringify({ structuredQuery: structured }),
      signal: AbortSignal.timeout(12000),
    });
    if (!r.ok) return [];
    const lines = (await r.json()) as any[];
    const out: { id: string; fields: Record<string, any> }[] = [];
    for (const line of Array.isArray(lines) ? lines : []) {
      const doc = line?.document;
      if (!doc) continue;
      out.push({ id: String(doc.name ?? '').split('/').pop() ?? '', fields: decodeFsFields(doc.fields ?? {}) });
    }
    return out;
  } catch {
    return [];
  }
}

// ---------- server secrets (fallback env) ----------
/**
 * KUNCI API SERVER — sumber ganda:
 *  1. env Vercel (utama),
 *  2. dokumen Firestore `secrets/ai` (cadangan OTOMATIS via service account).
 *
 * Dokumen `secrets/ai` DILARANG dibaca/ditulis semua klien (rules: false) —
 * hanya kode server yang punya service account bisa membacanya. Dipakai supaya
 * menambah penyedia (mis. VEXO) TIDAK perlu buka dashboard Vercel: cukup seed
 * via service account (CI deploy-rules) dan aplikasi langsung memakainya.
 */
let fsSecretsCache: { at: number; data: Record<string, string> } | null = null;

export async function serverSecrets(): Promise<Record<string, string>> {
  if (fsSecretsCache && Date.now() - fsSecretsCache.at < 600_000) return fsSecretsCache.data;
  const project = process.env.FIREBASE_PROJECT_ID ?? process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '';
  if (!project) return {};
  const doc = await fbGetDoc(project, 'secrets/ai');
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(doc ?? {})) {
    if (typeof v === 'string' && v.trim() && !k.startsWith('_')) data[k] = v.trim();
  }
  if (Object.keys(data).length) fsSecretsCache = { at: Date.now(), data };
  return data;
}

/** Kunci API: env dulu, lalu Firestore secrets/ai (cadangan otomatis). */
export async function apiKey(name: string): Promise<string> {
  return process.env[name] || (await serverSecrets())[name] || '';
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
