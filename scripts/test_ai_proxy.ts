/** Local test harness for api/ai.ts (Node 24+): mock upstream, 8 checks. */
type Out = { status?: number; json?: any };
function makeRes() { const out: Out = {}; const res: any = { setHeader() {}, status(c: number) { out.status = c; return res; }, json(d: any) { out.json = d; return res; } }; return { res, out }; }
function makeReq(method: 'GET' | 'POST', body?: any) { return { method, headers: { 'x-forwarded-for': '1.2.3.4', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }; }
let pass = 0, fail = 0;
function check(n: string, c: boolean, e?: any) { if (c) { pass++; console.log('  PASS ', n); } else { fail++; console.log('  FAIL ', n, e !== undefined ? JSON.stringify(e)?.slice(0, 200) : ''); } }

const realFetch = globalThis.fetch;
let lastPayload: any = null;
// @ts-ignore
globalThis.fetch = async (url: any, init: any) => {
  const u = String(url);
  lastPayload = init?.body ? JSON.parse(init.body) : null;
  const J = (d: any) => ({ ok: true, status: 200, json: async () => d });
  if (u.includes('/api/ai/aichat')) {
    if (lastPayload?.model === 'list') return J({ status: true, result: ['gpt-4o', 'gpt-4o-mini', 'deepseek-v3'] });
    // BAGIAN 5: upstream kadang membocorkan metadata internal — harus dibersihkan
    if (String(lastPayload?.prompt ?? '').includes('AIREGRESSIONTEST'))
      return J({ status: true, result: { message: ':::writing{variant="chat_message"}\nHalo! Ada yang bisa saya bantu?\n:::' } });
    if (String(lastPayload?.prompt ?? '').includes('AITHINKLEAK'))
      return J({ status: true, result: { message: '<think>rahasia</think>Jawaban bersih.' } });
    return J({ status: true, result: { message: 'Halo! Saya asisten Zeroid.' } });
  }
  if (u.includes('/api/ai/deepseek')) return J({ status: true, result: { message: 'Jawaban panjang setelah berpikir.' }, reasoning: 'Langkah 1... Langkah 2...' });
  if (u.includes('/api/ai/chatvision-v2')) return J({ status: true, result: 'Gambar tersebut menunjukkan kucing oranye.' });
  return { ok: false, status: 404, json: async () => ({ error: 'not found' }) };
};

async function call(body: any) {
  const mod = await import('../api/ai.ts');
  const { res, out } = makeRes();
  await mod.default(makeReq('POST', body), res);
  return out;
}

(async () => {
  process.env.JEREXD_APIKEY = 'TESTDUMMY';
  const g = await (await import('../api/ai.ts')).default(makeReq('GET'), makeRes().res);
  // GET handled inline above via call-less path — simple check:
  const m = await call({ action: 'models' });
  check('models list parsed (gabungan VEXO)', m.status === 200 && Array.isArray(m.json?.models) && m.json.models.includes('gpt-4o') && m.json.models.length >= 3, m.json);
  const c = await call({ action: 'chat', messages: [{ role: 'user', content: 'halo' }], model: 'gpt' });
  check('chat text unwrapped', c.status === 200 && c.json?.text === 'Halo! Saya asisten Zeroid.', c.json);
  check('chat session_id sent', !!lastPayload?.session_id, lastPayload);
  const reg = await call({ action: 'chat', messages: [{ role: 'user', content: 'AIREGRESSIONTEST siapa kamu' }] });
  check('BAGIAN 5: :::writing dibersihkan, isi utuh', reg.status === 200 && reg.json?.text === 'Halo! Ada yang bisa saya bantu?', reg.json);
  const reg2 = await call({ action: 'chat', messages: [{ role: 'user', content: 'AITHINKLEAK test' }] });
  check('BAGIAN 5: <think> dibuang, jawaban bersih', reg2.status === 200 && reg2.json?.text === 'Jawaban bersih.', reg2.json);
  const t = await call({ action: 'thinking', prompt: '2+2?' });
  check('thinking text + reasoning', t.status === 200 && !!t.json?.text && !!t.json?.reasoning, t.json);
  const v = await call({ action: 'vision', url: 'https://x.test/cat.jpg', prompt: 'apa ini?' });
  check('vision text', v.status === 200 && /kucing/i.test(v.json?.text ?? ''), v.json);
  const bad = await call({ action: 'vision', url: 'http://insecure.jpg' });
  check('vision http rejected 400', bad.status === 400, bad);
  const nomsg = await call({ action: 'chat', messages: [] });
  check('empty messages 400', nomsg.status === 400, nomsg);
  delete (process.env as any).JEREXD_APIKEY;
  const nk = await call({ action: 'chat', messages: [{ role: 'user', content: 'x' }] });
  check('tanpa kunci → gagal jujur (502, tanpa karangan)', nk.status === 502 && /tidak bisa menjawab/i.test(String(nk.json?.error ?? '')), nk.json);
  globalThis.fetch = realFetch;
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
