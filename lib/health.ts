/**
 * ZEROID — monitoring kesehatan backend (Firebase ↔ Supabase fallback).
 *
 * Semua error Firestore/Auth/FireStorage yang lewat client dicatat di sini
 * (paling sering: permission-denied, resource-exhausted / kuota harian habis,
 * unavailable). Admin panel (tab Sistem → Monitoring Backend) menampilkan
 * statusnya, dan kalau Firebase mulai error beruntun, UI otomatis menandai
 * mode cadangan Supabase (media & AI proxy sudah jalan di Supabase sejak awal).
 */
import { useSyncExternalStore } from 'react';
import { isSupabaseConfigured } from './supabase';

export type FbErrorKind = 'permission-denied' | 'quota' | 'unavailable' | 'other';

export type HealthState = {
  counts: Record<FbErrorKind, number>;
  lastCode: string;
  lastMessage: string;
  lastAt: number;
  degraded: boolean; // >= 3 error dalam 5 menit → dianggap terdegradasi
};

const EMPTY: HealthState = { counts: { 'permission-denied': 0, quota: 0, unavailable: 0, other: 0 }, lastCode: '', lastMessage: '', lastAt: 0, degraded: false };
let state: HealthState = { ...EMPTY, counts: { ...EMPTY.counts } };
const listeners = new Set<() => void>();
const recent: number[] = [];

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

export function healthLabel(h: HealthState): { text: string; color: 'ok' | 'warn' | 'err' } {
  if (h.degraded) return { text: 'TERDEGRADASI — fallback Supabase aktif untuk media & AI', color: 'warn' };
  if (h.counts.quota > 0 || h.counts['permission-denied'] > 0) return { text: 'Ada error tertinggal — cek detail di bawah', color: 'warn' };
  return { text: 'Sehat — semua operasi Firebase normal', color: 'ok' };
}

export const supabaseStatus = () => (isSupabaseConfigured ? 'Terhubung (cadangan aktif)' : 'Belum dikonfigurasi');
