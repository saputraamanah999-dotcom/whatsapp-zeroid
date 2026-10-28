/**
 * ZEROID MUSIC — global player engine (Spotify kita).
 *
 * Satu instance audio di level modul: pindah halaman APAPUN tidak menghentikan
 * lagu (dipasang sekali di App root lewat <MusicBar />).
 *  - web     : HTMLAudioElement (kontrol penuh + MediaSession)
 *  - native  : expo-audio createAudioPlayer
 *  - fallback: YouTube embed resmi (iframe/WebView, tetap bunyi lintas halaman)
 *    dipakai otomatis kalau semua sumber direct-audio gagal.
 *
 * Stream URL diselesaikan lewat /api/music?action=stream (Invidious→Piped→
 * InnerTube) — tidak ada kunci API di klien.
 */
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { MusicSong, musicStream } from './music';
export type { MusicSong } from './music';

export type PlayerState = {
  current: MusicSong | null;
  playing: boolean;
  loading: boolean;
  position: number; // detik
  duration: number; // detik
  queue: MusicSong[];
  barVisible: boolean;   // mini-bar di atas tab (bisa disembunyikan)
  fullOpen: boolean;     // layar pemutar penuh
  /** true = memakai YouTube embed resmi (direct audio tidak tersedia) */
  embed: boolean;
  error: string;
};

let state: PlayerState = {
  current: null, playing: false, loading: false, position: 0, duration: 0,
  queue: [], barVisible: true, fullOpen: false, embed: false, error: '',
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (p: Partial<PlayerState>) => { state = { ...state, ...p }; emit(); };
export const getPlayerState = () => state;
export function subscribePlayer(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribePlayer, getPlayerState, getPlayerState);
}

// ---------------- audio backends ----------------

type Backend = {
  load(url: string): Promise<void>;
  play(): void;
  pause(): void;
  seek(sec: number): void;
  stop(): void;
};

let audio: HTMLAudioElement | null = null;
let nativePlayer: any = null;
let positionTimer: ReturnType<typeof setInterval> | null = null;
let resolveCount = 0; // guard resolusi konkuren

// --- YouTube embed node (didaftarkan oleh MusicBar) ---
let embedNode: any = null; // HTMLIFrameElement (web) / WebView ref (native)
export function setEmbedNode(n: any) { embedNode = n; }

function ytCommand(func: string, args: any[] = []) {
  try {
    (embedNode as any)?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  } catch { /* ignore */ }
}

function startTicker() {
  if (positionTimer) clearInterval(positionTimer);
  positionTimer = setInterval(() => {
    if (state.embed) return;
    let pos = 0;
    let dur = 0;
    if (Platform.OS === 'web') {
      pos = audio?.currentTime ?? 0;
      dur = Number.isFinite(audio?.duration) ? (audio as HTMLAudioElement).duration : 0;
    } else if (nativePlayer) {
      pos = nativePlayer.currentTime ?? 0;
      dur = nativePlayer.duration ?? 0;
    }
    if (dur > 0 || pos > 0) set({ position: pos, duration: dur || state.duration });
  }, 500);
}

function stopTicker() {
  if (positionTimer) { clearInterval(positionTimer); positionTimer = null; }
}

function mediaSession(song: MusicSong) {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    (navigator as any).mediaSession.metadata = new (window as any).MediaMetadata({
      title: song.title,
      artist: song.artist ?? 'ZEROID MUSIC',
      album: song.album ?? 'ZEROID MUSIC',
      artwork: song.thumb ? [{ src: song.thumb, sizes: '512x512' }] : [],
    });
    (navigator as any).mediaSession.setActionHandler('play', () => resume());
    (navigator as any).mediaSession.setActionHandler('pause', () => pause());
    (navigator as any).mediaSession.setActionHandler('nexttrack', () => next());
    (navigator as any).mediaSession.setActionHandler('previoustrack', () => prev());
  } catch { /* optional */ }
}

const webBackend: Backend = {
  async load(url) {
    if (audio) { try { audio.pause(); } catch {} }
    audio = new Audio('');
    audio.src = url;
    audio.preload = 'auto';
    // TANPA crossOrigin — googlevideo/piped tidak mengirim header CORS penuh
    audio.addEventListener('ended', () => next());
    audio.addEventListener('error', () => {
      if (!state.current || state.embed) return;
      set({ playing: false, error: 'Putaran terputus — beralih ke pemutar cadangan…' });
      retryResolve();
    });
  },
  play() { try { void audio?.play(); } catch {} },
  pause() { try { audio?.pause(); } catch {} },
  seek(sec) { try { if (audio) audio.currentTime = sec; } catch {} },
  stop() { try { if (audio) { audio.pause(); audio.src = ''; } } catch {} },
};

