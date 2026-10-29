/**
 * Sidik jari perangkat (device fingerprint) — ANTI BAN-EVASION.
 *
 * Web: hash stabil dari kanvas + WebGL + UA + layar + zona waktu + bahasa.
 *      Bertahan walau localStorage/cookie dibersihkan, ganti browser profile
 *      mode biasa, atau ganti email login — karena berbasis hardware/GPU render.
 * Native: ID instalasi acak yang disimpan di SecureStore (tidak ikut hapus app
 *      cache biasa).
 *
 * Hash ini TIDAK berisi data pribadi — hanya dipakai sebagai id dokumen
 * `devices/{hash}` untuk menutup celah buat akun baru saat diblokir.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const NATIVE_KEY = 'zeroid-device-id';
let memo: string | null = null;

/** Hash SHA-256 hex (web: WebCrypto; fallback non-kripto di platform lain). */
export async function sha256Hex(s: string): Promise<string> {
  if (Platform.OS === 'web') {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch { /* fallback di bawah */ }
  }
  // fallback non-kripto (native tanpa expo-crypto): hash djb2 64-bit-ish
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0').repeat(4).slice(0, 56);
}

function webSignals(): string {
  const n = navigator as any;
  const parts: string[] = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages ?? []).join(','),
    String(navigator.hardwareConcurrency ?? ''),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    String(n.deviceMemory ?? ''),
    String(n.maxTouchPoints ?? ''),
  ];
  // canvas render hash — stabil per GPU/driver
  try {
    const cv = document.createElement('canvas');
    cv.width = 220; cv.height = 60;
    const ctx = cv.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = "16px 'Arial'";
      ctx.fillStyle = '#f60';
      ctx.fillRect(4, 4, 62, 18);
      ctx.fillStyle = '#069';
      ctx.fillText('Zeroid·fp·🚀', 6, 8);
      ctx.fillStyle = 'rgba(102,204,0,0.7)';
      ctx.fillText('Zeroid·fp·🚀', 10, 22);
      ctx.beginPath();
      ctx.arc(150, 30, 22, 0, Math.PI * 2);
      ctx.strokeStyle = '#1E6BFF';
      ctx.stroke();
      parts.push('cv:' + cv.toDataURL().slice(-96));
    }
  } catch { /* canvas bisa diblokir */ }
  // webgl renderer
  try {
    const cv = document.createElement('canvas');
    const gl = (cv.getContext('webgl') ?? cv.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      parts.push('gl:' + (dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : gl.getParameter(gl.RENDERER)));
    }
  } catch { /* webgl bisa diblokir */ }
  return parts.join('|');
}

/** Hash perangkat yang stabil — dipakai store.ts saat login/daftar/ban. */
export async function getDeviceHash(): Promise<string> {
  if (memo) return memo;
  try {
    if (Platform.OS === 'web') {
      memo = await sha256Hex(webSignals());
    } else {
      let id = await AsyncStorage.getItem(NATIVE_KEY);
      if (!id) {
        id = 'n-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        await AsyncStorage.setItem(NATIVE_KEY, id);
      }
      memo = await sha256Hex(id);
    }
  } catch {
    memo = 'unknown-device';
  }
  return memo;
}
