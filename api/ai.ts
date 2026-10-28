/**
 * Vercel serverless proxy — Zeroid AI (Jerexd upstream).
 * The JEREXD_APIKEY lives ONLY in Vercel environment variables (server side)
 * — it is never shipped to the client. Validates input, enforces a per-IP
 * rate limit + hard timeout, and never echoes the key.
 *
 * Upstream actions (verified against the Jerexd docs — /api/ai/gpt does NOT exist):
 *  - chat      : multi-model chat with persistent session → POST /api/ai/aichat
 *                body: { apikey, prompt|messages, model, session_id, reset }
 *                model=list returns the available model list
 *  - thinking  : DeepSeek R1 deep reasoning (+ web search)     → POST /api/ai/deepseek
 *                body: { apikey, prompt, thinking=true, search }
 *  - vision    : analyse / OCR an image by URL                 → POST /api/ai/chatvision-v2
 *                body: { apikey, url, prompt }
 */
export const config = { runtime: 'nodejs' };

const JEREXD_BASE = 'https://api.jerexd.my.id';

// simple per-instance rate limiting (per IP, 30 req / 5 min)
const hits = new Map<string, number[]>();
const WINDOW = 5 * 60 * 1000;
const MAX_HITS = 30;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (arr.length >= MAX_HITS) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  return false;
}

/** Recursively find a readable text answer in the various upstream shapes. */
function pickText(data: any, depth = 0): string {
  if (typeof data === 'string') return data;
  if (!data || typeof data !== 'object' || depth > 4) return '';
  for (const k of ['result', 'data', 'message', 'text', 'answer', 'response', 'content']) {
    const v = (data as any)[k];
    if (typeof v === 'string' && v.trim()) return v;
    if (v && typeof v === 'object') {
      const nested = pickText(v, depth + 1);
      if (nested) return nested;
    }
  }
  return '';
}

