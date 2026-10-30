/**
 * AI assistant client. All JEREXD traffic goes through the server-side proxy
 * (/api/ai on Vercel) so the API key NEVER reaches the browser/app bundle.
 * No offline fake brain — when the proxy is unavailable the user sees an error.
 * Transport: lib/proxy.ts (EXPO_PUBLIC_API_BASE aware, web + APK).
 *
 * Capabilities:
 *  - multi-provider chat (model selection, persistent server session)
 *  - thinking mode (DeepSeek R1 reasoning + optional web search)
 *  - image analysis / OCR via vision endpoint (URL must be https, e.g. Firebase Storage)
 */

import { proxyPost } from './proxy';
import { firebase } from './firebase';

/** Curated providers shown before the live model list loads. */
export const AI_PROVIDERS = [
  { id: 'gpt', label: 'GPT' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'grok', label: 'Grok' },
  { id: 'copilot', label: 'Copilot' },
  { id: 'claude', label: 'Claude' },
  { id: 'zai', label: 'Z.AI' },
  { id: 'llama', label: 'Llama' },
] as const;

export type AiMessage = { role: 'user' | 'assistant' | 'system'; content: string };
export type AiResult = { text: string; reasoning?: string };

let modelCache: { at: number; models: string[] } | null = null;

async function post(body: any, ms = 45000, headers?: Record<string, string>): Promise<any> {
  // Hook uji (inert di produksi — selalu 0): memungkinkan menguji indikator
  // "sedang mengetik" dengan memperlambat panggilan AI lewat console
  // (__AI_TEST_DELAY__ = ms). Tidak mengubah perilaku normal sama sekali.
  const testDelay = (globalThis as any).__AI_TEST_DELAY__ ?? 0;
  if (testDelay > 0) await new Promise((r) => setTimeout(r, testDelay));
  return proxyPost('/api/ai', body, ms, headers);
}

/**
 * Ask the AI assistant through the server proxy.
 * Only the explicitly provided prompt + short history is sent — never the
 * whole private conversation (the caller passes only what the user approved).
 */
/** Persona opsional dari config/ai_profile (diubah developer) — dipakai server menyusun system prompt. */
export type Persona = { aiName?: string; aiBio?: string };

export async function askAI(
  prompt: string,
  opts: { history?: { role: 'user' | 'assistant'; content: string }[]; model?: string; sessionId?: string } & Persona = {}
): Promise<AiResult> {
  const messages: AiMessage[] = [
    { role: 'system', content: 'Kamu adalah Zeroid AI, asisten resmi ZEROID WhatsApp milik SAPUTRA || DEV WEBSITE. Jawab singkat, jelas, dan membantu dalam bahasa pengguna.' },
    ...(opts.history ?? []).slice(-10),
    { role: 'user', content: prompt },
  ];
  const body = { action: 'chat', messages, model: opts.model, sessionId: opts.sessionId, aiName: opts.aiName, aiBio: opts.aiBio };
  // upstream AI kadang lambat > 45 dtk (penyebab AbortError spam) — beri waktu lebih
  // dan sekali auto-retry ketika timeout, sebelum menyerah ke pengguna.
  let lastErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const data = await post(body, 75000);
      const text = String(data?.text ?? '').trim();
      if (!text) throw new Error('Respons AI kosong.');
      return { text };
    } catch (e: any) {
      lastErr = e;
      const timedOut = e?.name === 'AbortError' || /waktu tunggu/i.test(String(e?.message ?? ''));
      if (timedOut && attempt === 0) continue; // coba sekali lagi
      throw e;
    }
  }
  throw lastErr;
}

/** DeepSeek R1 deep reasoning with optional web search. */
export async function thinkAI(
  prompt: string,
  opts: { search?: boolean; sessionId?: string } & Persona = {}
): Promise<AiResult> {
  const data = await post({ action: 'thinking', prompt, search: !!opts.search, sessionId: opts.sessionId, aiName: opts.aiName, aiBio: opts.aiBio }, 90000);
  const text = String(data?.text ?? '').trim();
  if (!text) throw new Error('Respons AI kosong.');
  return { text, reasoning: data?.reasoning ? String(data.reasoning) : undefined };
}

