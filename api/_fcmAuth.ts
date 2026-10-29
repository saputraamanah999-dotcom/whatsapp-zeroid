/// <reference types="node" />
/**
 * Helper FCM HTTP v1 (server-only) — OAuth2 access token dari Service Account.
 *
 * Legacy FCM API (server key `AAAA...`) sudah DIMATIKAN Google (Juni 2024) dan
 * project Firebase baru tidak memilikinya. Penggantinya: HTTP v1 yang
 * terotentikasi via JWT RS256 dari JSON service account.
 *
 * Env (hanya server / Vercel — JANGAN pernah EXPO_PUBLIC_):
 *   FIREBASE_SERVICE_ACCOUNT  = isi penuh JSON service account (raw / base64)
 *   FCM_SERVER_KEY            = (opsional) legacy server key — fallback project lama
 *
 * Tanpa dependency eksternal: JWT ditandatangani pakai node:crypto.
 */
import crypto from 'crypto';

type Sa = { client_email?: string; private_key?: string; project_id?: string };

let cached: { token: string; exp: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Ambil & parse service account dari env (dukung raw JSON maupun base64). */
export function parseServiceAccount(): Sa | null {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  try {
    let json = raw;
    if (!json.startsWith('{')) json = Buffer.from(json, 'base64').toString('utf8');
    const sa = JSON.parse(json);
    if (!sa.client_email || !sa.private_key) return null;
    return sa as Sa;
  } catch {
    return null;
  }
}

export function serviceAccountProject(): string | null {
  return parseServiceAccount()?.project_id ?? null;
}

/** Access token OAuth2 (cache sampai mendekati kedaluwarsa). Null bila env tidak lengkap. */
export async function fcmAccessToken(): Promise<string | null> {
  const sa = parseServiceAccount();
  if (!sa) return null;
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat,
    exp: iat + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/instance.id',
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  let signature: string;
  try {
    signature = b64url(signer.sign(sa.private_key!.replace(/\\n/g, '\n')));
  } catch {
    return null;
  }
  const jwt = `${header}.${claims}.${signature}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return null;
  const data = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cached = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}

export const FCM_V1_BASE = 'https://fcm.googleapis.com/v1/projects';
