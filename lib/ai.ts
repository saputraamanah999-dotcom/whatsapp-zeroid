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

async function post(body: any, ms = 45000): Promise<any> {
  return proxyPost('/api/ai', body, ms);
}

/**
 * Ask the AI assistant through the server proxy.
 * Only the explicitly provided prompt + short history is sent — never the
 * whole private conversation (the caller passes only what the user approved).
 */
export async function askAI(
  prompt: string,
  opts: { history?: { role: 'user' | 'assistant'; content: string }[]; model?: string; sessionId?: string } = {}
): Promise<AiResult> {
  const messages: AiMessage[] = [
    { role: 'system', content: 'Kamu adalah asisten AI Zeroid-whatsapp. Jawab singkat, jelas, dan membantu dalam bahasa pengguna.' },
    ...(opts.history ?? []).slice(-10),
    { role: 'user', content: prompt },
  ];
  const data = await post(
    { action: 'chat', messages, model: opts.model, sessionId: opts.sessionId },
    45000
  );
  const text = String(data?.text ?? '').trim();
  if (!text) throw new Error('Respons AI kosong.');
  return { text };
}

/** DeepSeek R1 deep reasoning with optional web search. */
export async function thinkAI(
  prompt: string,
  opts: { search?: boolean; sessionId?: string } = {}
): Promise<AiResult> {
  const data = await post({ action: 'thinking', prompt, search: !!opts.search, sessionId: opts.sessionId }, 70000);
  const text = String(data?.text ?? '').trim();
  if (!text) throw new Error('Respons AI kosong.');
  return { text, reasoning: data?.reasoning ? String(data.reasoning) : undefined };
}

/** Analyse an image (URL must be https — e.g. a Firebase Storage download URL). */
export async function analyzeImage(url: string, prompt = 'Jelaskan gambar ini secara detail'): Promise<AiResult> {
  const data = await post({ action: 'vision', url, prompt }, 60000);
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

/** Quick actions for the AI panel. */
export const AI_ACTIONS = [
  { key: 'translate', label: 'Terjemahkan ke Inggris', build: (t: string) => `Terjemahkan teks berikut ke bahasa Inggris, jawab hanya hasil terjemahannya:\n\n${t}` },
  { key: 'rewrite', label: 'Perbaiki penulisan', build: (t: string) => `Perbaiki ejaan dan tata bahasa teks berikut, jawab hanya hasil perbaikannya:\n\n${t}` },
  { key: 'summarise', label: 'Ringkas', build: (t: string) => `Ringkas teks berikut dalam 2-3 kalimat:\n\n${t}` },
  { key: 'code', label: 'Bantu kode', build: (t: string) => `Bantu jelaskan atau perbaiki potongan kode berikut:\n\n${t}` },
] as const;
