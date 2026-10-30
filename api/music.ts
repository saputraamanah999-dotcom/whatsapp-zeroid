/// <reference types="node" />
/**
 * Vercel serverless — ZEROID MUSIC (Spotify kita).
 *
 * Desain endpoint meniru rapxz-music (zip yang dikirim user):
 *   search → daftar lagu/album/playlist/artis
 *   stream → URL audio siap putar (ytplay)
 *   lyrics → lirik lengkap
 *   suggest → saran pencarian
 * Tapi sumbernya diganti yang lebih kokoh (backend rapxz.eu.cc sudah mati):
 *   - search  : YouTube Music InnerTube (WEB_REMIX) — tanpa key rahasia
 *   - stream  : Piped instances → Invidious instances → InnerTube ANDROID
 *   - lyrics  : LRCLIB (lirik besar, gratis, tanpa key)
 *   - suggest : Google suggest (client=firefox, ds=yt)
 *
 * GET /api/music?action=search&q=...&type=songs|videos|albums|playlists|artists|all
 * GET /api/music?action=stream&id=<videoId>
 * GET /api/music?action=lyrics&id=&title=&artist=
 * GET /api/music?action=suggest&q=
 * GET /api/music  (health)
 *
 * Balasan meniru bentuk rapxz: { status, creator, result }
 */
export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

const ITUBE_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30'; // public web key for youtubei
const YTM_BASE = 'https://music.youtube.com/youtubei/v1';
const WEB_REMIX_CTX = {
  client: { clientName: 'WEB_REMIX', clientVersion: '1.20240401.01.00', hl: 'id', gl: 'ID' },
};

const FILTERS: Record<string, string> = {
  songs: 'EgWKAQIIAWoKEAkQBRAKEAMQBA==',
  videos: 'EgWKAQIQAWoKEAkQChAFEAMQBA==',
  albums: 'EgWKAQIYAWoKEAkQChAFEAMQBA==',
  artists: 'EgWKAQIgAWoKEAkQChAFEAMQBA==',
  playlists: 'EgWKAQIoAWoKEAkQChAFEAMQBA==',
};

const UA = 'zeroid-music/1.0 (+https://zeroid.app)';

async function j(url: string, opts: any = {}, ms = 15000): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { 'user-agent': UA, ...(opts?.headers ?? {}) } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------------- InnerTube search ----------------

type Song = { videoId: string; title: string; artist?: string; album?: string; duration?: string; thumb?: string; playlistId?: string };
type Album = { browseId: string; title: string; artist?: string; year?: string; thumb?: string };
type Playlist = { browseId: string; title: string; author?: string; thumb?: string };
type Artist = { browseId: string; name: string; subs?: string; thumb?: string };

const runs = (o: any): string =>
  o?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text ?? '').join('') ?? '';

function thumbs(o: any): string | undefined {
  const th = o?.musicThumbnailRenderer?.thumbnail?.thumbnails;
  if (!Array.isArray(th) || !th.length) return undefined;
  return bigThumb(th[th.length - 1]?.url);
}

/**
 * Thumbnail YouTube Music default sering cuma w120-h120 → pecah/blur di
 * pemutar penuh (260px). Googleusercontent menerima parameter ukuran, jadi
 * tinggal dinaikkan ke w544-h544 (URL sama, gambar tajam). URL lain dibiarkan.
 */
function bigThumb(url?: string): string | undefined {
  if (!url || typeof url !== 'string') return url;
  if (/googleusercontent\.com/.test(url) && /=w\d+-h\d+/.test(url)) {
    return url.replace(/=w\d+-h\d+[^/]*$/, '=w544-h544-l90-rj');
  }
  if (/i\.ytimg\.com\/.+\/default\.jpg$/.test(url)) {
    return url.replace(/default\.jpg$/, 'hqdefault.jpg');
  }
  return url;
}

