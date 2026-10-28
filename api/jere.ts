/**
 * Vercel serverless proxy — Jerexd content services (music / anime / download).
 * JEREXD_APIKEY stays server-side; the client only sends an action + params.
 * One endpoint, action-based routing, defensive response unwrapping.
 *
 * Actions (paths verified against the Jerexd endpoint docs):
 *  song_search   → GET /api/search/spotify        (query)
 *  song_play     → GET /api/downloader/play       (q)      direct audio by query
 *  song_download → GET /api/downloader/ytmp3      (url)    mp3 by youtube url
 *  lyrics        → GET /api/search/lirik          (q)
 *  yt_search     → GET /api/search/youtube        (q)
 *  yt_dl         → GET /api/downloader/youtube    (url, format)
 *  anime_latest  → GET /api/anime/latest
 *  anime_hot     → GET /api/anime/hot
 *  anime_search  → GET /api/anime/otakudesu-search (query)
 *  anime_detail  → GET /api/anime/otakudesu-detail-download (slug)
 *  anime_schedule→ GET /api/anime/jadwalrilis
 *  anime_quotes  → GET /api/random/animequotes
 *  anime_news    → GET /api/anime/berita
 */
export const config = { runtime: 'nodejs' };

const JEREXD_BASE = 'https://api.jerexd.my.id';

const hits = new Map<string, number[]>();
const WINDOW = 5 * 60 * 1000;
const MAX_HITS = 60;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (arr.length >= MAX_HITS) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

/** GET an upstream endpoint with the server key; returns parsed JSON or null. */
async function jereGet(path: string, params: Record<string, string>, timeoutMs = 25000): Promise<{ ok: boolean; status: number; data: any }> {
  const key = process.env.JEREXD_APIKEY ?? '';
  const qs = new URLSearchParams({ ...params, apikey: key });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${JEREXD_BASE}${path}?${qs.toString()}`, {
      method: 'GET',
      signal: ctl.signal,
      headers: { accept: 'application/json', 'x-api-key': key },
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

/** Unwrap the various upstream envelope shapes into a payload object/array. */
function unwrap(data: any): any {
  if (!data || typeof data !== 'object') return data;
  for (const k of ['result', 'data', 'results', 'response']) {
    const v = (data as any)[k];
    if (Array.isArray(v) || (v && typeof v === 'object')) return v;
  }
  return data;
}

/** Pull the first plausible text field of an object. */
function txt(o: any, keys: string[], fallback = ''): string {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return fallback;
}

// ---------- normalisers (upstream shapes may vary; every field is optional-safe) ----------

function normSongs(data: any): any[] {
  const p = unwrap(data);
  const list = Array.isArray(p) ? p : Array.isArray(p?.tracks) ? p.tracks : Array.isArray(p?.songs) ? p.songs : Array.isArray(p?.items) ? p.items : Array.isArray(p?.result) ? p.result : [];
  return list.slice(0, 40).map((s: any) => {
    const url = txt(s, ['url', 'link', 'external_urls', 'spotify_url', 'permalink']);
    let id = txt(s, ['id', 'key']);
    if (!id && url) {
      const m = url.match(/(?:open\.spotify\.com\/(?:intl-[a-z]+\/)?|spotify:)(?:track|album|playlist)[/:]([A-Za-z0-9]{22})/);
      if (m) id = m[1];
    }
    return {
      id,
      title: txt(s, ['title', 'name', 'track_name', 'song', 'judul']) || 'Tanpa judul',
      artist: txt(s, ['artist', 'artists', 'artist_name', 'channel', 'username', 'author', 'artis']),
      album: txt(s, ['album', 'album_name']),
      thumb: txt(s, ['thumb', 'thumbnail', 'image', 'cover', 'cover_art', 'album_art', 'img']) || undefined,
      url: url || (id ? `https://open.spotify.com/track/${id}` : ''),
      duration: txt(s, ['duration', 'duration_ms', 'length']),
    };
  });
}

