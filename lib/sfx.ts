/**
 * ZEROID SFX (v26) — EFEK SUARA aplikasi (permintaan pemilik):
 *  · success  : "CEKLING" pembayaran sukses (dua nada naik terang)
 *  · pop      : ketukan ringan (tombol/aksi)
 *  · error    : nada galat rendah ganda
 *  · notify   : bunyi notifikasi masuk (nada lembut)
 *  · orderIn  : notif pesanan baru untuk admin/developer (nada penuh)
 * Web   : WebAudio oscillator — tanpa file, instan, bundel tetap ramping.
 * APK   : WAV kecil dibuat runtime → ditulis ke cache via expo-file-system →
 *         diputar expo-audio. Tidak ada aset binary baru di repo.
 */
import { Platform } from 'react-native';

type Sfx = 'success' | 'pop' | 'error' | 'notify' | 'orderIn';

// ---------------- web (WebAudio) ----------------
let webCtx: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    if (!webCtx) {
      const c = new (window as any).AudioContext() as AudioContext;
      webCtx = c;
    }
    const c2 = webCtx as AudioContext;
    if (c2.state === 'suspended') void c2.resume();
    return c2;
  } catch { return null; }
}

function tone(c: AudioContext, freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + at);
    g.gain.setValueAtTime(0, c.currentTime + at);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + dur);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + at);
    o.stop(c.currentTime + at + dur + 0.02);
  } catch { /* noop */ }
}

function webPlay(kind: Sfx): boolean {
  const c = ctx();
  if (!c) return false;
  if (kind === 'success') {
    // CEKLING — dua nada cerdas naik (pembayaran sukses)
    tone(c, 1046.5, 0, 0.16, 0.22);
    tone(c, 1568, 0.09, 0.34, 0.2);
    tone(c, 2093, 0.18, 0.3, 0.12);
  } else if (kind === 'pop') {
    tone(c, 660, 0, 0.07, 0.12, 'triangle');
  } else if (kind === 'error') {
    tone(c, 233, 0, 0.14, 0.16, 'square');
    tone(c, 185, 0.12, 0.2, 0.14, 'square');
  } else if (kind === 'notify') {
    tone(c, 880, 0, 0.1, 0.14, 'sine');
    tone(c, 1174.7, 0.08, 0.16, 0.12, 'sine');
  } else if (kind === 'orderIn') {
    tone(c, 784, 0, 0.12, 0.18);
    tone(c, 988, 0.1, 0.12, 0.18);
    tone(c, 1318.5, 0.2, 0.26, 0.16);
  }
  return true;
}

// ---------------- native (expo-audio + WAV runtime) ----------------
let nativeBusy = false;
const wavCache = new Map<Sfx, string>();

/** WAV PCM 16-bit mono 22050Hz — nada disintesis penuh di memori. */
function makeWav(kind: Sfx): string | null {
  try {
    const sr = 22050;
    const notes: [number, number, number][] = kind === 'success'
      ? [[1046.5, 0.0, 0.18], [1568, 0.1, 0.36], [2093, 0.2, 0.32]]
      : kind === 'pop'
      ? [[660, 0.0, 0.09]]
      : kind === 'error'
      ? [[233, 0.0, 0.16], [185, 0.14, 0.22]]
      : kind === 'notify'
      ? [[880, 0.0, 0.12], [1174.7, 0.1, 0.18]]
      : [[784, 0.0, 0.14], [988, 0.12, 0.14], [1318.5, 0.24, 0.3]];
    const total = Math.max(...notes.map((n) => n[1] + n[2])) + 0.06;
    const n = Math.floor(sr * total);
    const data = new Int16Array(n);
    for (const [freq, at, dur] of notes) {
      const start = Math.floor(at * sr);
      const len = Math.floor(dur * sr);
      for (let i = 0; i < len && start + i < n; i++) {
        const env = Math.min(1, i / (sr * 0.012)) * Math.pow(1 - i / len, 1.6);
        data[start + i] = Math.max(-32767, Math.min(32767, data[start + i] + Math.round(Math.sin(2 * Math.PI * freq * i / sr) * env * 24000)));
      }
    }
    const header = new ArrayBuffer(44);
    const v = new DataView(header);
    const wstr = (off: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
    wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    wstr(36, 'data'); v.setUint32(40, n * 2, true);
    // base64 encode
    const bytes = new Uint8Array(44 + n * 2);
    bytes.set(new Uint8Array(header), 0);
    bytes.set(new Uint8Array(data.buffer), 44);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
    return 'data:audio/wav;base64,' + btoa(bin);
  } catch { return null; }
}

async function nativePlay(kind: Sfx): Promise<boolean> {
  try {
    const FS = require('expo-file-system');
    const EA = require('expo-audio');
    let uri = wavCache.get(kind);
    if (!uri) {
      const b64 = makeWav(kind);
      if (!b64) return false;
      const path = `${FS.cacheDirectory}sfx_${kind}.wav`;
      await FS.writeAsStringAsync(path, b64.split(',')[1], { encoding: FS.EncodingType.Base64 });
      uri = path;
      wavCache.set(kind, path);
    }
    if (nativeBusy) return true; // jangan tumpuk suara
    nativeBusy = true;
    const p = EA.createAudioPlayer(uri);
    p.play();
    setTimeout(() => {
      try { p.release?.(); } catch {}
      nativeBusy = false;
    }, 1400);
    return true;
  } catch { return false; }
}

/** Mainkan efek suara — aman dipanggil di mana pun (tak pernah melempar). */
export function sfx(kind: Sfx): void {
  try {
    if (Platform.OS === 'web') { webPlay(kind); return; }
    void nativePlay(kind);
  } catch { /* silent */ }
}

/** Getaran halus pendamping (native saja). */
export function haptic(kind: 'light' | 'success' | 'error' = 'light'): void {
  try {
    if (Platform.OS === 'web') return;
    const H = require('expo-haptics');
    if (kind === 'success') H.notificationAsync(H.NotificationFeedbackType.Success).catch(() => {});
    else if (kind === 'error') H.notificationAsync(H.NotificationFeedbackType.Error).catch(() => {});
    else H.impactAsync(H.ImpactFeedbackStyle.Light).catch(() => {});
  } catch { /* optional */ }
}