function parseShelf(shelf: any): { songs: Song[]; albums: Album[]; playlists: Playlist[]; artists: Artist[] } {
  const out = { songs: [] as Song[], albums: [] as Album[], playlists: [] as Playlist[], artists: [] as Artist[] };
  const items: any[] = shelf?.musicShelfRenderer?.contents ?? [];
  for (const raw of items) {
    // item bisa berupa renderer langsung atau dibungkus musicResponsiveListItemRenderer
    const it = raw?.musicResponsiveListItemRenderer ?? raw;
    const cols = it?.flexColumns ?? [];
    const cellRuns = (c: any): any[] => c?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? [];
    const joinRuns = (c: any) => cellRuns(c).map((r) => r.text ?? '').join('');
    const title = joinRuns(cols[0]);
    const videoId =
      it?.playlistItemData?.videoId
      ?? cellRuns(cols[0])[0]?.navigationEndpoint?.watchEndpoint?.videoId
      ?? it?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId
      ?? '';
    const browse = it?.navigationEndpoint?.browseEndpoint?.browseId
      ?? cellRuns(cols[0])[0]?.navigationEndpoint?.browseEndpoint?.browseId
      ?? '';
    const thumb = bigThumb(thumbs(it) ?? it?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url);
    // kolom 2: runs = [artist, ' • ', album, ' • ', durasi/rating] — artis = run pertama
    const subCols: any[][] = cols.slice(1).map(cellRuns);
    const artist = subCols[0]?.[0]?.text?.replace(/\s*•\s*$/, '').trim() || undefined;
    const flat: string[] = subCols.flat().map((r: any) => String(r?.text ?? '').trim());
    const durRaw = flat.find((s) => /^\d+[:.]\d\d$/.test(s));
    const duration = durRaw ? durRaw.replace('.', ':') : undefined;
    const albumRaw = joinRuns(cols[2]);
    const album = albumRaw && albumRaw !== artist ? albumRaw.split('•')[0]?.trim() : undefined;
    if (videoId && title) {
      out.songs.push({ videoId, title, artist, album, duration, thumb });
    } else if (browse.startsWith('MPREb') && title) {
      out.albums.push({ browseId: browse, title, artist: subCols[0]?.[0]?.text, year: flat.find((s) => /^(19|20)\d\d$/.test(s)), thumb });
    } else if (browse.startsWith('VL') && title) {
      out.playlists.push({ browseId: browse, title, author: subCols[0]?.map((r) => r.text).join('') || undefined, thumb });
    } else if (browse.startsWith('UC') && title) {
      out.artists.push({ browseId: browse, name: title, subs: flat.find((s) => /pelanggan|subscriber/i.test(s)), thumb });
    }
  }
  // de-dup by id
  return out;
}

async function ytmSearch(query: string, filter: string) {
  const params = FILTERS[filter];
  const body: any = { context: WEB_REMIX_CTX, query };
  if (params) body.params = params;
  const d = await j(`${YTM_BASE}/search?key=${ITUBE_KEY}&prettyPrint=false`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-youtube-client-name': '67', 'x-youtube-client-version': WEB_REMIX_CTX.client.clientVersion, origin: 'https://music.youtube.com' },
    body: JSON.stringify(body),
  });
  const sections = d?.contents?.tabbedSearchResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
  let merged = { songs: [] as Song[], albums: [] as Album[], playlists: [] as Playlist[], artists: [] as Artist[] };
  for (const sec of sections) {
    const got = parseShelf(sec);
    merged.songs.push(...got.songs);
    merged.albums.push(...got.albums);
    merged.playlists.push(...got.playlists);
    merged.artists.push(...got.artists);
  }
  // de-dup by id
  const seen = new Set<string>();
  merged.songs = merged.songs.filter((s) => (seen.has(s.videoId) ? false : (seen.add(s.videoId), true)));
  return merged;
}

