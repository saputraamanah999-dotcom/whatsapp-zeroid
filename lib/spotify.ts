import { SpotifyTrack, YouTubeTrack } from './types';

export type MediaTrack = SpotifyTrack | YouTubeTrack;

export const CURATED: MediaTrack[] = [
  { id: '37i9dQZEVXbObFQZ3JLcXt', kind: 'playlist', title: 'Top 50 - Indonesia' },
  { id: '1BxfuPKGuaTgP7aM0Bbdwr', kind: 'track', title: 'Cruel Summer' },
  { id: '0VjIjW4GlUZAMYd2vXMi3b', kind: 'track', title: 'Blinding Lights' },
  { id: 'dQw4w9WgXcQ', kind: 'youtube', title: 'Never Gonna Give You Up' },
  { id: 'jNQXAC9IVRw', kind: 'youtube', title: 'Me at the zoo' },
  { id: '7qiZfU4dY1lWllzX7mPBI3', kind: 'track', title: 'Shape of You' },
  { id: '4cOdK2wGLETKBW3PvgPWqT', kind: 'track', title: 'Never Gonna Give You Up' },
];

/** Parses open.spotify.com links or spotify: URIs. */
export function parseSpotify(input: string): { id: string; kind: SpotifyTrack['kind'] } | null {
  const s = input.trim();
  const m = s.match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(track|playlist|album)[/:]([A-Za-z0-9]{22})/);
  if (!m) return null;
  return { kind: m[1] as SpotifyTrack['kind'], id: m[2] };
}

/** Parses YouTube video / playlist links (watch, youtu.be, shorts, embed). */
export function parseYouTube(input: string): { id: string; kind: 'youtube'; list?: string } | null {
  const s = input.trim();
  let m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) {
    const list = s.match(/[?&]list=([A-Za-z0-9_-]+)/)?.[1];
    return { id: m[1], kind: 'youtube', list };
  }
  m = s.match(/youtube\.com\/playlist\?[^\s]*list=([A-Za-z0-9_-]+)/);
  if (m) return { id: m[1], kind: 'youtube' };
  return null;
}

/** Resolves title + cover via official oEmbed endpoints (public, no auth, ToS-compliant). */
export async function resolveMedia(input: string): Promise<MediaTrack | null> {
  const p = parseSpotify(input);
  if (p) {
    try {
      const r = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/${p.kind}/${p.id}`);
      if (!r.ok) throw new Error('oembed ' + r.status);
      const j = await r.json();
      return { ...p, title: j.title ?? 'Spotify', thumb: j.thumbnail_url };
    } catch {
      // oEmbed gagal = track tidak ada / tidak bisa di-embed → simpan sebagai
      // lagu profil akan menampilkan "Page not available". Tolak link-nya.
      return null;
    }
  }
  const y = parseYouTube(input);
  if (y) {
    try {
      const r = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${y.id}&format=json`);
      const j = await r.json();
      return { id: y.id, kind: 'youtube', title: j.title ?? 'YouTube', thumb: j.thumbnail_url };
    } catch {
      return { id: y.id, kind: 'youtube', title: 'Video YouTube' };
    }
  }
  return null;
}

export const isYouTube = (t: MediaTrack): t is YouTubeTrack => t.kind === 'youtube';
