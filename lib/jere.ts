/**
 * Client for the /api/jere server proxy (music / anime content).
 * The Jerexd API key stays server-side; this module only sends actions.
 * No fake data — every list comes from the live proxy, errors are surfaced.
 * Transport: lib/proxy.ts (EXPO_PUBLIC_API_BASE aware, web + APK).
 */
import { proxyPost } from './proxy';

export type SongResult = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  thumb?: string;
  url: string;
  duration?: string;
};

export type YtResult = {
  id: string;
  title: string;
  channel?: string;
  thumb?: string;
  duration?: string;
  views?: string;
};

export type MediaDirect = { url: string; title?: string; thumb?: string; duration?: string; quality?: string };

export type AnimeCard = {
  slug: string;
  title: string;
  poster?: string;
  episode?: string;
  rating?: string;
  status?: string;
  synopsis?: string;
  releaseDay?: string;
};

export type AnimeQuote = { quote: string; character?: string; anime?: string };
export type AnimeNews = { title: string; url: string; thumb?: string; date?: string; snippet?: string };

export type AnimeDetail = AnimeCard & {
  banner?: string;
  studio?: string;
  released?: string;
  duration?: string;
  genres: string[];
  episodes: { slug: string; title: string; poster?: string; date?: string }[];
  downloads: { label: string; urls: { label: string; url: string }[] }[];
};

export async function jere<T = any>(action: string, params: Record<string, string | undefined> = {}, ms = 45000): Promise<T> {
  try {
    return await proxyPost<T>('/api/jere', { action, ...params }, ms);
  } catch (e: any) {
    const raw = String(e?.message ?? '');
    // upstream scraper outage (OtakuDesu blocked at the provider) — friendly, actionable text
    if (/otakudesu|cluster scraper|502/i.test(raw)) {
      throw new Error('Sumber anime sedang gangguan (penyedia sedang diblokir). Coba lagi nanti atau gunakan pencarian — pencarian masih berfungsi.');
    }
    throw e;
  }
}

// ---------------- music ----------------
export const songSearch = (query: string) => jere<{ songs: SongResult[] }>('song_search', { query }).then((r) => r.songs ?? []);
export const songPlay = (q: string) => jere<MediaDirect>('song_play', { q }, 60000);
export const songDownload = (url: string) => jere<MediaDirect>('song_download', { url }, 70000);
export const fetchLyrics = (q: string) => jere<{ lyrics: string }>('lyrics', { q }, 30000).then((r) => r.lyrics ?? '');
export const ytSearch = (q: string) => jere<{ videos: YtResult[] }>('yt_search', { q }).then((r) => r.videos ?? []);
export const ytDownload = (url: string, format: 'mp3' | 'mp4') => jere<MediaDirect>('yt_dl', { url, format }, 70000);

// ---------------- anime ----------------
export const animeLatest = () => jere<{ list: AnimeCard[] }>('anime_latest').then((r) => r.list ?? []);
export const animeHot = () => jere<{ list: AnimeCard[] }>('anime_hot').then((r) => r.list ?? []);
export const animeSchedule = () => jere<{ list: AnimeCard[] }>('anime_schedule').then((r) => r.list ?? []);
export const animeSearch = (query: string) => jere<{ list: AnimeCard[] }>('anime_search', { query }).then((r) => r.list ?? []);
export const animeDetail = (slug: string) => jere<{ anime: AnimeDetail }>('anime_detail', { slug }, 60000).then((r) => r.anime);
export const animeQuotes = () => jere<{ quotes: AnimeQuote[] }>('anime_quotes').then((r) => r.quotes ?? []);
export const animeNews = () => jere<{ news: AnimeNews[] }>('anime_news').then((r) => r.news ?? []);
