/// <reference types="node" />
/**
 * /api/ip-ban — ZEROID anti ban-evasion.
 *
 * GET  → { ip, hash } : IP publik pemanggil (x-forwarded-for / Vercel headers)
 *        + sha256(ip) sebagai id dokumen `banips/{hash}`. TIDAK menyimpan apa pun.
 *
 * Cara pakai (client):
 *  - user dibanned  → client menulis banips/{hash} { uid, until } (rules v9
 *    hanya mengizinkan user yang sedang dibanned) + bans/{uid}.lastIp/ips.
 *  - daftar akun baru / login Google akun baru → client membaca banips/{hash};
 *    ada & belum kedaluwarsa → DITOLAK ("dilarang buat akun baru").
 *
 * IP tidak pernah tampil mentah ke user lain — hanya hash-nya yang jadi id dokumen.
 */
import crypto from 'node:crypto';

export const config = { runtime: 'nodejs' };

function clientIp(req: any): string {
  const h = req.headers ?? {};
  const xff = String(h['x-forwarded-for'] ?? '');
  const first = xff.split(',')[0].trim();
  if (first) return first;
  return String(h['x-real-ip'] ?? h['cf-connecting-ip'] ?? h['x-vercel-forwarded-for'] ?? '').trim();
}

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ip = clientIp(req);
  if (!ip) return res.status(200).json({ ip: '', hash: '' });
  const hash = crypto.createHash('sha256').update(String(ip), 'utf8').digest('hex');
  return res.status(200).json({ ip: ip.slice(0, 45), hash });
}
