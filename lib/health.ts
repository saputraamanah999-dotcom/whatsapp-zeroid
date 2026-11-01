/**
 * ZEROID — monitoring kesehatan backend (Firebase ↔ Supabase ↔ Server) REAL-TIME.
 *
 * Keluhan pemilik (v29): "monitoring belum berfungsi malah nyetack diem gak
 * keliatan apa-apa, tetep 0, gak real-time, mana supabase-nya". Akar masalah:
 * panel lama HANYA menghitung error klien (jadi 0 terus kalau tidak ada error)
 * dan status Supabase cuma cek konfigurasi, bukan nyala.
 *
 * Sekarang: probe NYATA yang berjalan berkala (tiap 30 dtk + saat panel dibuka):
 *  - FIREBASE  : getDoc ke config/platform diukur latensinya (baca nyata).
 *  - SUPABASE  : GET /auth/v1/health (endpoint kesehatan resmi Supabase).
 *  - SERVER    : GET /api/version (function Vercel sendiri).
 * Hasilnya tampil live di Admin Panel › Sistem › Monitoring backend.
 *
 * Penghitung error klien (permission-denied/kuota/jaringan) tetap dipertahankan.
 */
import { useSyncExternalStore } from 'react';
import { isSupabaseConfigured, sbProbeInfo } from './supabase';

export type FbErrorKind = 'permission-denied' | 'quota' | 'unavailable' | 'other';

export type ProbeResult = {
  ok: boolean;
  ms: number;
  at: number;
  detail?: string;
};

export type HealthState = {
  counts: Record<FbErrorKind, number>;
  lastCode: string;
  lastMessage: string;
  lastAt: number;
  degraded: boolean; // >= 3 error dalam 5 menit → dianggap terdegradasi
  /** v29: hasil probe LIVE tiap layanan */
  firebase: ProbeResult | null;
  supabase: ProbeResult | null;
  server: ProbeResult | null;
  probing: boolean;
  lastProbeAt: number;
};

const EMPTY: HealthState = {
  counts: { 'permission-denied': 0, quota: 0, unavailable: 0, other: 0 },
  lastCode: '', lastMessage: '', lastAt: 0, degraded: false,
  firebase: null, supabase: null, server: null, probing: false, lastProbeAt: 0,
};
let state: HealthState = { ...EMPTY, counts: { ...EMPTY.counts } };
const listeners = new Set<() => void>();
const recent: number[] = [];

function set(patch: Partial<HealthState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function recordFbError(e: any) {
  const code = String(e?.code ?? '');
  const msg = String(e?.message ?? '').slice(0, 180);
  let kind: FbErrorKind = 'other';
  if (code.includes('permission-denied') || /insufficient permissions/i.test(msg)) kind = 'permission-denied';
  else if (code.includes('resource-exhausted') || code.includes('quota') || /quota|kuota|limit/i.test(msg)) kind = 'quota';
  else if (code.includes('unavailable') || code.includes('deadline') || /network/i.test(msg)) kind = 'unavailable';
  const now = Date.now();
  state = {
    ...state,
    counts: { ...state.counts, [kind]: state.counts[kind] + 1 },
    lastCode: code || kind,
    lastMessage: msg,
    lastAt: now,
  };
  recent.push(now);
  while (recent.length && now - recent[0] > 5 * 60_000) recent.shift();
  state.degraded = recent.length >= 3;
  listeners.forEach((l) => l());
}

export function subscribeHealth(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export const getHealth = () => state;
export function useBackendHealth(): HealthState {
  return useSyncExternalStore(subscribeHealth, getHealth, getHealth);
}

async function timed(url: string, init?: RequestInit, ms = 12000): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    const res = await fetch(url, { ...init, signal: ctl.signal } as any);
    clearTimeout(timer);
    return { ok: res.status >= 200 && res.status < 500, ms: Date.now() - t0, at: Date.now(), detail: `HTTP ${res.status}` };
  } catch (e: any) {
    return { ok: false, ms: Date.now() - t0, at: Date.now(), detail: String(e?.message ?? 'gagal').slice(0, 80) };
  }
}

/** Probe SEMUA layanan sekali jalan (paralel) — hasil langsung live di panel. */
export async function probeBackend(): Promise<void> {
  if (state.probing) return;
  set({ probing: true });
  const jobs: Promise<void>[] = [];

  // 1) FIREBASE — baca nyata 1 doc (butuh firebase terpasang di klien)
  jobs.push((async () => {
    try {
      const { firebase } = await import('./firebase');
      const fb = firebase();
      if (!fb) { set({ firebase: { ok: false, ms: 0, at: Date.now(), detail: 'belum terpasang' } }); return; }
      const { doc, getDoc } = await import('firebase/firestore');
      const t0 = Date.now();
      await getDoc(doc(fb.db, 'config', 'platform'));
      set({ firebase: { ok: true, ms: Date.now() - t0, at: Date.now(), detail: 'baca config/platform' } });
    } catch (e: any) {
      set({ firebase: { ok: false, ms: 0, at: Date.now(), detail: String(e?.code ?? e?.message ?? 'gagal').slice(0, 60) } });
    }
  })());

  // 2) SUPABASE — endpoint kesehatan resmi (auth/v1/health), publik
  jobs.push((async () => {
    const { url, anon } = sbProbeInfo();
    if (!url) { set({ supabase: { ok: false, ms: 0, at: Date.now(), detail: 'belum dikonfigurasi' } }); return; }
    const r = await timed(`${url}/auth/v1/health`, { headers: { apikey: anon } });
    set({ supabase: { ...r, detail: r.detail ?? 'auth/v1/health' } });
  })());

  // 3) SERVER SENDIRI — /api/version (function Vercel)
  jobs.push((async () => {
    const base = String(process.env.EXPO_PUBLIC_API_BASE ?? '').replace(/\/+$/, '');
    const origin = base || (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://whatsapp-zeroid.vercel.app');
    const r = await timed(`${origin}/api/version`, undefined, 10000);
    set({ server: { ...r, detail: r.detail ?? '/api/version' } });
  })());

  await Promise.allSettled(jobs);
  set({ probing: false, lastProbeAt: Date.now() });
}

/** Loop probe otomatis — dipasang panel monitoring (interval 30 dtk). */
export function startProbeLoop(): () => void {
  void probeBackend();
  const iv = setInterval(() => { void probeBackend(); }, 30_000);
  return () => clearInterval(iv);
}

export function healthLabel(h: HealthState): { text: string; color: 'ok' | 'warn' | 'err' } {
  if (h.firebase && !h.firebase.ok) return { text: 'Firebase bermasalah — fallback Supabase dipakai untuk media & AI', color: 'err' };
  if (h.degraded) return { text: 'TERDEGRADASI — fallback Supabase aktif untuk media & AI', color: 'warn' };
  if (h.counts.quota > 0 || h.counts['permission-denied'] > 0) return { text: 'Ada error tertinggal — cek detail di bawah', color: 'warn' };
  if (h.lastProbeAt > 0) return { text: 'Sehat — probe live semua layanan berhasil', color: 'ok' };
  return { text: 'Menyiapkan probe live…', color: 'warn' };
}

export const supabaseStatus = () => (isSupabaseConfigured ? 'Terhubung (cadangan aktif)' : 'Belum dikonfigurasi');
