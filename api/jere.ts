/**
 * Vercel serverless proxy — Jerexd content services (music / anime / download).
 * JEREXD_APIKEY stays server-side; the client only sends an action + params.
 * One endpoint, action-based routing, defensive response unwrapping.
 *
 * Actions:
 *  song_search   → GET jerexd /api/search/spotify        (query)
 *  song_play     → GET jerexd /api/downloader/play       (q)      direct audio by query
 *  song_download → GET jerexd /api/downloader/ytmp3      (url)    mp3 by youtube url
 *  lyrics        → GET jerexd /api/search/lirik          (q)
 *  yt_search     → GET jerexd /api/search/youtube        (q)
 *  yt_dl         → GET jerexd /api/downloader/youtube    (url, format)
 *
 * ANIME (v9 — tanpa API key): SEMUA 27 endpoint kategori ANIME siputzx.my.id
 * dipakai sebagai sumber utama dengan failover senyap antar endpoint, lalu
 * fallback Jikan/ANN. Lihat blok "SIPUTZX (keyless) — 27 ENDPOINT ANIME".
 *  anime_latest / anime_hot / anime_search / anime_detail / anime_schedule /
 *  anime_quotes / anime_news
 */
export const config = { runtime: 'nodejs' };
// yt_dl / ytmp3 upstream can take ~60s — without this Vercel's short default
// kills the function mid-download and the client sees a confusing 504.
export const maxDuration = 60;

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

/** URL absolut (anichin/samehadaku/komikindo) tetap utuh sebagai slug supaya
 *  detail-chain bisa memilih scraper yang TEPAT; slug pendek dianggap otakudesu. */
const slugify = (v: string) => (/^https?:\/\//.test(v) ? v : v.replace(/^https?:\/\/[^/]+\/anime\//, '').replace(/\/+$/, ''));

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
    slug: slugify(txt(a, ['slug', 'id', 'endpoint', 'link', 'url', 'href'])),
    title: txt(a, ['title', 'name', 'judul']) || 'Anime',
    poster: txt(a, ['poster', 'thumb', 'thumbnail', 'image', 'img', 'cover', 'gambar']) || undefined,
    rating: txt(a, ['rating', 'score', 'skor', 'nilai']) || undefined,
    status: txt(a, ['status', 'type']) || undefined,
    episode: txt(a, ['episode', 'eps', 'episode_num', 'terbaru']) || undefined,
    synopsis: txt(a, ['synopsis', 'desc', 'description', 'sinopsis']) || undefined,
    releaseDay: txt(a, ['day', 'release_day', 'hari', 'jadwal', 'schedule']) || undefined,
  }));
}

function normAnimeDetail(data: any): any {
  const p = unwrap(data);
  const d = Array.isArray(p) ? p[0] ?? {} : p ?? {};
  const episodesSrc = d.episodes ?? d.episodeList ?? d.episode_list ?? d.eps ?? d.anime_episode ?? [];
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
  const dlSrc = d.download ?? d.downloadLinks ?? d.download_links ?? d.downloads ?? d.download_url ?? [];
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
    slug: slugify(txt(d, ['slug', 'id', 'endpoint', 'url', 'link'])),
    title: txt(d, ['title', 'name', 'judul']) || 'Anime',
    poster: txt(d, ['poster', 'thumb', 'thumbnail', 'image', 'img', 'cover', 'gambar']) || undefined,
    banner: txt(d, ['banner', 'background']) || undefined,
    rating: txt(d, ['rating', 'score', 'skor']) || undefined,
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

// ============================ FALLBACK: JIKAN (MyAnimeList) + ANN ============================
// 5 endpoint anime JERE (latest/hot/schedule/quotes/news) sering 500 di sisi
// penyedia. Fallback ini 100% keyless sehingga anime tetap jalan.

async function jikan(path: string, timeoutMs = 14000): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://api.jikan.moe/v4${path}`, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'zeroid-anime/1.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

function jikanCard(a: any): any {
  return {
    slug: `jikan:${a?.mal_id}`,
    title: a?.title ?? a?.title_english ?? a?.title_japanese ?? 'Anime',
    poster: a?.images?.jpg?.large_image_url ?? a?.images?.jpg?.image_url ?? undefined,
    rating: a?.score ? String(a.score) : undefined,
    status: a?.status ?? undefined,
    synopsis: a?.synopsis ?? undefined,
    releaseDay: a?.broadcast?.string ?? a?.aired?.string ?? undefined,
  };
}

async function jikanDetail(slug: string): Promise<any> {
  const id = slug.replace(/^jikan:/, '').replace(/[^0-9]/g, '');
  if (!id) throw new Error('ID anime tidak valid.');
  const d = await jikan(`/anime/${id}/full`);
  const a = d?.data ?? {};
  let eps: any[] = [];
  try {
    const ep = await jikan(`/anime/${id}/episodes`);
    eps = (ep?.data ?? []).slice(0, 200).map((e: any) => ({
      slug: `jikan:${id}:${e?.mal_id ?? ''}`,
      title: e?.title ?? e?.title_romanji ?? `Episode ${e?.mal_id ?? '?'}`,
      date: e?.aired ?? undefined,
    }));
  } catch { /* episodes optional */ }
  return {
    slug: `jikan:${id}`,
    title: a?.title ?? 'Anime',
    poster: a?.images?.jpg?.large_image_url ?? undefined,
    banner: a?.trailer?.images?.maximum_image_url ?? undefined,
    rating: a?.score ? String(a.score) : undefined,
    status: a?.status ?? undefined,
    studio: a?.studios?.[0]?.name ?? undefined,
    released: a?.aired?.string ?? undefined,
    duration: a?.duration ?? undefined,
    synopsis: a?.synopsis ?? undefined,
    genres: (a?.genres ?? []).map((g: any) => g?.name).filter(Boolean).slice(0, 12),
    episodes: eps,
    downloads: [], // sumber streaming tidak tersedia via Jikan — tombol unduh otomatis nonaktif
  };
}

async function jikanQuotes(): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < 8; i++) {
    try {
      const d = await jikan('/random/quotes', 8000);
      const q = d?.data;
      if (q?.quote) out.push({ quote: q.quote, character: q.character, anime: q.anime });
    } catch { /* skip */ }
  }
  return out;
}

