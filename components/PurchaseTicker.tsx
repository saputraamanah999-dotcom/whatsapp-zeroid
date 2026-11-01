/**
 * PURCHASE TICKER (v29) — pengumuman pembelian BERJALAN ke kiri terus-menerus.
 *
 * Permintaan pemilik: "pengumuman pembelian apapun user nanti muncul berjalan ke
 * kiri, terus muncul yang lain juga — taruh bukan di atas banget, apalagi bisa
 * hilang". Maka:
 *  - posisi: di bawah bilah pencarian layar Chat (bukan overlay paling atas).
 *  - berjalan: Animated translateX loop — teks bergeser ke kiri tanpa putus,
 *    item baru masuk otomatis (real-time dari koleksi purchases).
 *  - tidak hilang: komponen selalu dirender selama ada 1+ pembelian; kalau
 *    kosong, tampil satu baris ajangan toko (tetap kelihatan, tidak lompat).
 *  - nyata: sumber = db.purchases (order dikonfirmasi admin), BUKAN dummy.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, Animated, Easing, Text } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T } from './ui';
import { useTheme, R } from '../lib/theme';
import { useStore } from '../lib/store';
import { rupiah } from '../lib/products';

const SPEED = 55; // piksel per detik — kecepatan baca nyaman

export default function PurchaseTicker() {
  const t = useTheme();
  const { db } = useStore();
  const [w, setW] = useState(0);           // lebar area terlihat
  const [cw, setCw] = useState(0);         // lebar total konten berjalan
  const x = useRef(new Animated.Value(0)).current;

  const items = useMemo(() => db.purchases.slice(0, 12), [db.purchases]);

  const line = useMemo(() => {
    if (!items.length) return '';
    return items
      .map((p) => {
        const money = p.total > 0 ? ` — ${rupiah(p.total)}` : '';
        return `🎉 ${p.name || 'Seseorang'} membeli ${p.product}${money}`;
      })
      .join('      •      ');
  }, [items]);

  // animasi berulang: 0 → -cw lalu loncat ke 0 (konten diduplikasi 2× agar mulus)
  useEffect(() => {
    if (!cw || !w) return;
    const dist = Math.max(cw, 1);
    const dur = Math.max(6000, (dist / SPEED) * 1000);
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: -dist, duration: dur, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [cw, w, line]);

  const onLayoutContent = (e: any) => setCw(e.nativeEvent.layout.width);

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
          <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x }] }}>
            {/* dua salinan → gulungan tak berujung (saat salinan-1 lewat, salinan-2 menyusul) */}
            <Text numberOfLines={1} onLayout={onLayoutContent} style={{ color: t.sub, fontSize: 12.5, fontWeight: '700', paddingRight: 60 }}>
              {line}
            </Text>
            <Text numberOfLines={1} style={{ color: t.sub, fontSize: 12.5, fontWeight: '700', paddingRight: 60 }}>
              {line}
            </Text>
          </Animated.View>
        </View>
      ) : (
        <T v="caption" color={t.sub} style={{ flex: 1, fontWeight: '700' }}>
          Pengumuman pembelian akan muncul di sini — real-time
        </T>
      )}
    </Pressable>
  );
}
