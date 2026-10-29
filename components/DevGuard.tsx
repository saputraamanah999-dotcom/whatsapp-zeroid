import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Icon } from '../lib/icons';

/**
 * DEVGUARD — perlindungan anti-inspeksi untuk web:
 * - blokir klik kanan / F12 / Ctrl+Shift+I-J-C / Ctrl+U
 * - deteksi devtools terbuka (heuristik jarak viewport + trap debugger)
 * - saat terdeteksi: konten disamarkan (blur) + overlay peringatan
 * Catatan jujur: proteksi klien tidak pernah 100% (sumber tetap terunduh),
 * tetapi ini mempersulit inspeksi kasual. Kunci rahasia TIDAK pernah dikirim
 * ke klien — itu pertahanan utamanya (lihat vercel.json + api/ env server).
 */

const isWeb = Platform.OS === 'web';

export default function DevGuard() {
  const [tripped, setTripped] = useState(false);

  useEffect(() => {
    if (!isWeb) return;
    let dead = false;

    const block = (e: Event) => { e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key?.toUpperCase?.() ?? '';
      if (
        k === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'K'].includes(k)) ||
        (e.ctrlKey && k === 'U') ||
        (e.metaKey && e.altKey && ['I', 'J', 'C', 'U'].includes(k))
      ) { e.preventDefault(); trip(); }
    };

    const checkSize = () => {
      // jarak antara window luar-dalam > 180px → devtools mengambang/docked
      const gap = Math.max(window.outerWidth - window.innerWidth, window.outerHeight - window.innerHeight);
      if (gap > 180 && !navigator.userAgent.includes('Edg/')) trip();
    };

    // trap debugger: kalau devtools terbuka, jeda antar-eksekusi melonjak > 200ms
    const trap = () => {
      if (dead) return;
      const t0 = performance.now();
      // eslint-disable-next-line no-debugger
      debugger;
      if (performance.now() - t0 > 200) { trip(); return; }
      setTimeout(trap, 2500);
    };

    const trip = () => {
      if (!dead) setTripped(true);
    };

    document.addEventListener('contextmenu', block);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', checkSize);
    checkSize();
    const kick = setTimeout(trap, 3000);

    return () => {
      dead = true;
      clearTimeout(kick);
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', checkSize);
    };
  }, []);

  useEffect(() => {
    if (!isWeb) return;
    const style = document.documentElement.style;
    if (tripped) style.filter = 'blur(18px)';
    else style.filter = '';
    return () => { style.filter = ''; };
  }, [tripped]);

  if (!isWeb) return null;
  if (!tripped) return null;
  return (
    <View style={{
      position: 'fixed', inset: 0, zIndex: 999999, alignItems: 'center', justifyContent: 'center',
      backgroundColor: '#0D1117EE',
    } as any}>
      <View style={{ padding: 28, borderRadius: 22, backgroundColor: '#161B22', alignItems: 'center', maxWidth: 360 } as any}>
        <View style={{ marginBottom: 8 } as any}>
          <Icon name="shield-check" size={44} color="#3FB68B" />
        </View>
        <View style={{ color: '#E6EDF3', fontWeight: '800', fontSize: 17, marginBottom: 6, textAlign: 'center' } as any}>
          Alat inspeksi terdeteksi
        </View>
        <View style={{ color: '#8B949E', fontSize: 13, textAlign: 'center', lineHeight: 20 } as any}>
          Tutup DevTools, lalu muat ulang halaman untuk melanjutkan memakai Zeroid-whatsapp.
        </View>
      </View>
    </View>
  );
}
