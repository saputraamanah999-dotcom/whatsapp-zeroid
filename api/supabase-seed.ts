/// <reference types="node" />
/**
 * Vercel serverless — SEED SUPABASE OTOMATIS.
 * Membuat tabel (zeroid_media, zeroid_stickers, zeroid_bans), bucket Storage
 * publik `zeroid`, dan semua policy — sekali jalan, idempotent (aman diulang).
 *
 * Cara pakai: tombol "Seed Supabase" di Admin Panel mengirim Firebase ID token
 * admin (role admin/developer). Token diverifikasi KEYLESS terhadap sertifikat
 * publik Google (tanpa service account), sama seperti api/upload.ts.
 *
 * Koneksi: env POSTGRES_URL_NON_POOLING (port 5432 langsung) — DDL butuh koneksi
 * non-pooler. Bila env tidak ada, endpoint mengembalikan panduan singkat.
 */
import crypto from 'node:crypto';
import { Client } from 'pg';

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

// ---- keyless Firebase ID-token verification (sama seperti api/upload.ts) ----
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

async function verifyAdmin(token: string, projectId: string): Promise<string | null> {
  const parts = token.split('.');
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
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.exp || payload.exp < now) return null;
  return payload.user_id ?? payload.sub ?? null;
}

/** Cek role admin lewat Firestore REST (token = identitas, mask hanya field role). */
async function isAdmin(projectId: string, token: string, uid: string): Promise<boolean> {
  try {
    const r = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?mask.fieldPaths=role&mask.fieldPaths=developer`,
      { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return false;
    const d: any = await r.json();
    const role = d?.fields?.role?.stringValue ?? '';
    return role === 'admin' || role === 'developer' || d?.fields?.developer?.booleanValue === true;
  } catch { return false; }
}

const DDL = `
create table if not exists public.zeroid_media (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'file',
  url text not null,
  path text,
  mime text,
  size bigint,
  owner text,
  created_at timestamptz not null default now()
);
create index if not exists zeroid_media_owner_idx on public.zeroid_media (owner);
create index if not exists zeroid_media_created_idx on public.zeroid_media (created_at desc);
create table if not exists public.zeroid_stickers (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  url text not null,
  source text not null default 'brat',
  created_at timestamptz not null default now(),
  unique (owner, url)
);
create index if not exists zeroid_stickers_owner_idx on public.zeroid_stickers (owner);
create table if not exists public.zeroid_bans (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('user','chat')),
  target_id text not null,
  reason text not null default '',
  duration_ms bigint not null default 0,
  banned_by text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  appeal text,
  appeal_status text check (appeal_status in ('pending','approved','rejected')),
  appeal_note text,
  resolved_at timestamptz
);
create index if not exists zeroid_bans_target_idx on public.zeroid_bans (target_kind, target_id);
insert into storage.buckets (id, name, public, file_size_limit)
values ('zeroid','zeroid',true,104857600) on conflict (id) do nothing;
drop policy if exists "zeroid public read" on storage.objects;
create policy "zeroid public read" on storage.objects for select using (bucket_id = 'zeroid');
drop policy if exists "zeroid anon upload" on storage.objects;
create policy "zeroid anon upload" on storage.objects for insert to anon, authenticated with check (bucket_id = 'zeroid');
alter table public.zeroid_media enable row level security;
alter table public.zeroid_stickers enable row level security;
alter table public.zeroid_bans enable row level security;
drop policy if exists "zeroid_media read" on public.zeroid_media;
create policy "zeroid_media read" on public.zeroid_media for select using (true);
drop policy if exists "zeroid_stickers read" on public.zeroid_stickers;
create policy "zeroid_stickers read" on public.zeroid_stickers for select using (true);
drop policy if exists "zeroid_bans read" on public.zeroid_bans;
create policy "zeroid_bans read" on public.zeroid_bans for select using (true);
`;

const bad = (res: any, status: number, error: string) => res.status(status).json({ ok: false, error });

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'GET') return bad(res, 405, 'Method not allowed');

  const projectId = process.env.FIREBASE_PROJECT_ID ?? String(req.query?.projectId ?? '');
  const token = String(req.method === 'GET' ? req.query?.token : req.body?.token ?? '');
  if (!projectId || !token) return bad(res, 401, 'Token admin diperlukan.');
  const uid = await verifyAdmin(token, projectId);
  if (!uid) return bad(res, 401, 'Sesi tidak valid — masuk ulang sebagai admin.');
  if (!(await isAdmin(projectId, token, uid))) return bad(res, 403, 'Hanya admin yang bisa menjalankan seed.');

  const conn = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL ?? '';
  if (!conn) {
    return bad(res, 503,
      'POSTGRES_URL_NON_POOLING belum dipasang. Tambahkan di Vercel > Settings > Environment Variables, lalu redeploy.'
    );
  }

  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query(DDL);
    const { rows } = await client.query<{ count: string }>(
      "select count(*)::text as count from information_schema.tables where table_schema='public' and table_name like 'zeroid_%'"
    );
    await client.end();
    return res.status(200).json({
      ok: true,
      message: 'Seed Supabase selesai: tabel zeroid_media, zeroid_stickers, zeroid_bans + bucket zeroid siap.',
      tables: Number(rows[0]?.count ?? 0),
      bucket: 'zeroid (public, max 100MB/file)',
    });
  } catch (e: any) {
    try { await client.end(); } catch { /* ignore */ }
    return bad(res, 500, `Seed gagal: ${String(e?.message ?? e).slice(0, 200)}`);
  }
}
