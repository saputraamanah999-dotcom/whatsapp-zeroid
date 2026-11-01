/**
 * PURCHASE TICKER (v29.2) — pengumuman pembelian BERJALAN ke kiri terus-menerus.
 *
 * Permintaan pemilik: "pengumuman pembelian apapun user nanti muncul berjalan ke
 * kiri, terus muncul yang lain juga — taruh bukan di atas banget, apalagi bisa
 * hilang". Dipasang di layar Premium + Layar Langganan (Billing) + beranda Chat.
 *
 * v29.2 FIX "teks hilang saat konten pendek": dulu isi berjalan hanya diduplikasi
 * 2× — kalau total isi lebih PENDEK dari lebar layar (toko baru, 1-2 pembelian),
 * satu putaran mengosongkan seluruh bilah → terlihat seperti pengumuman "hilang".
 * Kini isi digandakan SECARA DINAMIS sampai satu salinan pasti lebih lebar dari
 * layar (dihitung dari lebar satu unit pengumuman yang diukur tersembunyi), lalu
 * blok itu diduplikasi 2× → gulungan tak berujung TANPA celah kosong, apa pun
 * jumlah pembelian.
 *  - posisi: selalu di bawah kartu teratas layar masing-masing (bukan overlay
 *    paling atas).
 *  - tidak hilang: komponen selalu dirender; kalau belum ada pembelian, tampil
 *    satu baris ajangan toko (bilah tetap ada, tidak lompat).
 *  - nyata: sumber = koleksi purchases (order dikonfirmasi admin, SEMUA produk),
 *    real-time onSnapshot — pengumuman baru masuk otomatis tanpa refresh.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Animated, Easing, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from './ui';
import { useTheme, R } from '../lib/theme';
import { useStore } from '../lib/store';
import { rupiah } from '../lib/products';

const SPEED = 55;            // piksel per detik — kecepatan baca nyaman
const SEP = '      •      '; // pemisah antar pengumuman
const EST_UNIT = 240;        // estimasi lebar 1 unit (px) sebelum pengukuran pertama

export default function PurchaseTicker() {
  const t = useTheme();
  const { db } = useStore();
  const [w, setW] = useState(0);          // lebar area terlihat
  const [unitW, setUnitW] = useState(0);  // lebar 1 unit pengumuman (terukur)
  const [copyW, setCopyW] = useState(0);  // lebar 1 salinan blok berjalan (terukur)
  const x = useRef(new Animated.Value(0)).current;

  const items = useMemo(() => db.purchases.slice(0, 12), [db.purchases]);

  const line = useMemo(() => {
    if (!items.length) return '';
    return items
      .map((p) => {
        const money = p.total > 0 ? ` — ${rupiah(p.total)}` : '';
        return `🎉 ${p.name || 'Seseorang'} membeli ${p.product}${money}`;
      })
      .join(SEP);
  }, [items]);

  // 1 unit = seluruh isi + pemisah (agar sambungan antar salinan rapi)
  const unit = line ? line + SEP : '';
  // gandakan isi sampai 1 salinan pasti menutupi layar → tidak pernah kosong
  const reps = useMemo(() => {
    if (!unit || !w) return 1;
    const uw = unitW > 0 ? unitW : EST_UNIT;
    return Math.max(1, Math.ceil(w / Math.max(uw, 1)) + 1);
  }, [unit, w, unitW]);

  const chunk = useMemo(() => (reps > 1 ? Array(reps).fill(line).join(SEP) : line), [line, reps]);

  // animasi berulang: 0 → -copyW lalu loncat ke 0 (blok diduplikasi 2× agar mulus)
  useEffect(() => {
    if (!copyW || !w) return;
    const dist = Math.max(copyW, 1);
    const dur = Math.max(6000, (dist / SPEED) * 1000);
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -dist, duration: dur, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [copyW, w, chunk]);

  return (
    <Pressable
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.pill, backgroundColor: t.bg, paddingHorizontal: 12, paddingVertical: 9, overflow: 'hidden' }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: (t.accent ?? '#25D366') + '22', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ionicons name="megaphone" size={13} color={t.accent} />
      </View>
      {line ? (
        <View style={{ flex: 1, overflow: 'hidden' }}>
          {/* pengukur tersembunyi: lebar 1 unit (tanpa memengaruhi layout) */}
          <Text numberOfLines={1} onLayout={(e) => setUnitW(e.nativeEvent.layout.width)} style={{ position: 'absolute', opacity: 0, color: t.sub, fontSize: 12.5, fontWeight: '700' }}>
            {unit}
          </Text>
          <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x }] }}>
            {/* dua salinan blok → saat salinan-1 habis digeser, salinan-2 tepat di posisi awalnya */}
            <Text numberOfLines={1} onLayout={(e) => setCopyW(e.nativeEvent.layout.width)} style={{ color: t.sub, fontSize: 12.5, fontWeight: '700', paddingRight: 0 }}>
              {chunk}
            </Text>
            <Text numberOfLines={1} style={{ color: t.sub, fontSize: 12.5, fontWeight: '700', paddingRight: 0 }}>
              {chunk}
            </Text>
          </Animated.View>
        </View>
      ) : (
        <T v="caption" color={t.sub} style={{ flex: 1, fontWeight: '700' }}>
          🎉 Pengumuman pembelian pembeli lain akan berjalan di sini — real-time
        </T>
      )}
    </Pressable>
  );
}
