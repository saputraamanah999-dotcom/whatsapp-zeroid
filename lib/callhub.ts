/**
 * CALL HUB — sesi panggilan aktif hidup DI LUAR layar Call (ala WhatsApp).
 *  - Keluar dari layar panggilan (back / pindah chat) → panggilan TETAP NYALA,
 *    suara tetap jalan, bisa kembali kapan saja lewat bar "panggilan berlangsung".
 *  - WEB: elemen <audio> tersembunyi level modul menahan remote stream — suara
 *    tetap bunyi meski RTCVideo tidak sedang dirender di layar mana pun.
 *  - NATIVE: expo-audio background mode (App root) menjaga audio saat app di latar.
 */
import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import { CallSession, RtcState } from './webrtc';

export type HubCall = {
  callId: string;
  chatId: string;
  peerId: string;
  meId: string;
  video: boolean;
  isCaller: boolean;
  realPeer: boolean;
  rtcState: RtcState;
  muted: boolean;
  camOff: boolean;
  /** layar Call sedang TERBUKA (bar disembunyikan saat ini) */
  onScreen: boolean;
  local: any;
  remote: any;
};

let hub: HubCall | null = null;
let session: CallSession | null = null;
let hiddenAudio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const getHub = () => hub;
export const hubState = () => hub;
export function subscribeHub(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }
export function useHubCall(): HubCall | null {
  return useSyncExternalStore(subscribeHub, getHub, getHub);
}

export type HubStartOpts = {
  callId: string; chatId: string; me: string; peer: string; video: boolean; isCaller: boolean; realPeer: boolean;
  onEnded?: () => void;
};

/** Mulai / LAMPIRKAN ke panggilan. Dipanggil CallScreen saat layar dibuka.
 *  Kalau panggilan ini SUDAH berjalan di hub → pakai sesi yang ada (tanpa reset). */
export function hubAttachCall(o: HubStartOpts): CallSession | null {
  if (session && hub && hub.callId === o.callId) {
    hub.onScreen = true;
    emit();
    return session; // kembali ke panggilan yang masih jalan
  }
  if (session) hubHangup('ganti-panggilan');
  hub = {
    callId: o.callId, chatId: o.chatId, peerId: o.peer, meId: o.me,
    video: o.video, isCaller: o.isCaller, realPeer: o.realPeer,
    rtcState: 'idle', muted: false, camOff: false, onScreen: true, local: null, remote: null,
  };
  emit();
  session = new CallSession({
    callId: o.callId, me: o.me, peer: o.peer, video: o.video, isCaller: o.isCaller, realPeer: o.realPeer,
    onLocal: (s) => { if (hub) { hub.local = s; emit(); } },
    onRemote: (s) => {
      if (!hub) return;
      hub.remote = s;
      emit();
      // WEB: jaga suara remote di elemen audio tersembunyi — tetap bunyi walau
      // pengguna keluar dari layar panggilan.
      if (Platform.OS === 'web') {
        try {
          if (!hiddenAudio) { hiddenAudio = new Audio(); hiddenAudio.autoplay = true; }
          if (hiddenAudio.srcObject !== s) {
            hiddenAudio.srcObject = s;
            hiddenAudio.muted = false;
            void hiddenAudio.play().catch(() => {});
          }
        } catch { /* ignore */ }
      }
    },
    onState: (st) => {
      if (!hub) return;
      hub.rtcState = st;
      emit();
      if (st === 'closed' || st === 'failed') o.onEnded?.();
    },
  });
  void session.start();
  return session;
}

/** Sinkron flag mic/kamera dari layar UI ke hub (biar bar tampil benar). */
export function hubSyncFlags(muted: boolean, camOff: boolean) {
  if (!hub) return;
  hub.muted = muted;
  hub.camOff = camOff;
  emit();
}

/** Layar Call ditutup — panggilan LANJUT di latar (jangan hangup!). */
export function hubLeaveScreen() {
  if (!hub) return;
  hub.onScreen = false;
  emit();
}

/** Akhiri benar-benar (tombol merah / lawan mengakhiri / status ended). */
export function hubHangup(_reason = 'user') {
  try { session?.hangup(); } catch { }
  session = null;
  if (Platform.OS === 'web' && hiddenAudio) {
    try { hiddenAudio.pause(); hiddenAudio.srcObject = null; } catch { }
  }
  hub = null;
  emit();
}
