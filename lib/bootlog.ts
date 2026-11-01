/**
 * ZEROID_BOOT — diagnostik tahap startup (permintaan prompt perbaikan APK).
 *
 * Setiap fase boot dicatat dengan awalan [ZEROID_BOOT] ke console (terlihat di
 * Logcat → filter "ZEROID_BOOT") DAN disimpan ke AsyncStorage (maks 40 baris)
 * supaya bisa dibuka dari layar Bantuan tanpa butuh PC.
 *
 * Urutan fase:
 *   START → NATIVE_READY → JS_BUNDLE_READY → ENV_READY → FIREBASE_INIT →
 *   AUTH_INIT → NAVIGATION_READY → SPLASH_HIDDEN → LOGIN_RENDERED /
 *   HOME_RENDERED
 *
 * Aturan keamanan: log TIDAK PERNAH berisi kredensial — hanya nama fase,
 * waktu sejak START (ms), dan keterangan pendek yang aman.
 */

type BootPhase =
  | 'START'
  | 'NATIVE_READY'
  | 'JS_BUNDLE_READY'
  | 'ENV_READY'
  | 'FIREBASE_INIT'
  | 'AUTH_INIT'
  | 'NAVIGATION_READY'
  | 'SPLASH_HIDDEN'
  | 'LOGIN_RENDERED'
  | 'HOME_RENDERED';

const KEY = 'zeroid-boot-log';
const t0 = Date.now();
const seen = new Set<BootPhase>();

const ring: string[] = [];

function persist() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AS = require('@react-native-async-storage/async-storage');
    (AS.default ?? AS).setItem(KEY, JSON.stringify(ring.slice(-40))).catch(() => {});
  } catch { /* jangan bikin boot gagal karena logger */ }
}

export function bootLog(phase: BootPhase, note?: string) {
  try {
    if (seen.has(phase)) return; // tiap fase cukup sekali
    seen.add(phase);
    const line = `${String(Date.now() - t0).padStart(5)}ms ${phase}${note ? ` — ${note}` : ''}`;
    ring.push(line);
    // eslint-disable-next-line no-console
    console.log(`[ZEROID_BOOT] ${line}`);
    persist();
  } catch { /* diam */ }
}

/** Baca riwayat boot terakhir (dipakai layar Bantuan/diagnostik). */
export async function readBootLog(): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AS = require('@react-native-async-storage/async-storage');
    const raw = await (AS.default ?? AS).getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const BOOT_T0 = t0;
