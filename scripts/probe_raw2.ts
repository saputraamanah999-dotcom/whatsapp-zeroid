/** Probe round 2: alternates + param variations for failing endpoints. */
import { readFileSync } from 'node:fs';
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = 'https://api.jerexd.my.id';
const KEY = process.env.JEREXD_APIKEY;

async function probe(name: string, path: string, opts: { method?: string; body?: any; qs?: Record<string, string> } = {}) {
  const method = opts.method ?? 'GET';
  const url = method === 'GET' ? `${BASE}${path}?${new URLSearchParams({ ...(opts.qs ?? {}), apikey: KEY })}` : `${BASE}${path}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 35000);
  try {
    const r = await fetch(url, {
      method,
      signal: ctl.signal,
      headers: { accept: 'application/json', 'x-api-key': KEY, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify({ ...(opts.body ?? {}), apikey: KEY }) } : {}),
    });
    const text = await r.text();
    let pretty = text;
    try { pretty = JSON.stringify(JSON.parse(text)); } catch {}
    console.log(`\n### ${name} → HTTP ${r.status}`);
    console.log(pretty.slice(0, 500));
  } catch (e: any) {
    console.log(`\n### ${name} → ERROR ${e?.message}`);
  } finally { clearTimeout(timer); }
}

const IMG = 'https://i.ytimg.com/vi/8uy7G2JXVSA/maxresdefault.jpg';

async function main() {
  // vision: param image_url + different host (ytimg usually fetchable)
  await probe('v2 image_url + ytimg', '/api/ai/chatvision-v2', { method: 'POST', body: { image_url: IMG, prompt: 'Apa isi gambar ini? 1 kalimat.' } });
  await probe('v2 url + ytimg', '/api/ai/chatvision-v2', { method: 'POST', body: { url: IMG, prompt: 'Apa isi gambar ini? 1 kalimat.' } });
  // deepseek variations
  await probe('deepseek thinking=false', '/api/ai/deepseek', { method: 'POST', body: { prompt: 'Siapa presiden Indonesia? Jawab singkat.', thinking: false, chatId: 'probe2' } });
  await probe('deepseek thinking=true retry', '/api/ai/deepseek', { method: 'POST', body: { prompt: 'Apa ibukota Jepang? Jawab 1 kata.', thinking: true, chatId: 'probe3' } });
  await probe('deepseek search=true', '/api/ai/deepseek', { method: 'POST', body: { prompt: 'Hari ini tanggal berapa? Gunakan pencarian.', thinking: false, search: true, chatId: 'probe4' } });
  // anime detail alternates
  await probe('otakudesu-detail (tanpa -download)', '/api/anime/otakudesu-detail', { qs: { slug: '1piece-sub-indo' } });
  await probe('otakudesu-info', '/api/anime/otakudesu-info', { qs: { slug: '1piece-sub-indo' } });
  await probe('otakudesu-episode', '/api/anime/otakudesu-episode', { qs: { slug: '1piece-sub-indo' } });
  await probe('otakudesu detail url param', '/api/anime/otakudesu-detail-download', { qs: { url: 'https://otakudesu.blog/anime/1piece-sub-indo/' } });
  // search-based fallbacks that may work
  await probe('otakudesu-search (sanity ulang)', '/api/anime/otakudesu-search', { qs: { query: 'naruto' } });
  await probe('quotes sanity', '/api/random/animequotes');
}
main();