// ---------------- stream resolution ----------------
// Rantai resolusi 100% keyless (backend rapxz sudah mati, kuota JERE 120/hari):
//   Invidious instances → Piped instances → InnerTube (TVHTML5/ANDROID/IOS/WEB).
// Semua URL diverifikasi (range GET) sebelum dikembalikan. Kalau semua gagal,
// klien otomatis memakai fallback YouTube embed resmi.

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.ducks.party',
  'https://piapi.ggtyler.dev',
  'https://pipedapi.drgns.space',
  'https://api.piped.private.coffee',
  'https://pipedapi.reallyaweso.me',
  'https://pipedapi.orangenet.cc',
  'https://pipedapi.nosebs.ru',
];
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.f5.si',
  'https://iv.ggtyler.dev',
  'https://invidious.privacyredirect.com',
  'https://invidious.jing.rocks',
  'https://inv.tux.pizza',
];

/** light liveness probe — a stream URL that does not answer is not a success */
async function playable(url: string): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(url, { method: 'GET', headers: { range: 'bytes=0-2048', 'user-agent': UA }, signal: ctl.signal });
    clearTimeout(t);
    return r.status === 200 || r.status === 206;
  } catch {
    return false;
  }
}

async function pipedStream(videoId: string): Promise<string | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const d = await j(`${base}/streams/${videoId}`, {}, 12000);
      const audio = (d?.audioStreams ?? [])
        .filter((s: any) => typeof s?.url === 'string')
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      // prefer ~128kbps (bagus & ringan), lalu tertinggi, lalu apa saja
      const pick = audio.find((s: any) => (s.bitrate ?? 0) >= 96000 && (s.bitrate ?? 0) <= 160000) ?? audio[0];
      if (pick?.url && (await playable(pick.url))) return pick.url;
    } catch { /* next instance */ }
  }
  return null;
}

async function invidiousStream(videoId: string): Promise<string | null> {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const d = await j(`${base}/api/v1/videos/${videoId}?fields=adaptiveFormats`, {}, 12000);
      const audio = (d?.adaptiveFormats ?? [])
        .filter((s: any) => String(s?.type ?? '').startsWith('audio/') && typeof s?.url === 'string')
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const pick = audio[0];
      if (pick?.url && (await playable(pick.url))) return pick.url;
    } catch { /* next instance */ }
  }
  return null;
}

async function innertubeStream(videoId: string): Promise<string | null> {
  const clients = [
    {
      name: 'TVHTML5',
      context: { client: { clientName: 'TVHTML5', clientVersion: '7.20240401.00.00', hl: 'id', gl: 'ID' } },
      headers: { 'user-agent': 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version', 'x-youtube-client-name': '7', 'x-youtube-client-version': '7.20240401.00.00' },
    },
    {
      name: 'ANDROID',
      context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 30, hl: 'id', gl: 'ID' } },
      headers: { 'user-agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip', 'x-youtube-client-name': '3', 'x-youtube-client-version': '19.09.37' },
    },
    {
      name: 'IOS',
      context: { client: { clientName: 'IOS', clientVersion: '19.09.3', deviceModel: 'iPhone14,3', hl: 'id', gl: 'ID' } },
      headers: { 'user-agent': 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)', 'x-youtube-client-name': '5', 'x-youtube-client-version': '19.09.3' },
    },
    {
      name: 'WEB',
      context: { client: { clientName: 'WEB', clientVersion: '2.20240401.00.00', hl: 'id', gl: 'ID' } },
      headers: { 'user-agent': UA, 'x-youtube-client-name': '1', 'x-youtube-client-version': '2.20240401.00.00', origin: 'https://www.youtube.com' },
    },
  ];
  for (const c of clients) {
    try {
      const body = { context: c.context, videoId, contentCheckOk: true, racyCheckOk: true };
      const d = await j(`https://youtubei.googleapis.com/youtubei/v1/player?key=${ITUBE_KEY}&prettyPrint=false`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...c.headers },
        body: JSON.stringify(body),
      }, 14000);
      if (d?.playabilityStatus?.status !== 'OK') continue;
      const audio = (d?.streamingData?.adaptiveFormats ?? [])
        .filter((s: any) => String(s?.mimeType ?? '').startsWith('audio/') && typeof s?.url === 'string')
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
      const pick = audio[0];
      if (pick?.url && (await playable(pick.url))) return pick.url;
    } catch { /* next client */ }
  }
  return null;
}

