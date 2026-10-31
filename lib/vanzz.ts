/**
 * VANZZ API client (apiz.vsunsee.qzz.io) — SEMUA panggilan lewat server proxy
 * /api/vanzz. Kunci API tidak pernah ada di client. Fitur:
 *  - MENU GRATIS: cuaca, gempa, berita (6 sumber), quotes, anime, AM finder,
 *    jadwal sholat, TTS, dll.
 *  - STIKER: Brat teks/video/anime + Random Sticker Meme + Custom Meme v1/v2.
 *  - PRODUK BERBAYAR (Check Nomor, Netflix, AM Premium/Unlock): realisasi
 *    otomatis lewat action 'deliver' setelah admin konfirmasi pembayaran.
 * Transport: lib/proxy.ts + Firebase ID token (server memverifikasi user).
 */

import { proxyPost } from './proxy';
import { firebase } from './firebase';

export type VanzzCall = { ok: boolean; image?: string; data?: any; error?: string };

async function post(body: Record<string, any>, ms = 55000): Promise<VanzzCall> {
  const cu = firebase()?.auth.currentUser;
  if (!cu) return { ok: false, error: 'Masuk dulu untuk memakai fitur ini.' };
  const token = await cu.getIdToken();
  try {
    const data = await proxyPost('/api/vanzz', body, ms, { authorization: `Bearer ${token}` });
    return {
      ok: !!data?.ok,
      image: typeof data?.image === 'string' ? data.image : undefined,
      data: data?.data ?? data?.result ?? undefined,
      error: typeof data?.error === 'string' ? data.error : undefined,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? 'Gagal menghubungi server.').slice(0, 200) };
  }
}

/** Panggil endpoint gratis dari whitelist (lihat api/vanzz.ts FREE). */
export const vanzzCall = (key: string, params: Record<string, string> = {}, ms?: number) =>
  post({ action: 'call', key, params }, ms);

/** QRIS dinamis dari QRIS statis admin dengan nominal tertentu. */
export const vanzzQris = (amount: number) => post({ action: 'qris', amount }, 40000);

/** Realisasi pesanan produk berbayar yang sudah dikonfirmasi admin. */
export const vanzzDeliver = (orderId: string) => post({ action: 'deliver', orderId }, 55000);

/** LANGKAH 2 AlightMotion — tempel URL verifikasi dari email (SPAM) → unlock premium. */
export const vanzzAmVerify = (orderId: string, urlVerify: string) => post({ action: 'amverify', orderId, urlVerify }, 55000);

// ---------------------------------------------------------------------------
// MENU GRATIS — definisi layar (dipakai screens/AnimeScreens.tsx / FreeMenu)
// ---------------------------------------------------------------------------
export type FreeItem = { title: string; subtitle?: string; image?: string; url?: string; snippet?: string; extra?: string };

/** Normalisasi berbagai bentuk respons Vanzz menjadi daftar item seragam. */
export function toItems(data: any): FreeItem[] {
  if (data == null) return [];
  // kumpulkan semua array di dalam respons
  let arr: any[] = [];
  if (Array.isArray(data)) arr = data;
  else if (typeof data === 'object') {
    for (const k of Object.keys(data)) if (Array.isArray(data[k])) { arr = data[k]; break; }
  }
  if (!arr.length && typeof data === 'object' && (data.status === true || data.status === 'true')) {
    // respons tunggal (cuaca/gempa/quotes) → satu item
    const d = data as any;
    return [{
      title: d.quotes ?? d.quote ?? d.kondisi ?? d.lokasi ?? d.title ?? 'Hasil',
      subtitle: d.author ?? d.kota ?? d.tempat ?? (d.suhu ? `${d.suhu} · ${d.kelembaban ?? ''}` : undefined),
      snippet: [d.magnitude && `Magnitudo ${d.magnitude}`, d.kedalaman, d.waktu, d.info, d.angin].filter(Boolean).join(' · ') || undefined,
      extra: d.url ?? d.sumber,
    }];
  }
  return arr.slice(0, 60).map((it: any) => {
    if (typeof it === 'string') return { title: it };
    return {
      title: it.title ?? it.name ?? it.judul ?? it.quote ?? it.quotes ?? it.nama ?? it.kota ?? it.address ?? '(tanpa judul)',
      subtitle: it.author ?? it.artis ?? it.artist ?? it.channel ?? it.provider ?? it.region ?? it.uploaded ?? it.waktu ?? it.date ?? it.time ?? undefined,
      image: (typeof it.image === 'string' && /^https?:/.test(it.image) ? it.image : undefined)
        ?? (typeof it.thumbnail === 'string' && /^https?:/.test(it.thumbnail) ? it.thumbnail : undefined)
        ?? (typeof it.thumb === 'string' && /^https?:/.test(it.thumb) ? it.thumb : undefined)
        ?? (typeof it.img === 'string' && /^https?:/.test(it.img) ? it.img : undefined),
      url: it.url ?? it.link ?? it.watch ?? undefined,
      snippet: it.desc ?? it.snippet ?? it.description ?? it.quality ?? it.type ?? undefined,
      extra: it.duration ?? it.views ?? it.size ?? undefined,
    };
  });
}

/** Menu tab gratis: key = registry api/vanzz FREE. */
export const FREE_TABS: { key: string; label: string; search?: boolean; searchKey?: string; placeholder?: string }[] = [
  { key: 'anime_fyp', label: 'Anime' },
  { key: 'anime_search', label: 'Cari Anime', search: true, searchKey: 'keyword', placeholder: 'judul anime…' },
  { key: 'berita_kompas', label: 'Berita' },
  { key: 'berita_cnn', label: 'CNN' },
  { key: 'berita_liputan6', label: 'Liputan6' },
  { key: 'berita_antara', label: 'Antara' },
  { key: 'berita_cnbc', label: 'CNBC' },
  { key: 'berita_sindonews', label: 'Sindonews' },
  { key: 'quotes_motivasi', label: 'Quotes' },
  { key: 'quotes_galau', label: 'Quotes Galau' },
  { key: 'quotes_gombal', label: 'Quotes Gombal' },
  { key: 'cuaca', label: 'Cuaca', search: true, searchKey: 'kota', placeholder: 'nama kota…' },
  { key: 'gempa', label: 'Gempa' },
  { key: 'bmkg', label: 'BMKG' },
  { key: 'amfinder', label: 'AM Finder', search: true, searchKey: 'url', placeholder: 'URL TikTok preset…' },
  { key: 'jadwalsholat', label: 'Sholat', search: true, searchKey: 'kota', placeholder: 'nama kota…' },
];
