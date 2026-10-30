import { registerRootComponent } from 'expo';

import App from './App';

/**
 * FATAL ERROR CATCHER (v20) — ANTI FORCE CLOSE.
 * Dulu: satu pengecualian JS yang tak tertangani di build release langsung
 * MEMATIKAN aplikasi ("terus berhenti") TANPA pesan apa pun — mustahil
 * didiagnosis. Kini: galat FATAL ditangkap → alasan galat tampil di layar
 * (Alert) + tersimpan (AsyncStorage) untuk dilaporkan saat boot berikutnya,
 * dan proses TIDAK dibunuh. Galat non-fatal tetap lewat jalur bawaan.
 *
 * Galat NATIVE (C++/JVM) tetap di luar jangkauan handler ini — itu terpisah.
 */
if (typeof ErrorUtils !== 'undefined' && typeof ErrorUtils.setGlobalHandler === 'function') {
  const prev = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      const name = error?.name ?? 'Error';
      const msg = String(error?.message ?? error ?? '').slice(0, 500);
      const stack = String(error?.stack ?? '').slice(0, 1200);
      const stamp = new Date().toISOString();
      // simpan untuk "laporan galat terakhir" (banner saat boot)
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { AsyncStorage } = require('@react-native-async-storage/async-storage');
        AsyncStorage.setItem('zeroid-last-crash', `${stamp}|${isFatal ? 'FATAL' : 'galat'}|${name}: ${msg}|${stack}`).catch(() => {});
      } catch {}
      if (isFatal) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { Alert } = require('react-native');
          Alert.alert(
            'Zeroid menemukan galat',
            `${name}: ${msg}\n\nLaporan galat ini tersimpan dan akan tampil saat aplikasi dibuka lagi — screenshot & kirim ke developer agar cepat diperbaiki.`,
            [{ text: 'Tutup laporan' }]
          );
          // TIDAK memanggil handler bawaan → aplikasi TIDAK force close.
          // Pemakai masih bisa menutup aplikasi sendiri bila memang macet.
          return;
        } catch { /* Alert gagal → lanjut jalur bawaan */ }
      }
    } catch { /* jangan sampai handler ini ikut meledak */ }
    prev?.(error, isFatal);
  });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
