/**
 * LIVE test: run the REAL serverless handlers with the REAL JERE key.
 * Tests all 13 jere actions + 4 ai actions, reports real data counts.
 * Run: JEREXD_APIKEY must be in ../.env (loaded manually here).
 */
import { readFileSync } from 'node:fs';

// load .env
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const jere = (await import('../api/jere.ts')).default;
  const ai = (await import('../api/ai.ts')).default;

  async function call(fn: any, body: any): Promise<{ status: number; json: any; ms: number }> {
    const out: any = {};
    const res: any = {
      setHeader() {},
      status(c: number) { out.status = c; return res; },
      json(d: any) { out.json = d; return res; },
    };
    const req = { method: 'POST', headers: { 'x-forwarded-for': 'test-local' }, body: JSON.stringify(body) };
    const t0 = Date.now();
    await fn(req, res);
    return { status: out.status ?? 0, json: out.json, ms: Date.now() - t0 };
  }

  let pass = 0, fail = 0;
  const results: string[] = [];
  function report(name: string, ok: boolean, detail: string, ms: number) {
    if (ok) pass++; else fail++;
    const line = `${ok ? 'PASS' : 'FAIL'}  ${name} (${ms}ms) — ${detail}`;
    results.push(line);
    console.log(line);
  }

  console.log('=== JERE actions (live, real key) ===');
  const t1 = await call(jere, { action: 'song_search', query: 'lathi' });
  report('song_search', t1.status === 200 && (t1.json?.songs?.length ?? 0) > 0,
    `${t1.json?.songs?.length ?? 0} lagu; contoh: ${JSON.stringify(t1.json?.songs?.[0])?.slice(0, 140) ?? t1.json?.error}`, t1.ms);

  const t2 = await call(jere, { action: 'song_play', q: 'lathi weird genius' });
  report('song_play', t2.status === 200 && !!t2.json?.url,
    `url: ${String(t2.json?.url)?.slice(0, 90) ?? t2.json?.error}`, t2.ms);

  const t3 = await call(jere, { action: 'lyrics', q: 'lathi' });
  report('lyrics', t3.status === 200 && (t3.json?.lyrics ?? '').length > 30,
    `${(t3.json?.lyrics ?? '').length} chars lirik`, t3.ms);

  const t4 = await call(jere, { action: 'yt_search', q: 'lathi' });
  report('yt_search', t4.status === 200 && (t4.json?.videos?.length ?? 0) > 0,
    `${t4.json?.videos?.length ?? 0} video; contoh: ${JSON.stringify(t4.json?.videos?.[0])?.slice(0, 140) ?? t4.json?.error}`, t4.ms);

  const ytUrl = t4.json?.videos?.[0]?.id ? `https://www.youtube.com/watch?v=${t4.json.videos[0].id}` : 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  const t5 = await call(jere, { action: 'song_download', url: ytUrl });
  report('song_download (ytmp3)', t5.status === 200 && !!t5.json?.url,
    `url: ${String(t5.json?.url)?.slice(0, 90) ?? t5.json?.error}`, t5.ms);

  const t6 = await call(jere, { action: 'yt_dl', url: ytUrl, format: 'mp3' });
  report('yt_dl mp3', t6.status === 200 && !!t6.json?.url,
    `url: ${String(t6.json?.url)?.slice(0, 90) ?? t6.json?.error}`, t6.ms);

  const t7 = await call(jere, { action: 'anime_latest' });
  report('anime_latest', t7.status === 200 && (t7.json?.list?.length ?? 0) > 0,
    `${t7.json?.list?.length ?? 0} anime; contoh: ${JSON.stringify(t7.json?.list?.[0])?.slice(0, 140) ?? t7.json?.error}`, t7.ms);

  const t8 = await call(jere, { action: 'anime_hot' });
  report('anime_hot', t8.status === 200 && (t8.json?.list?.length ?? 0) > 0,
    `${t8.json?.list?.length ?? 0} anime`, t8.ms);

  const t9 = await call(jere, { action: 'anime_search', query: 'one piece' });
  report('anime_search', t9.status === 200 && (t9.json?.list?.length ?? 0) > 0,
    `${t9.json?.list?.length ?? 0} hasil; slug contoh: ${t9.json?.list?.[0]?.slug ?? t9.json?.error}`, t9.ms);

  const slug = t9.json?.list?.[0]?.slug;
  const t10 = slug ? await call(jere, { action: 'anime_detail', slug }) : { status: 0, json: {}, ms: 0 };
  report('anime_detail', !!slug && t10.status === 200 && !!t10.json?.anime?.title,
    `${t10.json?.anime?.title ?? t10.json?.error} — eps: ${t10.json?.anime?.episodes?.length ?? 0}, dl: ${t10.json?.anime?.downloads?.length ?? 0}`, t10.ms);

  const t11 = await call(jere, { action: 'anime_schedule' });
  report('anime_schedule', t11.status === 200 && (t11.json?.list?.length ?? 0) > 0,
    `${t11.json?.list?.length ?? 0} jadwal`, t11.ms);

  const t12 = await call(jere, { action: 'anime_quotes' });
  report('anime_quotes', t12.status === 200 && (t12.json?.quotes?.length ?? 0) > 0,
    `${t12.json?.quotes?.length ?? 0} quotes; contoh: ${String(t12.json?.quotes?.[0]?.quote)?.slice(0, 80)}`, t12.ms);

  const t13 = await call(jere, { action: 'anime_news' });
  report('anime_news', t13.status === 200 && (t13.json?.news?.length ?? 0) > 0,
    `${t13.json?.news?.length ?? 0} berita; contoh: ${String(t13.json?.news?.[0]?.title)?.slice(0, 80)}`, t13.ms);

  console.log('\n=== AI actions (live, real key) ===');
  const a1 = await call(ai, { action: 'models' });
  report('ai models', a1.status === 200 && (a1.json?.models?.length ?? 0) > 0,
    `${a1.json?.models?.length ?? 0} models: ${String(a1.json?.models?.slice(0, 8))?.slice(0, 120) ?? a1.json?.error}`, a1.ms);

  const a2 = await call(ai, { action: 'chat', messages: [{ role: 'user', content: 'Halo, balas singkat: siapa kamu?' }] });
  report('ai chat', a2.status === 200 && (a2.json?.text ?? '').length > 0,
    `jawaban: ${String(a2.json?.text)?.slice(0, 100) ?? a2.json?.error}`, a2.ms);

  const a3 = await call(ai, { action: 'thinking', prompt: 'Berapa 12 x 12? Jawab singkat.' });
  report('ai thinking', a3.status === 200 && (a3.json?.text ?? '').length > 0,
    `jawaban: ${String(a3.json?.text)?.slice(0, 100) ?? a3.json?.error}`, a3.ms);

  const a4 = await call(ai, { action: 'vision', url: 'https://i.ytimg.com/vi/8uy7G2JXVSA/maxresdefault.jpg', prompt: 'Apa isi gambar ini? Jawab 1 kalimat.' });
  report('ai vision', a4.status === 200 && (a4.json?.text ?? '').length > 0,
    `jawaban: ${String(a4.json?.text)?.slice(0, 100) ?? a4.json?.error}`, a4.ms);

  console.log(`\n=== TOTAL: ${pass} PASS, ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('FATAL', e); process.exit(1); });
