/** Isolated debug: normAnimeList vs live otakudesu-search response. */
import { readFileSync } from 'node:fs';
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const BASE = 'https://api.jerexd.my.id';
const KEY = process.env.JEREXD_APIKEY;

const ctl = new AbortController();
const timer = setTimeout(() => ctl.abort(), 25000);
const r = await fetch(`${BASE}/api/anime/otakudesu-search?${new URLSearchParams({ query: 'one piece', apikey: KEY })}`, { headers: { accept: 'application/json', 'x-api-key': KEY }, signal: ctl.signal });
clearTimeout(timer);
const data = await r.json();
console.log('RAW keys:', Object.keys(data));
console.log('result keys:', Object.keys(data.result ?? {}));
console.log('first item:', JSON.stringify(data.result?.items?.[0]));

// unwrap copy
function unwrap(data: any): any {
  if (!data || typeof data !== 'object') return data;
  for (const k of ['result', 'data', 'results', 'response']) {
    const v = data[k];
    if (Array.isArray(v) || (v && typeof v === 'object')) return v;
  }
  return data;
}
const p = unwrap(data);
console.log('unwrapped keys:', Object.keys(p ?? {}));
console.log('p.items is array:', Array.isArray(p?.items));
const slugify = (v: string) => String(v ?? '').replace(/^https?:\/\/[^/]+\/anime\//, '').replace(/\/+$/, '');
const a = data.result?.items?.[0];
console.log('slugify(url):', slugify(a?.url ?? ''));