/** Analyse an image (URL must be https — e.g. a Firebase Storage download URL). */
export async function analyzeImage(url: string, prompt = 'Jelaskan gambar ini secara detail', persona?: Persona): Promise<AiResult> {
  const data = await post({ action: 'vision', url, prompt, ...(persona ?? {}) }, 75000);
  const text = String(data?.text ?? '').trim();
  if (!text) throw new Error('Respons AI kosong.');
  return { text };
}

/** Live model list from the upstream (cached 1 hour in memory). */
export async function listAIModels(): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < 3600000) return modelCache.models;
  const data = await post({ action: 'models' }, 20000);
  const models: string[] = Array.isArray(data?.models) ? data.models : [];
  modelCache = { at: Date.now(), models: models.length ? models : ['gpt'] };
  return modelCache.models;
}

/** Summarise a set of selected messages (user-initiated, explicit consent). */
export async function summariseTexts(texts: string[]): Promise<AiResult> {
  const joined = texts.slice(0, 50).map((t) => `- ${t.slice(0, 500)}`).join('\n');
  return askAI(`Ringkas pesan-pesan berikut dalam poin-poin singkat:\n${joined}`);
}

// ---------------- PENCARIAN WEB (fitur baru) ----------------
export type WebResult = { title: string; url: string; snippet: string };

/** Cari di Google/Web lewat server (Vexo Google → Vexo DDG → DuckDuckGo). */
export async function webSearch(query: string): Promise<WebResult[]> {
  const data = await post({ action: 'search', query: String(query ?? '').slice(0, 300) }, 45000);
  return Array.isArray(data?.results) ? data.results.slice(0, 8) : [];
}

// ---------------- BOT ZEROID (server-side) ----------------
/**
 * Minta BOT "Zeroid Bot" menjawab di chat setelah ada pesan yang menyebutnya.
 * Dipanggil fire-and-forget oleh sendMessage — server memverifikasi sesi
 * (ID token), memeriksa keanggotaan chat, lalu menulis balasan bot dari server
 * sehingga bot menjawab meskipun TIDAK ADA perangkat developer yang online.
 */
export async function askBotReply(
  chatId: string,
  text: string,
  senderName: string,
  opts: { aiName?: string; aiBio?: string; history?: { role: 'user' | 'assistant'; content: string }[] } = {}
): Promise<void> {
  const cu = firebase()?.auth.currentUser;
  if (!cu) throw new Error('Belum masuk.');
  const token = await cu.getIdToken();
  await post(
    {
      action: 'bot-reply',
      chatId: String(chatId ?? '').slice(0, 80),
      text: String(text ?? '').slice(0, 4000),
      senderName: String(senderName ?? '').slice(0, 40),
      aiName: opts.aiName,
      aiBio: opts.aiBio,
      history: (opts.history ?? []).slice(-6),
    },
    60000,
    { authorization: `Bearer ${token}` }
  );
}

/** Quick actions for the AI panel. */
export const AI_ACTIONS = [
  { key: 'translate', label: 'Terjemahkan ke Inggris', build: (t: string) => `Terjemahkan teks berikut ke bahasa Inggris, jawab hanya hasil terjemahannya:\n\n${t}` },
  { key: 'rewrite', label: 'Perbaiki penulisan', build: (t: string) => `Perbaiki ejaan dan tata bahasa teks berikut, jawab hanya hasil perbaikannya:\n\n${t}` },
  { key: 'summarise', label: 'Ringkas', build: (t: string) => `Ringkas teks berikut dalam 2-3 kalimat:\n\n${t}` },
  { key: 'code', label: 'Bantu kode', build: (t: string) => `Bantu jelaskan atau perbaiki potongan kode berikut:\n\n${t}` },
] as const;
