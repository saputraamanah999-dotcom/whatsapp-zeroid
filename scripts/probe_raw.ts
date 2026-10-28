/** Raw upstream probe: print exact JSON shapes for failing endpoints + alternate paths. */
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
  const timer = setTimeout(() => ctl.abort(), 30000);
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
    console.log(`\n### ${name}  [${method} ${path}] → HTTP ${r.status}`);
    console.log(pretty.slice(0, 600));
  } catch (e: any) {
    console.log(`\n### ${name}  [${method} ${path}] → ERROR ${e?.message}`);
  } finally { clearTimeout(timer); }
}

async function main() {
  // ---- anime family: exact shapes + alternates ----
  await probe('anime/latest', '/api/anime/latest');
  await probe('anime/hot', '/api/anime/hot');
  await probe('otakudesu-search', '/api/anime/otakudesu-search', { qs: { query: 'one piece' } });
  await probe('otakudesu-detail', '/api/anime/otakudesu-detail-download', { qs: { slug: 'one-piece' } });
  await probe('jadwalrilis', '/api/anime/jadwalrilis');
  await probe('animequotes', '/api/random/animequotes');
  await probe('berita', '/api/anime/berita');
  // possible alternates
  await probe('ALT anime (no /anime)', '/api/latest');
  await probe('ALT otakudesu ongoing', '/api/anime/otakudesu-ongoing');
  await probe('ALT otakudesu-terbaru', '/api/anime/otakudesu-terbaru');
  // ---- ai family ----
  await probe('aichat model=list', '/api/ai/aichat', { method: 'POST', body: { prompt: 'list', model: 'list' } });
  await probe('deepseek', '/api/ai/deepseek', { method: 'POST', body: { prompt: '1+1=? jawab angka saja', thinking: true, chatId: 'probe1' } });
  await probe('chatvision-v2', '/api/ai/chatvision-v2', { method: 'POST', body: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png', prompt: 'Apa ini?' } });
  await probe('ALT chatvision v1', '/api/ai/chatvision', { method: 'POST', body: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png', prompt: 'Apa ini?' } });
}
main();