// ---------------- lyrics (LRCLIB) ----------------

const lyrCache = new Map<string, string>();

async function lrclib(title: string, artist: string): Promise<string> {
  const key = `${artist}::${title}`.toLowerCase();
  if (lyrCache.has(key)) return lyrCache.get(key)!;
  const headers = { 'user-agent': UA, 'lrclib-client': 'Zeroid WhatsApp 1.0' };
  let list: any[] = [];
  if (title) {
    try {
      list = await j(`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}${artist ? `&artist_name=${encodeURIComponent(artist)}` : ''}`, { headers }, 12000);
    } catch { /* fallthrough */ }
  }
  if (!list.length) {
    try {
      list = await j(`https://lrclib.net/api/search?q=${encodeURIComponent([title, artist].filter(Boolean).join(' '))}`, { headers }, 12000);
    } catch { /* fallthrough */ }
  }
  const best = list.find((x) => x?.plainLyrics) ?? list[0];
  const text = String(best?.plainLyrics ?? '').trim();
  if (text) lyrCache.set(key, text);
  return text;
}

// ---------------- handler ----------------

const ok = (res: any, result: any) => res.status(200).json({ status: true, creator: 'zeroid', result });
const fail = (res: any, status: number, error: string) => res.status(status).json({ status: false, creator: 'zeroid', error });

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const q = String(req.query.q ?? req.query.query ?? '');
  const action = String(req.query.action ?? 'search');

  try {
    if (action === 'suggest') {
      if (!q.trim()) return ok(res, []);
      const d = await j(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=id&q=${encodeURIComponent(q)}`, {}, 8000);
      const list = Array.isArray(d?.[1]) ? d[1].filter((x: any) => typeof x === 'string').slice(0, 10) : [];
      return ok(res, list);
    }

    if (action === 'lyrics') {
      const id = String(req.query.id ?? '');
      const title = String(req.query.title ?? '');
      const artist = String(req.query.artist ?? '');
      if (!title && !id) return fail(res, 400, 'Sebutkan judul lagu.');
      const text = await lrclib(title, artist);
      return ok(res, { id, title, artist, lyrics: text || '', found: !!text });
    }

    if (action === 'stream') {
      const id = String(req.query.id ?? '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!id) return fail(res, 400, 'ID video wajib.');
      const url = (await invidiousStream(id)) ?? (await pipedStream(id)) ?? (await innertubeStream(id));
      if (!url) {
        // semua sumber gagal — klien beralih ke YouTube embed resmi (selalu jalan)
        return res.status(200).json({
          status: true, creator: 'zeroid',
          result: { id, download: { audio: '' }, provider: 'embed', embed: true },
        });
      }
      return ok(res, { id, download: { audio: url }, provider: new URL(url).host, embed: false });
    }

    // default: search
    if (!q.trim()) return fail(res, 400, 'Kata kunci kosong.');
    const type = String(req.query.type ?? 'all');
    if (type !== 'all' && FILTERS[type]) {
      const r = await ytmSearch(q, type);
      return ok(res, type === 'songs' ? { songs: r.songs } : type === 'albums' ? { albums: r.albums } : type === 'artists' ? { artists: r.artists } : { playlists: r.playlists });
    }
    // all: songs (utama) + sedikit playlist & artis
    const [songs, playlists, artists] = await Promise.all([
      ytmSearch(q, 'songs').catch(() => ({ songs: [] as Song[] })),
      ytmSearch(q, 'playlists').catch(() => ({ playlists: [] as Playlist[] })),
      ytmSearch(q, 'artists').catch(() => ({ artists: [] as Artist[] })),
    ]);
    return ok(res, {
      songs: songs.songs ?? [],
      playlists: (playlists.playlists ?? []).slice(0, 6),
      artists: (artists.artists ?? []).slice(0, 8),
    });
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Waktu tunggu habis — coba lagi.' : e?.message ?? 'Layanan musik gagal.';
    return fail(res, 502, String(msg).slice(0, 180));
  }
}
