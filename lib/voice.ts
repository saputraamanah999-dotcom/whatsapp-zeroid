/**
 * PESAN SUARA GLOBAL (VN) — engine audio level modul, dipasang SEKALI.
 *
 * Sebelumnya VN memakai useAudioPlayer PER PESAN: keluar dari layar chat =
 * komponen unmount = suara mati. Kini SATU engine global (ala WhatsApp):
 *  - keluar chat / pindah halaman → VN TETAP BUNYI sampai habis / dihentikan;
 *  - mini bar (VoiceBar) muncul di semua halaman dengan tombol stop;
 *  - web: HTMLAudioElement level modul + MediaSession (notifikasi media,
 *    tetap bunyi saat tab berpindah / layarHP mati);
 *  - native: expo-audio player level modul — background sudah diizinkan
 *    lewat setAudioModeAsync(shouldPlayInBackground) di App root.
 */
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

export type VoiceState = {
  /** id pesan yang sedang diputar (atau null = tidak ada) */
  id: string | null;
  uri: string;
  /** judul di mini bar, mis. "Saputra · obrolan global" */
  title: string;
  playing: boolean;
  loading: boolean;
  position: number; // detik
  duration: number; // detik
};

let state: VoiceState = { id: null, uri: '', title: '', playing: false, loading: false, position: 0, duration: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<VoiceState>) => { state = { ...state, ...p }; emit(); };
export const getVoiceState = () => state;
export function subscribeVoice(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function useVoice(): VoiceState {
  return useSyncExternalStore(subscribeVoice, getVoiceState, getVoiceState);
}

let audio: HTMLAudioElement | null = null; // web
let nativePlayer: any = null;              // expo-audio
let ticker: ReturnType<typeof setInterval> | null = null;

const fmtMediaSession = (st: VoiceState) => {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
      title: st.title || 'Pesan suara',
      artist: 'Zeroid WhatsApp',
      album: 'Pesan suara',
    });
    (navigator as any).mediaSession.setActionHandler('play', () => voiceToggle());
    (navigator as any).mediaSession.setActionHandler('pause', () => voiceToggle());
    (navigator as any).mediaSession.setActionHandler('stop', () => voiceStop());
    (navigator as any).mediaSession.playbackState = st.playing ? 'playing' : 'paused';
  } catch { /* optional */ }
};

function stopTicker() { if (ticker) { clearInterval(ticker); ticker = null; } }
function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    if (Platform.OS === 'web') {
      const a = audio;
      if (!a) return;
      set({
        position: Number.isFinite(a.currentTime) ? a.currentTime : 0,
        duration: Number.isFinite(a.duration) && a.duration > 0 ? a.duration : state.duration,
      });
      if (a.ended) voiceStop();
    } else if (nativePlayer) {
      const st = nativePlayer;
      set({
        position: st.currentTime ?? 0,
        duration: Number.isFinite(st.duration) && st.duration > 0 ? st.duration : state.duration,
      });
    }
  }, 500);
}

function teardown() {
  stopTicker();
  if (Platform.OS === 'web') {
    try { if (audio) { audio.pause(); audio.src = ''; } } catch {}
  } else {
    try { nativePlayer?.pause?.(); } catch {}
  }
  set({ id: null, uri: '', title: '', playing: false, loading: false, position: 0, duration: 0 });
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      (navigator as any).mediaSession.metadata = null;
      (navigator as any).mediaSession.playbackState = 'none';
    } catch {}
  }
}

/** Mulai memutar VN (memanggil ulang dengan id sama = toggle play/pause). */
export async function voicePlay(v: { id: string; uri: string; title?: string; dur?: number }) {
  // pause musik agar tidak bertumpuk (ala WhatsApp)
  try { const p = await import('./player'); if (p.getPlayerState().playing) p.pause(); } catch {}
  if (state.id === v.id) { voiceToggle(); return; }
  teardown();
  set({ id: v.id, uri: v.uri, title: v.title ?? 'Pesan suara', loading: true, playing: false, position: 0, duration: v.dur ?? 0 });
  try {
    if (Platform.OS === 'web') {
      if (!audio) { audio = new Audio(); }
      audio.pause();
      audio.src = v.uri;
      audio.preload = 'auto';
      audio.onended = () => voiceStop();
      audio.onerror = () => voiceStop();
      await audio.play();
      set({ loading: false, playing: true });
    } else {
      const EA = require('expo-audio');
      if (!nativePlayer) {
        nativePlayer = EA.createAudioPlayer({ uri: v.uri });
        nativePlayer.addListener?.('playbackStatusUpdate', (st: any) => { if (st?.didJustFinish) voiceStop(); });
      } else {
        nativePlayer.replace({ uri: v.uri });
      }
      nativePlayer.play();
      set({ loading: false, playing: true });
    }
    startTicker();
    fmtMediaSession(state);
  } catch {
    teardown();
  }
}

export function voiceToggle() {
  if (!state.id) return;
  if (Platform.OS === 'web') {
    if (!audio) return;
    if (state.playing) { try { audio.pause(); } catch {} set({ playing: false }); }
    else { try { void audio.play(); } catch {} set({ playing: true }); }
  } else if (nativePlayer) {
    if (state.playing) { try { nativePlayer.pause(); } catch {} set({ playing: false }); }
    else { try { nativePlayer.play(); } catch {} set({ playing: true }); }
  }
  fmtMediaSession(state);
}

export function voiceSeek(sec: number) {
  if (!state.id) return;
  if (Platform.OS === 'web') { try { if (audio) audio.currentTime = Math.max(0, sec); } catch {} }
  else { try { void nativePlayer?.seekTo?.(Math.max(0, sec)); } catch {} }
  set({ position: Math.max(0, sec) });
}

export function voiceStop() { teardown(); }
