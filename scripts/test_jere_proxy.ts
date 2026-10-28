/**
 * Local test harness for api/jere.ts (runs the REAL serverless handler on Node 24+).
 *  Test 1: live upstream with a dummy key  → expect clean 502 error mapping.
 *  Test 2: stubbed upstream payloads        → expect normalizers to shape data.
 * Run: node scripts/test_jere_proxy.ts
 */
type Out = { status?: number; json?: any };
function makeRes() {
  const out: Out = {};
  const res: any = {
    setHeader() {},
    status(code: number) { out.status = code; return res; },
    json(d: any) { out.json = d; return res; },
  };
  return { res, out };
}
function makeReq(method: 'GET' | 'POST', body?: any) {
  return {
    method,
    headers: { 'x-forwarded-for': '127.0.0.1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}
let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: any) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}`, extra !== undefined ? JSON.stringify(extra)?.slice(0, 300) : ''); }
}

async function call(action: string, params: any = {}) {
  const mod = await import('../api/jere.ts');
  const { res, out } = makeRes();
  await mod.default(makeReq('POST', { action, ...params }), res);
  return out;
}

async function main() {
  console.log('--- Test 1: handler plumbing vs LIVE upstream (dummy key) ---');
  process.env.JEREXD_APIKEY = 'TESTDUMMY123';
  const t1 = await call('song_search', { query: 'test lagu' });
  check('upstream 401 mapped to 502', t1.status === 502, t1);
  check('error mentions upstream message', /Layanan gagal/i.test(String(t1.json?.error)), t1.json);

  console.log('--- Test 2: normalizers vs realistic upstream payloads ---');
  const realFetch = globalThis.fetch;
  // @ts-ignore
  globalThis.fetch = async (url: any) => {
    const u = String(url);
    const J = (d: any) => ({ ok: true, status: 200, json: async () => d });
    if (u.includes('/api/search/spotify'))
      return J({ status: true, creator: 'jerexd', result: [
        { id: '3n3Ppam7vgaVa1iaRUc9Lp', title: 'Mr. Brightside', artist: 'The Killers', album: 'Hot Fuss', thumb: 'https://i.scdn.co/image/ab67616d0000b273', url: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp', duration: '222000' },
        { name: 'Song Two', artists: 'Artist Two', link: 'https://open.spotify.com/track/aaaaaaaaaaaaaaaaaaaaaa' },
      ]});
    if (u.includes('/api/search/lirik'))
      return J({ status: true, result: 'Lirik lagu baris satu\nbaris dua' });
    if (u.includes('/api/search/youtube'))
      return J({ status: true, result: { videos: [ { videoId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', author: 'Rick Astley', lengthText: '3:33' } ] } });
    if (u.includes('/api/downloader/play'))
      return J({ status: true, result: { title: 'Mr. Brightside', url: 'https://cdn.example.com/audio.mp3', duration: '3:42', thumb: 'https://img.example.com/x.jpg' } });
    if (u.includes('/api/downloader/ytmp3') || u.includes('/api/downloader/youtube'))
      return J({ status: true, result: { title: 'Video', url: 'https://cdn.example.com/audio2.mp3' } });
    if (u.includes('/api/anime/latest') || u.includes('/api/anime/hot'))
      return J({ status: true, result: [
        { title: 'One Piece', slug: 'one-piece', poster: 'https://otakudesu.cc/p1.jpg', episode: '1100', rating: '8.7', status: 'Ongoing' },
        { judul: 'Naruto', link: 'https://otakudesu.cc/anime/naruto/', thumb: 'https://x/p2.jpg' },
      ]});
    if (u.includes('/api/anime/otakudesu-search'))
      return J({ status: true, result: [ { title: 'Naruto Shippuden', slug: 'naruto-shippuden', poster: 'https://x/p3.jpg', episode: '500' } ] });
    if (u.includes('/api/anime/jadwalrilis'))
      return J({ status: true, result: [ { title: 'Jujutsu Kaisen', slug: 'jjk', day: 'Kamis' } ] });
    if (u.includes('/api/random/animequotes'))
      return J({ status: true, result: [ { quote: 'A lesson without pain is meaningless.', character: 'Edward Elric', anime: 'Fullmetal Alchemist' } ] });
    if (u.includes('/api/anime/berita'))
      return J({ status: true, result: [ { title: 'Musim baru diumumkan', link: 'https://otakudesu.cc/berita/x', thumb: 'https://x/n1.jpg', time: '2 jam lalu' } ] });
    if (u.includes('/api/anime/otakudesu-detail-download'))
      return J({ status: true, result: {
        title: 'Naruto Shippuden', synopsis: 'Sinopsis uji.', rating: '8.5', status: 'Completed',
        genre_list: ['Action', 'Shounen'],
        episodeList: [ { title: 'Episode 500', slug: 'naruto-shippuden-episode-500', date: '23 Mar 2017' }, 'naruto-shippuden-episode-499' ],
        download_links: [ { quality: '360p', urls: { mp4: 'https://dl.example.com/ns-500-360.mp4' } }, { quality: '720p', link: 'https://dl.example.com/ns-500-720.mkv' } ],
      }});
    return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
  };

  try {
    const s = await call('song_search', { query: 'brightside' });
    check('song_search 200', s.status === 200, s);
    check('song_search 2 tracks', s.json?.songs?.length === 2, s.json);
    check('song_search field mapping', s.json?.songs?.[0]?.title === 'Mr. Brightside' && s.json?.songs?.[0]?.artist === 'The Killers', s.json?.songs?.[0]);
    check('song_search spotify id fallback from url', s.json?.songs?.[1]?.id === 'aaaaaaaaaaaaaaaaaaaaaa', s.json?.songs?.[1]);

    const ly = await call('lyrics', { q: 'brightside' });
    check('lyrics unwrapped', ly.json?.lyrics?.includes('baris satu'), ly.json);

    const yt = await call('yt_search', { q: 'rickroll' });
    check('yt_search 1 video', yt.json?.videos?.length === 1, yt.json);
    check('yt_search id + fallback thumb', yt.json?.videos?.[0]?.id === 'dQw4w9WgXcQ' && /ytimg\.com/.test(yt.json.videos[0].thumb ?? ''), yt.json?.videos?.[0]);

    const pl = await call('song_play', { q: 'brightside' });
    check('song_play direct url found', pl.json?.url === 'https://cdn.example.com/audio.mp3', pl.json);
    check('song_play title+thumb', pl.json?.title === 'Mr. Brightside' && !!pl.json?.thumb, pl.json);

    const dl = await call('song_download', { url: 'https://youtu.be/dQw4w9WgXcQ' });
    check('song_download url found', dl.json?.url === 'https://cdn.example.com/audio2.mp3', dl.json);

    const an = await call('anime_latest', {});
    check('anime_latest 200', an.status === 200, an);
    check('anime_latest 2 items', an.json?.list?.length === 2, an.json);
    check('anime_latest mapping', an.json?.list?.[0]?.title === 'One Piece' && an.json?.list?.[0]?.episode === '1100', an.json?.list?.[0]);
    check('anime_latest judul+link fallback', an.json?.list?.[1]?.title === 'Naruto' && an.json?.list?.[1]?.slug === 'naruto', an.json?.list?.[1]);

    const sc = await call('anime_search', { query: 'naruto' });
    check('anime_search 1 result', sc.json?.list?.length === 1 && sc.json.list[0].slug === 'naruto-shippuden', sc.json);

    const jd = await call('anime_schedule', {});
    check('anime_schedule day mapped', jd.json?.list?.[0]?.releaseDay === 'Kamis', jd.json);

    const qt = await call('anime_quotes', {});
    check('anime_quotes 200 + fields', qt.status === 200 && qt.json?.quotes?.[0]?.character === 'Edward Elric', qt.json);

    const nw = await call('anime_news', {});
    check('anime_news 200 + url', nw.status === 200 && nw.json?.news?.[0]?.url === 'https://otakudesu.cc/berita/x' && nw.json?.news?.[0]?.date === '2 jam lalu', nw.json);

    const dt = await call('anime_detail', { slug: 'naruto-shippuden' });
    const A = dt.json?.anime;
    check('anime_detail 200', dt.status === 200, dt);
    check('anime_detail title/synopsis', A?.title === 'Naruto Shippuden' && A?.synopsis === 'Sinopsis uji.', A);
    check('anime_detail genres', Array.isArray(A?.genres) && A.genres.join(',') === 'Action,Shounen', A?.genres);
    check('anime_detail 2 episodes (obj + string)', A?.episodes?.length === 2, A?.episodes);
    check('anime_detail ep0 title/date', A?.episodes?.[0]?.title === 'Episode 500' && A?.episodes?.[0]?.date === '23 Mar 2017', A?.episodes?.[0]);
    check('anime_detail downloads deep-walked', A?.downloads?.length === 2 && A.downloads[0].urls[0].url === 'https://dl.example.com/ns-500-360.mp4' && A.downloads[1].urls[0].label === 'LINK', A?.downloads);

    const bad = await call(' tidak_ada' as any, {});
    check('unknown action → 400', bad.status === 400, bad);

    const nokey = { ...process.env }; delete (process.env as any).JEREXD_APIKEY;
    const nk = await call('anime_latest', {});
    check('missing key → 503 with clear message', nk.status === 503 && /belum dikonfigurasi/i.test(String(nk.json?.error)), nk.json);
    (process.env as any).JEREXD_APIKEY = nokey.JEREXD_APIKEY;
  } finally {
    globalThis.fetch = realFetch;
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