async function annNews(): Promise<any[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 14000);
  try {
    const r = await fetch('https://www.animenewsnetwork.com/all/rss.xml?ann-edition=us', { signal: ctl.signal, headers: { 'user-agent': 'zeroid-anime/1.0' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const xml = await r.text();
    const items = xml.split('<item>').slice(1, 26);
    return items.map((it) => {
      const pick = (tag: string) => {
        const m = it.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
      };
      const title = pick('title');
      const link = pick('link');
      const desc = pick('description');
      const thumb = desc.match(/src="(https:[^"]+\.(?:jpg|jpeg|png|webp))"/i)?.[1];
      return { title, url: link, thumb, date: pick('pubDate'), snippet: desc.replace(/<[^>]+>/g, '').slice(0, 180) };
    }).filter((n) => n.title && n.url);
  } finally {
    clearTimeout(timer);
  }
}

// ============================ SIPUTZX (keyless) — 27 ENDPOINT ANIME ============================
// Semua endpoint kategori ANIME docs.siputzx (27 buah) dipakai di sini sebagai
// SUMBER UTAMA (tanpa API key), berantai dengan FAILOVER SENYAP: kalau satu
// endpoint kosong/limit/gagal → otomatis coba berikutnya → terakhir Jikan/ANN.
//
//   anime_latest  : otakudesu/ongoing → oploverz-ongoing → anichin-latest → samehadaku/latest → auratail-latest
//   anime_hot     : anichin-popular
//   anime_search  : otakudesu/search → anichin-search → oploverz-search → samehadaku/search → komikindo-search → auratail-search
//   anime_detail  : otakudesu/detail → anichin-detail → anichin-episode → oploverz-episode → samehadaku/detail → komikindo-detail → auratail-detail
//   (unduhan)     : otakudesu/download → anichin-download → oploverz-download → samehadaku/download → komikindo-download
//   anime_schedule: auratail-schedule → samehadaku/release
//   anime_quotes  : /api/s/animequotes
//   anime_news    : samehadaku/release

const SIPUTZX_BASE = 'https://api.siputzx.my.id';

async function sipGet(path: string, params: Record<string, string> = {}, timeoutMs = 32000): Promise<any | null> {
  try {
    const qs = new URLSearchParams(params).toString();
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(`${SIPUTZX_BASE}${path}${qs ? `?${qs}` : ''}`, {
      headers: { accept: 'application/json', 'user-agent': 'zeroid-anime/1.0' },
      signal: ctl.signal,
    });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (!j || j.status === false) return null;
    return j.data ?? j.result ?? j;
  } catch { return null; }
}

/** coba pembuat-pembuat secara berurutan; hasil PERTAMA yang tidak kosong menang. */
async function firstNonEmpty<T>(makers: Array<() => Promise<T | null>>): Promise<T | null> {
  for (const mk of makers) {
    try {
      const v = await mk();
      if (v) return v;
    } catch { /* lanjut berikutnya — tanpa pemberitahuan */ }
  }
  return null;
}

const sipList = async (path: string, params: Record<string, string> = {}): Promise<any[] | null> => {
  const d = await sipGet(path, params);
  const list = normAnimeList(d);
  return listHasItems(list) ? list : null;
};

const sipDetail = async (path: string, param: string, url: string): Promise<any | null> => {
  const d = await sipGet(path, { [param]: url }, 40000);
  const a = normAnimeDetail(d);
  return a.slug || a.episodes.length || a.synopsis || a.downloads.length ? a : null;
};

/** URL episode/detail bisa berupa slug pendek → utus sebagai URL penuh bila sudah http(s). */
const asUrl = (v: string) => (/^https?:\/\//.test(v) ? v : `https://otakudesu.cloud/anime/${v}/`);

async function sipAnimeDetail(url: string): Promise<any | null> {
  // pilih scraper utama sesuai domain URL (slug bisa dari sumber mana pun)
  const u = url.toLowerCase();
  const chain = u.includes('anichin')
    ? ['/api/anime/anichin-detail', 'url', '/api/anime/otakudesu/detail', 'url', '/api/anime/samehadaku/detail', 'link', '/api/anime/komikindo-detail', 'url', '/api/anime/auratail-detail', 'url']
    : u.includes('samehadaku')
    ? ['/api/anime/samehadaku/detail', 'link', '/api/anime/otakudesu/detail', 'url', '/api/anime/anichin-detail', 'url', '/api/anime/komikindo-detail', 'url', '/api/anime/auratail-detail', 'url']
    : u.includes('komikindo')
    ? ['/api/anime/komikindo-detail', 'url', '/api/anime/otakudesu/detail', 'url', '/api/anime/anichin-detail', 'url', '/api/anime/samehadaku/detail', 'link', '/api/anime/auratail-detail', 'url']
    : ['/api/anime/otakudesu/detail', 'url', '/api/anime/anichin-detail', 'url', '/api/anime/samehadaku/detail', 'link', '/api/anime/komikindo-detail', 'url', '/api/anime/auratail-detail', 'url'];
  const detail = await firstNonEmpty<any>([
    () => sipDetail(chain[0], chain[1], url),
    () => sipDetail(chain[2], chain[3], url),
    () => sipDetail(chain[4], chain[5], url),
    () => sipDetail(chain[6], chain[7], url),
    () => sipDetail(chain[8], chain[9], url),
  ]);
  // episode list & unduhan dilengkapi dari endpoint khusus bila detail kurang
  if (detail && !detail.episodes.length) {
    const eps = await firstNonEmpty<any[]>([
      () => sipList('/api/anime/anichin-episode', { url }),
      () => sipList('/api/anime/oploverz-episode', { url }),
    ]);
    if (eps) detail.episodes = eps.map((e: any) => ({ slug: e.slug || e.url, title: e.title, poster: e.poster }));
  }
  if (detail && !detail.downloads.length) {
    const raw = await firstNonEmpty<any>([
      () => sipGet('/api/anime/otakudesu/download', { url }, 40000),
      () => sipGet('/api/anime/anichin-download', { url }, 40000),
      () => sipGet('/api/anime/oploverz-download', { url }, 40000),
      () => sipGet('/api/anime/samehadaku/download', { url }, 40000),
      () => sipGet('/api/anime/komikindo-download', { url }, 40000),
    ]);
    const nd = raw ? normAnimeDetail({ download: raw }) : null;
    if (nd?.downloads?.length) detail.downloads = nd.downloads;
  }
  return detail;
}

const listHasItems = (v: any) => Array.isArray(v) && v.length > 0;

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

  const s = (v: any, max = 300) => String(v ?? '').slice(0, max).trim();

  const routes: Record<string, () => Promise<{ ok: boolean; status: number; data: any }>> = {
    song_search: () => jereGet('/api/search/spotify', { query: s(body.query, 120) }),
    song_play: () => jereGet('/api/downloader/play', { q: s(body.q, 160) }, 40000),
    song_download: () => jereGet('/api/downloader/ytmp3', { url: s(body.url, 400) }, 60000),
    lyrics: () => jereGet('/api/search/lirik', { q: s(body.q, 160) }),
    yt_search: () => jereGet('/api/search/youtube', { q: s(body.q, 120) }),
    yt_dl: () => jereGet('/api/downloader/youtube', { url: s(body.url, 400), format: s(body.format, 10) || 'mp3' }, 60000),
  };

  const action = String(body?.action ?? '');
  const isAnime = action.startsWith('anime_');
  const run = routes[action];
  if (!run && !isAnime) return fail(res, 400, 'Aksi tidak dikenal.');
  // musik masih butuh key Jerexd; ANIME TIDAK LAGI (jalan penuh via siputzx keyless + fallback)
  if (!process.env.JEREXD_APIKEY && !isAnime) return fail(res, 503, 'Layanan konten belum dikonfigurasi (JEREXD_APIKEY tidak ada di server).');

  // ---------------- ANIME: SIPUTZX 27 endpoint → Jikan/ANN → gagal ----------------
  if (isAnime) {
    try {
      if (action === 'anime_latest' || action === 'anime_hot') {
        const list = await firstNonEmpty<any[]>([
          () => sipList('/api/anime/otakudesu/ongoing'),
          () => sipList('/api/anime/oploverz-ongoing'),
          action === 'anime_latest' ? () => sipList('/api/anime/anichin-latest') : () => sipList('/api/anime/anichin-popular'),
          () => sipList('/api/anime/samehadaku/latest'),
          () => sipList('/api/anime/auratail-latest'),
        ]);
        if (list) return res.status(200).json({ ok: true, list, source: 'siputzx' });
        const jk = action === 'anime_latest' ? await jikan('/top/anime?filter=airing&limit=24') : await jikan('/seasons/now?limit=24');
        const jl = (jk?.data ?? []).map(jikanCard);
        if (listHasItems(jl)) return res.status(200).json({ ok: true, list: jl, source: 'jikan' });
        return fail(res, 502, 'Sumber anime sedang gangguan — coba lagi sebentar.');
      }
      if (action === 'anime_search') {
        const q = s(body.query, 120);
        if (!q) return fail(res, 400, 'Kata kunci pencarian kosong.');
        const list = await firstNonEmpty<any[]>([
          () => sipList('/api/anime/otakudesu/search', { s: q }),
          () => sipList('/api/anime/anichin-search', { query: q }),
          () => sipList('/api/anime/oploverz-search', { query: q }),
          () => sipList('/api/anime/samehadaku/search', { query: q }),
          () => sipList('/api/anime/komikindo-search', { query: q }),
          () => sipList('/api/anime/auratail-search', { query: q }),
        ]);
        if (list) return res.status(200).json({ ok: true, list, source: 'siputzx' });
        const d = await jikan(`/anime?q=${encodeURIComponent(q)}&limit=24&sfw=true`);
        const jl = (d?.data ?? []).map(jikanCard);
        if (listHasItems(jl)) return res.status(200).json({ ok: true, list: jl, source: 'jikan' });
        return fail(res, 502, 'Pencarian gagal — sumber anime sedang gangguan.');
      }
      if (action === 'anime_detail') {
        const slug = s(body.slug, 300);
        if (slug.startsWith('jikan:')) {
          const d = await jikanDetail(slug);
          return res.status(200).json({ ok: true, anime: d, source: 'jikan' });
        }
        const anime = await sipAnimeDetail(asUrl(slug));
        if (anime) return res.status(200).json({ ok: true, anime, source: 'siputzx' });
        return fail(res, 502, 'Detail anime tidak dapat dibaca — coba judul lain.');
      }
      if (action === 'anime_schedule') {
        const list = await firstNonEmpty<any[]>([
          () => sipList('/api/anime/auratail-schedule'),
          () => sipList('/api/anime/samehadaku/release'),
        ]);
        if (list) return res.status(200).json({ ok: true, list, source: 'siputzx' });
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const day = days[new Date().getDay()];
        const d = await jikan(`/schedules?filter=${day}&limit=24&sfw=true`);
        const jl = (d?.data ?? []).map(jikanCard);
        if (listHasItems(jl)) return res.status(200).json({ ok: true, list: jl, source: 'jikan' });
        return fail(res, 502, 'Jadwal rilis sedang tidak tersedia.');
      }
      if (action === 'anime_quotes') {
        const seeds = ['naruto', 'one piece', 'jujutsu kaisen', 'aot', 'demonslayer', 'bleach', 'spy x family'];
        const q = s(body.query, 80) || seeds[Math.floor(Math.random() * seeds.length)];
        const d = await sipGet('/api/s/animequotes', { query: q });
        const quotes = normQuotes(d);
        if (quotes.length) return res.status(200).json({ ok: true, quotes, source: 'siputzx' });
        const jq = await jikanQuotes();
        if (jq.length) return res.status(200).json({ ok: true, quotes: jq, source: 'jikan' });
        return fail(res, 502, 'Kutipan tidak dapat dibaca dari layanan.');
      }
      if (action === 'anime_news') {
        const d = await sipGet('/api/anime/samehadaku/release');
        const news = normNews(d);
        if (news.length) return res.status(200).json({ ok: true, news, source: 'siputzx' });
        const an = await annNews();
        if (an.length) return res.status(200).json({ ok: true, news: an, source: 'ann' });
        return fail(res, 502, 'Berita anime sedang tidak tersedia.');
      }
      return fail(res, 400, 'Aksi anime tidak dikenal.');
    } catch (e: any) {
      const msg = e?.name === 'AbortError' ? 'Waktu tunggu layanan anime habis.' : 'Gagal menghubungi layanan anime.';
      return fail(res, 504, msg);
    }
  }

  try {
    const r = await run!().catch(() => ({ ok: false, status: 0, data: null }));
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
