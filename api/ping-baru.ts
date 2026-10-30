/** Uji sementara — bukti bahwa fungsi baru bisa dibangun. DIHAPUS setelah diagnosis. */
export const config = { runtime: 'nodejs' };

export default async function handler(_req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, ping: 'baru' });
}