async function getNative(): Promise<Backend | null> {
  if (Platform.OS === 'web') return webBackend;
  try {
    const EA = require('expo-audio');
    if (!nativePlayer) {
      nativePlayer = EA.createAudioPlayer({ uri: 'about:blank' });
      nativePlayer.addListener?.('playbackStatusUpdate', (st: any) => {
        if (st?.didJustFinish) next();
        if (st?.error && !state.embed) {
          set({ playing: false, error: 'Putaran terputus — beralih ke pemutar cadangan…' });
          retryResolve();
        }
      });
    }
    return {
      async load(url) {
        try { nativePlayer.pause(); } catch {}
        nativePlayer.replace({ uri: url });
      },
      play() { try { nativePlayer.play(); } catch {} },
      pause() { try { nativePlayer.pause(); } catch {} },
      seek(sec) { try { void nativePlayer.seekTo(sec); } catch {} },
      stop() { try { nativePlayer.pause(); } catch {} },
    };
  } catch {
    return null;
  }
}

// ---------------- actions ----------------

function embedPlay(song: MusicSong) {
  set({ embed: true, current: song, playing: true, loading: false, position: 0, duration: 0, error: '' });
  stopTicker();
  // MusicBar memasang iframe/WebView dengan autoplay untuk lagu ini; kalau node
  // sudah terpasang, ganti lagu tanpa reload via command API.
  try {
    if (embedNode?.contentWindow) {
      embedNode.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'loadVideoById', args: [song.videoId] }), '*');
    }
  } catch { /* iframe belum siap — src-nya sudah berisi videoId ini */ }
  mediaSession(song);
}

async function resolveAndPlay(song: MusicSong) {
  const token = ++resolveCount;
  set({ loading: true, error: '', current: song, position: 0, duration: 0 });
  let url: string | null = null;
  try {
    url = await musicStream(song.videoId);
  } catch {
    url = null;
  }
  if (token !== resolveCount) return;
  if (!url) {
    // semua sumber direct-audio gagal → YouTube embed resmi (selalu jalan)
    embedPlay(song);
    return;
  }
  const backend = await getNative();
  if (!backend) {
    embedPlay(song);
    return;
  }
  try {
    await backend.load(url);
    backend.play();
    if (token !== resolveCount) return;
    set({ loading: false, playing: true, embed: false });
    startTicker();
    mediaSession(song);
  } catch {
    if (token !== resolveCount) return;
    embedPlay(song);
  }
}

/** Resolusi ulang saat URL mati di tengah lagu. */
function retryResolve() {
  const cur = state.current;
  if (!cur || state.loading || state.embed) return;
  void resolveAndPlay(cur);
}

export async function play(song: MusicSong, queue?: MusicSong[]) {
  if (queue?.length) set({ queue });
  // kalau lagu yang sama sedang diputar → toggle saja
  if (state.current?.videoId === song.videoId) {
    if (state.playing) pause();
    else resume();
    return;
  }
  if (state.embed) {
    // sudah di mode embed — langsung ganti lagu di embed
    embedPlay(song);
    return;
  }
  await resolveAndPlay(song);
}

export function resume() {
  if (state.embed) { ytCommand('playVideo'); set({ playing: true }); return; }
  if (Platform.OS === 'web') webBackend.play();
  else nativePlayer?.play?.();
  set({ playing: true });
}

export function pause() {
  if (state.embed) { ytCommand('pauseVideo'); set({ playing: false }); return; }
  if (Platform.OS === 'web') webBackend.pause();
  else nativePlayer?.pause?.();
  set({ playing: false });
}

export function toggle() { state.playing ? pause() : resume(); }

export function seek(sec: number) {
  if (state.embed) { ytCommand('seekTo', [Math.max(0, sec), true]); return; }
  if (Platform.OS === 'web') webBackend.seek(sec);
  else nativePlayer?.seekTo?.(sec);
  set({ position: sec });
}

export function next() {
  const q = state.queue;
  const i = q.findIndex((s) => s.videoId === state.current?.videoId);
  const n = q[i + 1] ?? q[0];
  if (n && (q.length > 1 || n.videoId !== state.current?.videoId)) void play(n, q);
  else if (state.embed) { ytCommand('seekTo', [0, true]); }
  else set({ playing: false });
}

export function prev() {
  const q = state.queue;
  const i = q.findIndex((s) => s.videoId === state.current?.videoId);
  const p = q[i - 1] ?? q[q.length - 1];
  if (p && p.videoId !== state.current?.videoId) void play(p, q);
  else seek(0);
}

export function close() {
  const token = ++resolveCount;
  void token;
  if (state.embed) { try { embedNode?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'stopVideo', args: [] }), '*'); } catch {} }
  else if (Platform.OS === 'web') webBackend.stop();
  else { try { nativePlayer?.pause?.(); } catch {} }
  stopTicker();
  set({ current: null, playing: false, position: 0, duration: 0, queue: [], fullOpen: false, embed: false, error: '' });
}

/** Sembunyikan/tampilkan mini-bar (lagu tetap bunyi). */
export function setBarVisible(v: boolean) { set({ barVisible: v }); }
export function toggleBar() { set({ barVisible: !state.barVisible }); }
export function openFull() { set({ fullOpen: true }); }
export function closeFull() { set({ fullOpen: false }); }