/** Pull the R1 chain-of-thought field when present. */
function pickThinking(data: any): string {
  if (!data || typeof data !== 'object') return '';
  for (const k of ['reasoning', 'thinking', 'reasoning_content', 'thought', 'chain_of_thought']) {
    const v = (data as any)[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
}

async function jerePost(path: string, payload: Record<string, any>, timeoutMs: number): Promise<{ ok: boolean; status: number; data: any }> {
  const key = process.env.JEREXD_APIKEY ?? '';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${JEREXD_BASE}${path}`, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-api-key': key },
      body: JSON.stringify({ ...payload, apikey: key }),
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

const bad = (res: any, status: number, error: string) => res.status(status).json({ error });

export default async function handler(req: any, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, configured: !!process.env.JEREXD_APIKEY, service: 'zeroid-ai-proxy' });
  }
  if (req.method !== 'POST') return bad(res, 405, 'Method not allowed');

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'local';
  if (rateLimited(ip)) return bad(res, 429, 'Terlalu banyak permintaan. Coba lagi beberapa menit lagi.');
  if (!process.env.JEREXD_APIKEY) return bad(res, 503, 'Layanan AI belum dikonfigurasi (JEREXD_APIKEY tidak ada di server).');

  let body: any;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return bad(res, 400, 'Body tidak valid.'); }
  const action = String(body?.action ?? 'chat');
  const s = (v: any, max: number) => String(v ?? '').slice(0, max).trim();

  try {
    if (action === 'models') {
      // upstream replies: models[] at TOP level + human list inside message
      const r = await jerePost('/api/ai/aichat', { prompt: 'list', model: 'list' }, 20000);
      const raw = r.data;
      let list: string[] = Array.isArray(raw?.models)
        ? raw.models.map((x: any) => (typeof x === 'string' ? x : String(x?.name ?? x?.id ?? ''))).filter(Boolean)
        : [];
      if (!list.length && Array.isArray(raw?.result))
        list = raw.result.map((x: any) => (typeof x === 'string' ? x : String(x?.name ?? x?.id ?? ''))).filter(Boolean);
      if (!list.length && typeof raw?.message === 'string') {
        // message embeds the list; also accept free text after ':', comma or newline separated
        list = raw.message.split(/\n|,|·|;/).map((x: string) => x.trim().replace(/^[-*\d.\s]+/, '')).filter((x: string) => x.includes('/') || x.length > 2).slice(0, 80);
      }
      if (!r.ok) return bad(res, 502, `Layanan AI gagal: ${String(raw?.error ?? raw?.message ?? `HTTP ${r.status}`).slice(0, 160)}`);
      return res.status(200).json({ ok: true, models: [...new Set(list)].slice(0, 80) });
    }

    if (action === 'chat') {
      const messages = Array.isArray(body?.messages) ? body.messages : null;
      if (!messages || !messages.length || messages.length > 24) return bad(res, 400, 'Percakapan tidak valid.');
      for (const m of messages) {
        if (!m || typeof m.content !== 'string' || typeof m.role !== 'string') return bad(res, 400, 'Pesan tidak valid.');
        if (m.content.length > 4000) return bad(res, 400, 'Pesan terlalu panjang (maks 4000 karakter).');
      }
      const sessionId = s(body?.sessionId, 80) || `zw_${ip.replace(/[^0-9a-f]/gi, '').slice(0, 24) || 'anon'}`;
      // flatten short history into the prompt; aichat keeps its own session memory
      const prompt = messages
        .filter((m: any) => m.role !== 'system')
        .map((m: any) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
        .join('\n\n') + '\n\nAssistant:';
      const r = await jerePost('/api/ai/aichat', { prompt: prompt.slice(0, 8000), model: s(body?.model, 60) || 'gpt', session_id: sessionId }, 45000);
      if (!r.ok) return bad(res, 502, `Layanan AI gagal: ${String(r.data?.error ?? r.data?.message ?? `HTTP ${r.status}`).slice(0, 160)}`);
      const text = pickText(r.data);
      if (!text) return bad(res, 502, 'Respons AI tidak dapat dibaca.');
      return res.status(200).json({ ok: true, text: text.slice(0, 8000) });
    }

    if (action === 'thinking') {
      const prompt = s(body?.prompt, 4000);
      if (!prompt) return bad(res, 400, 'Prompt kosong.');
      const sessionId = s(body?.sessionId, 80) || `zw_${ip.replace(/[^0-9a-f]/gi, '').slice(0, 24) || 'anon'}`;
      // NOTE: docs JERE — deepseek memakai param 'chatId' (bukan session_id) untuk multi-turn.
      // Upstream bug (observed live): model R1 with thinking=true sometimes answers with an
      // EMPTY response string. If that happens, retry once without thinking (DeepSeek V3)
      // so the user always receives a real answer instead of an error.
      let r = await jerePost('/api/ai/deepseek', { prompt, thinking: true, search: !!body?.search, chatId: sessionId }, 70000);
      let text = pickText(r.data);
      if (r.ok && !text) {
        r = await jerePost('/api/ai/deepseek', { prompt, thinking: false, search: !!body?.search, chatId: sessionId }, 70000);
        text = pickText(r.data);
      }
      if (!r.ok) return bad(res, 502, `Layanan AI gagal: ${String(r.data?.error ?? r.data?.message ?? `HTTP ${r.status}`).slice(0, 160)}`);
      if (!text) return bad(res, 502, 'Respons AI tidak dapat dibaca.');
      return res.status(200).json({ ok: true, text: text.slice(0, 12000), reasoning: pickThinking(r.data).slice(0, 12000) || undefined });
    }

    if (action === 'vision') {
      const url = s(body?.url, 800);
      const prompt = s(body?.prompt, 1000) || 'Jelaskan gambar ini secara detail';
      if (!/^https:\/\//i.test(url)) return bad(res, 400, 'URL gambar harus https.');
      // send both accepted param names (v1 uses image_url, v2 accepts url — belt & braces)
      const r = await jerePost('/api/ai/chatvision-v2', { url, image_url: url, prompt }, 60000);
      if (!r.ok) return bad(res, 502, `Layanan AI gagal: ${String(r.data?.error ?? r.data?.message ?? `HTTP ${r.status}`).slice(0, 160)}`);
      const text = pickText(r.data);
      if (!text) return bad(res, 502, 'Respons AI tidak dapat dibaca.');
      return res.status(200).json({ ok: true, text: text.slice(0, 8000) });
    }

    return bad(res, 400, 'Aksi tidak dikenal.');
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Waktu tunggu AI habis.' : 'Gagal menghubungi layanan AI.';
    return bad(res, 504, msg);
  }
}
