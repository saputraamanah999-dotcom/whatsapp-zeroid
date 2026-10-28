/**
 * Client untuk /api/music (Spotify kita — desain endpoint rapxz).
 * Semua lewat lib/proxy (EXPO_PUBLIC_API_BASE aware) — tidak ada key di klien.
 */
import { proxyGet } from './proxy';

export type MusicSong = {
  videoId: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: string;
  thumb?: string;
};

export type MusicPlaylist = { browseId: string; title: string; author?: string; thumb?: string };
export type MusicArtist = { browseId: string; name: string; subs?: string; thumb?: string };

type ApiResp<T> = { status?: boolean; result?: T; error?: string };

async function call<T>(action: string, params: Record<string, string> = {}, ms = 30000): Promise<T> {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const { ok, data } = await proxyGet(`/api/music?${qs}`, ms);
  if (!ok) throw new Error((data as any)?.error || `Layanan musik gagal (HTTP).`);
  if (data && data.status === false) throw new Error(data.error || 'Layanan musik gagal.');
  return (data?.result ?? data) as T;
}

export const musicSearch = (q: string, type: 'songs' | 'playlists' | 'artists' | 'all' = 'songs') =>
  call<{ songs?: MusicSong[]; playlists?: MusicPlaylist[]; artists?: MusicArtist[] }>('search', { q, type }, 30000);

/**
 * Resolve URL audio langsung. `null` = semua sumber gagal → pemutar otomatis
 * beralih ke YouTube embed resmi.
 */
export const musicStream = async (videoId: string): Promise<string | null> => {
  const r = await call<{ id: string; download: { audio: string }; provider: string; embed?: boolean }>('stream', { id: videoId }, 45000);
  if (!r || r.embed || !r.download?.audio) return null;
  return r.download.audio;
};

export const musicLyrics = (title: string, artist = '', id = '') =>
  call<{ lyrics: string; found: boolean }>('lyrics', { title, artist, id }, 20000).then((r) => r.lyrics ?? '');

export const musicSuggest = (q: string) => call<string[]>('suggest', { q }, 10000).then((r) => (Array.isArray(r) ? r : []));

/** Trending chips — kueri siap pakai gaya home rapxz (top hits Indonesia & global). */
export const TRENDING = [
  'Hits Viral Indonesia 2026',
  'Lagu Barat Terpopuler',
  'Dangdut Koplo Viral',
  'Top 50 Global',
  'Lagu Galau Terpopuler',
  'K-Pop Chart',
  'Lagu Reggae Indonesia',
  'Akustik Cover Viral',
];
