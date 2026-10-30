/**
 * CRASH GUARD — dipasang PALING AWAL (import pertama di index.ts).
 *
 * Mengapa file ini ada: import ES di-hoist — kode penangkap galat yang tadinya
 * ditulis di index.ts dieksekusi SETELAH seluruh pohon modul App selesai
 * dievaluasi. Galat yang terjadi saat evaluasi modul (mis. modul native yang
 * gagal dimuat) masih mematikan aplikasi sebelum penangkap terpasang.
 * Dengan menjadikan crashguard import PERTAMA, handler terpasang sebelum
 * modul lain dievaluasi → galat startup tampil sebagai Alert (bukan force
 * close diam-diam) + tersimpan untuk dilaporkan saat boot berikutnya.
 *
 * Galat NATIVE (JVM/C++) tetap di luar jangkauan — ditangani plugin Android
 * (Thread.setDefaultUncaughtExceptionHandler → Toast + file laporan).
 */

type CrashInfo = { at: string; level: string; text: string; stack: string };

const KEY = 'zeroid-last-crash';
const KEY_LIST = 'zeroid-crash-list';

function record(info: CrashInfo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AS = require('@react-native-async-storage/async-storage');
    const AsyncStorage = AS.default ?? AS;
    AsyncStorage.setItem(KEY, JSON.stringify(info)).catch(() => {});
    // simpan maks 10 galat terakhir (bukti untuk developer)
    AsyncStorage.getItem(KEY_LIST)
      .then((raw: string | null) => {
        const list: CrashInfo[] = raw ? JSON.parse(raw).slice(-9) : [];
        list.push(info);
        return AsyncStorage.setItem(KEY_LIST, JSON.stringify(list));
      })
      .catch(() => {});
  } catch { /* jangan sampai pelapor ikut meledak */ }
}

function describe(error: any, isFatal: boolean): CrashInfo {
  const name = error?.name ?? 'Error';
  const msg = String(error?.message ?? error ?? '').slice(0, 600);
  const stack = String(error?.stack ?? '').slice(0, 1400);
  return { at: new Date().toISOString(), level: isFatal ? 'FATAL' : 'galat', text: `${name}: ${msg}`, stack };
}

let installed = false;

export function installCrashGuard() {
  if (installed) return;
  installed = true;
  try {
    if (typeof ErrorUtils !== 'undefined' && typeof ErrorUtils.setGlobalHandler === 'function') {
      const prev = ErrorUtils.getGlobalHandler?.();
      ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
        let info: CrashInfo | null = null;
        try {
          info = describe(error, !!isFatal);
          record(info);
        } catch { /* ignore */ }
        if (isFatal) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { Alert } = require('react-native');
            Alert.alert(
              'Zeroid menemukan galat',
              `${info?.text ?? 'Galat tak dikenal'}\n\nLaporan tersimpan — screenshot layar ini lalu kirim ke developer (menu Masukan & bantuan) agar cepat diperbaiki. Aplikasi tidak ditutup paksa.`,
              [{ text: 'Tutup laporan' }]
            );
            // TIDAK memanggil handler bawaan → aplikasi TIDAK dimatikan.
            return;
          } catch { /* Alert gagal → lanjut jalur bawaan */ }
        }
        prev?.(error, isFatal);
      });
    }
  } catch { /* perangkat tanpa ErrorUtils — biarkan */ }

  // janji yang gagal tanpa catch tidak boleh mematikan proses (Hermes)
  try {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : {};
    const HRB = g.HermesInternal;
    if (HRB?.hasPromise && typeof g.Promise !== 'undefined') {
      // React Native sudah menghubungkan unhandled rejection ke ErrorUtils —
      // tidak perlu intervensi tambahan; blok ini hanya pengaman dokumentasi.
    }
  } catch { /* ignore */ }
}

installCrashGuard();

/** Laporan galat sesi lama (dipakai banner boot di App.tsx). */
export async function readLastCrash(): Promise<CrashInfo | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AS = require('@react-native-async-storage/async-storage');
    const raw = await (AS.default ?? AS).getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearLastCrash() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AS = require('@react-native-async-storage/async-storage');
    await (AS.default ?? AS).removeItem(KEY);
  } catch { /* ignore */ }
}
