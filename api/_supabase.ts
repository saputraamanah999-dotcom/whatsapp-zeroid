/// <reference types="node" />
/**
 * Supabase helper SERVER-SIDE (dipakai api/upload.ts, api/sylvatica.ts, api/supabase-seed.ts).
 * Kunci SERVICE ROLE hanya hidup di sini (Vercel env) — tidak pernah dikirim ke client.
 *
 * Fungsi utama:
 *  - supabaseEnv()  : baca env (null bila belum dipasang → fitur graceful skip)
 *  - ensureBucket() : pastikan bucket `zeroid` (public) ada — dibuat otomatis
 *  - upStorage()    : upload buffer → Supabase Storage → URL publik PERMANEN
 *  - logMedia()     : catat metadata unggahan ke tabel zeroid_media (best effort)
 */

export const SB_BUCKET = 'zeroid';

export function supabaseEnv(): { url: string; serviceKey: string } | null {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? '';
  if (!url || !serviceKey || !/^https:\/\//.test(url)) return null;
  return { url, serviceKey };
}

/** Buat bucket public `zeroid` bila belum ada (idempotent, best effort). */
export async function ensureBucket(env: { url: string; serviceKey: string }): Promise<boolean> {
  try {
    const r = await fetch(`${env.url}/storage/v1/bucket/${SB_BUCKET}`, {
      headers: { authorization: `Bearer ${env.serviceKey}`, apikey: env.serviceKey },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) return true;
    if (r.status !== 404 && r.status !== 400) return false;
    const c = await fetch(`${env.url}/storage/v1/bucket`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.serviceKey}`, apikey: env.serviceKey, 'content-type': 'application/json' },
      body: JSON.stringify({ id: SB_BUCKET, name: SB_BUCKET, public: true, file_size_limit: 104857600 }),
      signal: AbortSignal.timeout(10000),
    });
    return c.ok || c.status === 400; // 400 = sudah ada
  } catch {
    return false;
  }
}

/**
 * Upload buffer ke Supabase Storage → URL publik permanen.
 * Path: zeroid/<kind>/<uid>/<timestamp>-<name> (folder per jenis & pengguna).
 */
export async function upStorage(
  env: { url: string; serviceKey: string },
  buf: Buffer,
  mime: string,
  name: string,
  kind = 'file'
): Promise<{ url: string; path: string } | null> {
  try {
    await ensureBucket(env);
    const safe = name.replace(/[^\w.\-() ]/g, '_').slice(0, 80) || 'file';
    const path = `${SB_BUCKET}/${kind}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const r = await fetch(`${env.url}/storage/v1/object/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.serviceKey}`,
        apikey: env.serviceKey,
        'content-type': mime || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: new Uint8Array(buf),
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const url = `${env.url}/storage/v1/object/public/${path}`;
    return { url, path };
  } catch {
    return null;
  }
}

/** Catat metadata ke tabel zeroid_media (best effort — gagal diabaikan). */
export async function logMedia(
  env: { url: string; serviceKey: string },
  row: Record<string, any>
): Promise<void> {
  try {
    await fetch(`${env.url}/rest/v1/zeroid_media`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.serviceKey}`,
        apikey: env.serviceKey,
        'content-type': 'application/json',
        prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* metadata tidak kritis */
  }
}