function normDirect(data: any): { url?: string; title?: string; thumb?: string; duration?: string; quality?: string } {
  const p = unwrap(data);
  const out: any = {};
  out.title = txt(p, ['title', 'name', 'filename', 'song', 'judul']);
  out.thumb = txt(p, ['thumb', 'thumbnail', 'image', 'cover', 'img']) || undefined;
  out.duration = txt(p, ['duration', 'length', 'timestamp']) || undefined;
  // direct media url hunt
  const scan = (o: any, depth = 0): string | undefined => {
    if (!o || typeof o !== 'object' || depth > 3) return undefined;
    for (const k of ['url', 'audio', 'audio_url', 'link', 'download', 'dl_url', 'file', 'src', 'mp3']) {
      const v = o[k];
      if (typeof v === 'string' && /^https?:\/\//.test(v) && !/open\.spotify\.com|youtube\.com|youtu\.be/.test(v)) return v;
    }
    for (const k of Object.keys(o)) {
      const v = (o as any)[k];
      if (v && typeof v === 'object') {
        const f = scan(v, depth + 1);
        if (f) return f;
      }
    }
    return undefined;
  };
  out.url = scan(p);
  out.quality = txt(p, ['quality', 'bitrate', 'resolution']) || undefined;
  return out;
}

function normLyrics(data: any): string {
  const p = unwrap(data);
  if (typeof p === 'string') return p;
  return txt(p, ['lyrics', 'result', 'text', 'lirik', 'content']);
}

function normYt(data: any): any[] {
  const p = unwrap(data);
  const list = Array.isArray(p) ? p : Array.isArray(p?.videos) ? p.videos : Array.isArray(p?.items) ? p.items : [];
  return list.slice(0, 40).map((v: any) => {
    const vid = txt(v, ['videoId', 'id', 'video_id']) || (txt(v, ['url', 'link']).match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? '');
    return {
      id: vid,
      title: txt(v, ['title', 'name', 'judul']) || 'Video YouTube',
      channel: txt(v, ['channel', 'author', 'channelName', 'owner']) || undefined,
      thumb: txt(v, ['thumb', 'thumbnail', 'thumbnailUrl', 'image']) || (vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : undefined),
      duration: txt(v, ['duration', 'lengthText', 'length']) || undefined,
      views: txt(v, ['views', 'viewCount', 'publishedTimeText']) || undefined,
    };
  });
}

const slugify = (v: string) => v.replace(/^https?:\/\/[^/]+\/anime\//, '').replace(/\/+$/, '');

function normAnimeList(data: any): any[] {
  const p = unwrap(data);
  const list = Array.isArray(p)
    ? p
    : Array.isArray(p?.animeList)
    ? p.animeList
    : Array.isArray(p?.animes)
    ? p.animes
    : Array.isArray(p?.data)
    ? p.data
    : Array.isArray(p?.list)
    ? p.list
    : Array.isArray(p?.items)          // otakudesu-search shape: result.items[]
    ? p.items
    : Array.isArray(data?.result?.items)
    ? data.result.items
    : [];
  return list.slice(0, 60).map((a: any) => ({
    slug: slugify(txt(a, ['slug', 'id', 'endpoint', 'link', 'url'])),
    rating: txt(a, ['rating', 'score', 'nilai']) || undefined,
    status: txt(a, ['status', 'type']) || undefined,
    synopsis: txt(a, ['synopsis', 'desc', 'description']) || undefined,
    releaseDay: txt(a, ['day', 'release_day', 'hari', 'jadwal']) || undefined,
  }));
}

function normAnimeDetail(data: any): any {
  const p = unwrap(data);
  const d = Array.isArray(p) ? p[0] ?? {} : p ?? {};
  const episodesSrc = d.episodes ?? d.episodeList ?? d.episode_list ?? d.eps ?? [];
  const episodes = (Array.isArray(episodesSrc) ? episodesSrc : []).slice(0, 200).map((e: any) => {
    if (typeof e === 'string') {
      return { slug: slugify(e), title: e.replace(/[-_]/g, ' '), poster: undefined };
    }
    return {
      slug: slugify(txt(e, ['slug', 'id', 'endpoint', 'link'])),
      title: txt(e, ['title', 'name', 'judul', 'episode']) || 'Episode',
      poster: txt(e, ['poster', 'thumb', 'image', 'img']) || undefined,
      date: txt(e, ['date', 'released', 'uploaded_on', 'rilis']) || undefined,
    };
  });
  const dlSrc = d.download ?? d.downloadLinks ?? d.download_links ?? d.downloads ?? [];
  const downloads = (Array.isArray(dlSrc) ? dlSrc : []).slice(0, 60).map((x: any) => {
    if (typeof x === 'string') return { label: 'Unduh', urls: [{ label: 'Unduh', url: x }] };
    const urls: { label: string; url: string }[] = [];
    const walk = (o: any, depth = 0) => {
      if (!o || typeof o !== 'object' || depth > 3) return;
      for (const [k, v] of Object.entries(o)) {
        if (typeof v === 'string' && /^https?:\/\//.test(v) && /\.(mp4|mkv|webm|m3u8|zip|rar)/i.test(v)) {
          urls.push({ label: k.replace(/_/g, ' ').toUpperCase(), url: v });
        } else if (v && typeof v === 'object') walk(v, depth + 1);
      }
    };
    walk(x);
    const quality = txt(x, ['quality', 'resolusi', 'resolution']);
    return { label: quality || txt(x, ['title', 'name'], 'Unduhan'), urls: urls.slice(0, 12) };
  });
  const genresSrc = d.genres ?? d.genre_list ?? d.genre ?? [];
  const genres = (Array.isArray(genresSrc) ? genresSrc : typeof genresSrc === 'string' ? [genresSrc] : [])
    .map((g: any) => (typeof g === 'string' ? g : txt(g, ['name', 'title', 'genre_name'])))
    .filter(Boolean)
    .slice(0, 12);
  return {
    slug: slugify(txt(d, ['slug', 'id', 'endpoint'])),
    title: txt(d, ['title', 'name', 'judul']) || 'Anime',
    poster: txt(d, ['poster', 'thumb', 'image', 'img', 'cover']) || undefined,
    banner: txt(d, ['banner', 'background']) || undefined,
    rating: txt(d, ['rating', 'score']) || undefined,
    status: txt(d, ['status']) || undefined,
    studio: txt(d, ['studio']) || undefined,
    released: txt(d, ['released', 'release_date', 'rilis']) || undefined,
    duration: txt(d, ['duration', 'duration_per_ep']) || undefined,
    synopsis: txt(d, ['synopsis', 'desc', 'description', 'sinopsis']) || undefined,
    genres,
    episodes,
    downloads,
  };
}

function normQuotes(data: any): any[] {
  // upstream returns ONE random quote as an object (result.quote/character/anime)
  const p = unwrap(data);
  const list = Array.isArray(p) ? p : Array.isArray(p?.quotes) ? p.quotes : p && typeof p === 'object' && (p.quote || p.quotes) ? [p] : [];
  return list.slice(0, 40).map((q: any) => ({
    quote: txt(q, ['quote', 'quotes', 'text', 'english', 'isi']) || '',
    character: txt(q, ['character', 'chara', 'character_name', 'name', 'karakter']) || undefined,
    anime: txt(q, ['anime', 'title', 'source', 'from']) || undefined,
  })).filter((q: any) => q.quote);
}

function normNews(data: any): any[] {
  const p = unwrap(data);
  const list = Array.isArray(p) ? p : Array.isArray(p?.news) ? p.news : Array.isArray(p?.articles) ? p.articles : Array.isArray(p?.berita) ? p.berita : Array.isArray(p?.items) ? p.items : [];
  return list.slice(0, 40).map((n: any) => ({
    title: txt(n, ['title', 'name', 'judul']) || 'Berita anime',
    url: txt(n, ['url', 'link', 'source']) || '',
    thumb: txt(n, ['thumb', 'thumbnail', 'image', 'img', 'poster']) || undefined,
    date: txt(n, ['date', 'time', 'published', 'uploaded_at', 'rilis']) || undefined,
    snippet: txt(n, ['snippet', 'excerpt', 'desc', 'description', 'content']) || undefined,
  })).filter((n: any) => n.title);
}

const fail = (res: any, status: number, error: string) => res.status(status).json({ error });

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, configured: !!process.env.JEREXD_APIKEY, service: 'zeroid-jere-proxy' });
  }
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) return fail(res, 429, 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.');
  if (!process.env.JEREXD_APIKEY) return fail(res, 503, 'Layanan konten belum dikonfigurasi (JEREXD_APIKEY tidak ada di server).');

  let body: any;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return fail(res, 400, 'Body tidak valid.'); }

  const action = String(body?.action ?? '');
  const s = (v: any, max = 300) => String(v ?? '').slice(0, max).trim();

  const routes: Record<string, () => Promise<{ ok: boolean; status: number; data: any }>> = {
    song_search: () => jereGet('/api/search/spotify', { query: s(body.query, 120) }),
    song_play: () => jereGet('/api/downloader/play', { q: s(body.q, 160) }, 40000),
    song_download: () => jereGet('/api/downloader/ytmp3', { url: s(body.url, 400) }, 60000),
    lyrics: () => jereGet('/api/search/lirik', { q: s(body.q, 160) }),
    yt_search: () => jereGet('/api/search/youtube', { q: s(body.q, 120) }),
    yt_dl: () => jereGet('/api/downloader/youtube', { url: s(body.url, 400), format: s(body.format, 10) || 'mp3' }, 60000),
    anime_latest: () => jereGet('/api/anime/latest', {}),
    anime_hot: () => jereGet('/api/anime/hot', {}),
    anime_search: () => jereGet('/api/anime/otakudesu-search', { query: s(body.query, 120) }),
    anime_detail: () => jereGet('/api/anime/otakudesu-detail-download', { slug: s(body.slug, 200) }, 45000),
    anime_schedule: () => jereGet('/api/anime/jadwalrilis', {}),
    anime_quotes: () => jereGet('/api/random/animequotes', {}),
    anime_news: () => jereGet('/api/anime/berita', {}),
  };

  const run = routes[action];
  if (!run) return fail(res, 400, 'Aksi tidak dikenal.');

  try {
    const r = await run();
    if (!r.ok || !r.data) {
      const msg = String(r.data?.error ?? r.data?.message ?? `HTTP ${r.status}`);
      return fail(res, 502, `Layanan gagal: ${msg.slice(0, 160)}`);
    }
    // upstream may report errors with 200 — detect common markers
    if (r.data?.status === false && !r.data?.result && !r.data?.data) {
      return fail(res, 502, `Layanan gagal: ${String(r.data?.message ?? 'respons tidak dikenal').slice(0, 160)}`);
    }
    switch (action) {
      case 'song_search':
        return res.status(200).json({ ok: true, songs: normSongs(r.data) });
      case 'song_play':
      case 'song_download':
      case 'yt_dl': {
        const d = normDirect(r.data);
        if (!d.url) return fail(res, 502, 'Tautan media tidak ditemukan di respons layanan.');
        return res.status(200).json({ ok: true, ...d });
      }
      case 'lyrics':
        return res.status(200).json({ ok: true, lyrics: normLyrics(r.data).slice(0, 8000) });
      case 'yt_search':
        return res.status(200).json({ ok: true, videos: normYt(r.data) });
      case 'anime_latest':
      case 'anime_hot':
      case 'anime_search':
      case 'anime_schedule':
        return res.status(200).json({ ok: true, list: normAnimeList(r.data) });
      case 'anime_quotes': {
        const quotes = normQuotes(r.data);
        if (!quotes.length) return fail(res, 502, 'Kutipan tidak dapat dibaca dari layanan.');
        return res.status(200).json({ ok: true, quotes });
      }
      case 'anime_news':
        return res.status(200).json({ ok: true, news: normNews(r.data) });
      case 'anime_detail': {
        const d = normAnimeDetail(r.data);
        if (!d.slug && !d.episodes.length && !d.synopsis) return fail(res, 502, 'Detail anime tidak dapat dibaca.');
        return res.status(200).json({ ok: true, anime: d });
      }
      default:
        return fail(res, 400, 'Aksi tidak dikenal.');
    }
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Waktu tunggu layanan habis.' : 'Gagal menghubungi layanan konten.';
    return fail(res, 504, msg);
  }
}
