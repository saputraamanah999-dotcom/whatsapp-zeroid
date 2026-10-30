import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polygon, G } from 'react-native-svg';

/**
 * FIRE PET v21 — kucing streak yang dirawat BARENG seluruh anggota chat + api.
 * Redesign total (permintaan user: api & kucingnya "jelek banget"):
 *  - kucing chunky ala emoji: kepala bulat besar, telinga membulat, blush pink,
 *    mata besar berkilau, badan mungil, kaki kecil, ekor bergaris bergoyang;
 *  - api 3 lapis (badan api + inti kuning + pusat putih) + percikan bintang,
 *    berkedip dua fase berbeda biar hidup;
 *  - glow bernapas + bayangan tanah lembut; warna api berganti tiap 10 hari.
 * Semua animasi di Animated.View (aman web & android, useNativeDriver).
 */

type Props = {
  count: number;          // streak hari
  color: string | null;   // warna api (null → abu, belum menyala)
  lit: boolean;           // api menyala
  dimmed?: boolean;       // api melemah (1 jam kosong)
  size?: number;          // tinggi total (px)
};

export default function FirePet({ count, color, lit, dimmed, size = 64 }: Props) {
  const flick1 = useRef(new Animated.Value(1)).current;
  const flick2 = useRef(new Animated.Value(1)).current;
  const spark = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.35)).current;
  const breath = useRef(new Animated.Value(1)).current;
  const tail = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const mk = (v: Animated.Value, dur: number, min: number) =>
      Animated.loop(Animated.sequence([
        Animated.timing(v, { toValue: min, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]));
    const a1 = mk(flick1, 380, 0.86);
    const a2 = mk(flick2, 260, 0.72);
    const as = Animated.loop(Animated.sequence([
      Animated.timing(spark, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(spark, { toValue: 0, duration: 200, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]));
    const ag = Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 0.75, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.3, duration: 650, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const ab = mk(breath, 1600, 0.965);
    const at = Animated.loop(Animated.sequence([
      Animated.timing(tail, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(tail, { toValue: 0, duration: 850, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    a1.start(); a2.start(); ab.start(); at.start();
    if (lit && !dimmed) { ag.start(); as.start(); }
    return () => { a1.stop(); a2.stop(); ab.stop(); at.stop(); ag.stop(); as.stop(); };
  }, [lit, dimmed, flick1, flick2, glow, breath, tail, spark]);

  const main = color ?? (lit ? '#FF8A00' : '#8A93A6');
  const H = size;
  const W = Math.round(size * 1.24);
  const level = count >= 100 ? 1.12 : count >= 30 ? 1.02 : 0.9;
  const flameH = dimmed ? 20 : count >= 100 ? 40 : count >= 30 ? 33 : 26;
  const tailRot = tail.interpolate({ inputRange: [0, 1], outputRange: ['-9deg', '9deg'] });
  const sparkY = spark.interpolate({ inputRange: [0, 1], outputRange: [6, -14] });
  const sparkO = spark.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.9, 0.5, 0] });

  return (
    <View style={{ width: W, height: H, alignItems: 'center', justifyContent: 'flex-end' }}
      accessibilityLabel={`Pet kucing streak ${count} hari`}>

      {/* GLOW api bernapas */}
      {lit && (
        <Animated.View style={{ position: 'absolute', bottom: H * 0.26, alignSelf: 'center', opacity: glow }}>
          <Svg width={W * 1.05} height={W * 1.05} viewBox="0 0 60 60">
            <Circle cx="30" cy="30" r="27" fill={main} opacity={0.15} />
            <Circle cx="30" cy="30" r="19" fill={main} opacity={0.12} />
          </Svg>
        </Animated.View>
      )}

      {/* API — lapisan luar (oranye) */}
      {lit && (
        <Animated.View style={{
          position: 'absolute', bottom: H * 0.40, alignSelf: 'center',
          transform: [{ scale: flick1 }],
        }}>
          <Svg width={44} height={flameH + 22} viewBox="0 0 44 62">
            <Path d="M22 3 C27 12 35 16.5 35 29 C35 40.5 29 47.5 22 47.5 C15 47.5 9 40.5 9 29 C9 16.5 17 12 22 3 Z" fill={main} />
            {/* lidah api samping */}
            <Path d="M10.5 24 C8 28 7.5 33 9.5 37 C6.5 33.5 6 27.5 8.2 23 Z" fill={main} opacity={0.8} />
            <Path d="M33.5 24 C36 28 36.5 33 34.5 37 C37.5 33.5 38 27.5 35.8 23 Z" fill={main} opacity={0.8} />
          </Svg>
        </Animated.View>
      )}
      {/* API — lapisan tengah (kuning) + inti putih, berkedip beda fase */}
      {lit && (
        <Animated.View style={{
          position: 'absolute', bottom: H * 0.40, alignSelf: 'center',
          transform: [{ scaleY: flick2 }, { scaleX: flick2 }],
        }}>
          <Svg width={44} height={flameH + 22} viewBox="0 0 44 62">
            <Path d="M22 17 C25.5 22 29.5 25 29.5 31.5 C29.5 38 26 42 22 42 C18 42 14.5 38 14.5 31.5 C14.5 25 18.5 22 22 17 Z" fill="#FFD54A" />
            <Path d="M22 29 C23.6 31.4 25.4 33.2 25.4 35.9 C25.4 38.6 23.9 40.2 22 40.2 C20.1 40.2 18.6 38.6 18.6 35.9 C18.6 33.2 20.4 31.4 22 29 Z" fill="#FFF6D6" />
          </Svg>
        </Animated.View>
      )}
      {/* PERCIKAN bintang kecil naik dari api */}
      {lit && !dimmed && (
        <Animated.View style={{ position: 'absolute', bottom: H * 0.40 + flameH * 0.5, alignSelf: 'center', transform: [{ translateY: sparkY }], opacity: sparkO }}>
          <Svg width={26} height={16} viewBox="0 0 26 16">
            <Path d="M4 8 L6 8 M13 3 L13 5 M22 8 L20 8 M13 13 L13 11" stroke="#FFC63F" strokeWidth={1.6} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      )}

      {/* EKOR bergaris bergoyang (pivot pangkal) */}
      <Animated.View style={{
        position: 'absolute', right: W * 0.01, bottom: H * 0.10,
        transformOrigin: '12% 88%', transform: [{ rotate: tailRot }],
      } as any}>
        <Svg width={28} height={32} viewBox="0 0 28 32">
          <Path d="M4 29 C15 27 21.5 19 16 8.5 C14.6 5.8 10.2 6.6 11 9.4 C13.6 15.6 9.4 23 2 25 Z" fill="#5B6472" />
          <G stroke="#495260" strokeWidth={1.4} strokeLinecap="round">
            <Path d="M11.5 21 C13.8 20.2 15.3 18.8 16.2 16.8" fill="none" />
            <Path d="M13.8 15.4 C15.2 14.6 16 13.4 16.4 11.8" fill="none" />
          </G>
        </Svg>
      </Animated.View>

      {/* KUCING chunky */}
      <Animated.View style={{ transform: [{ scale: breath }] }}>
        <Animated.View style={{ transform: [{ scale: level }] }}>
          <Svg width={W} height={H * 0.60} viewBox="0 0 80 42">
            {/* bayangan tanah */}
            <Ellipse cx="36" cy="40" rx="21" ry="2" fill="#00000022" />
            {/* badan */}
            <Ellipse cx="40" cy="28.5" rx="17" ry="11" fill="#6E7787" />
            {/* kaki depan kecil */}
            <Ellipse cx="33" cy="38.4" rx="4.6" ry="2.5" fill="#5B6472" />
            <Ellipse cx="46" cy="38.4" rx="4.6" ry="2.5" fill="#5B6472" />
            {/* dada terang */}
            <Ellipse cx="40" cy="31" rx="8.5" ry="6.5" fill="#8B94A5" />
            {/* TELINGA membulat */}
            <Path d="M10 14 C9 7 12 3 17 5.5 C19.5 6.8 21 9 21.5 11.5 Z" fill="#6E7787" />
            <Path d="M36 14 C37 7 34 3 29 5.5 C26.5 6.8 25 9 24.5 11.5 Z" fill="#6E7787" />
            <Path d="M12.4 11.6 C12 8.4 13.6 6.4 16.2 7.8 C17.6 8.6 18.6 9.8 19 11.2 Z" fill="#F2A3B1" />
            <Path d="M33.6 11.6 C34 8.4 32.4 6.4 29.8 7.8 C28.4 8.6 27.4 9.8 27 11.2 Z" fill="#F2A3B1" />
            {/* KEPALA bulat besar */}
            <Circle cx="23" cy="20" r="13" fill="#7B8496" />
            {/* blush */}
            <Ellipse cx="13.5" cy="23.5" rx="3" ry="1.8" fill="#F2A3B1" opacity={0.75} />
            <Ellipse cx="32.5" cy="23.5" rx="3" ry="1.8" fill="#F2A3B1" opacity={0.75} />
            {/* MATA besar berkilau */}
            <Circle cx="17.6" cy="19.4" r="3.1" fill="#1B2433" />
            <Circle cx="28.4" cy="19.4" r="3.1" fill="#1B2433" />
            <Circle cx="16.6" cy="18.4" r="1.05" fill="#fff" />
            <Circle cx="27.4" cy="18.4" r="1.05" fill="#fff" />
            <Circle cx="18.8" cy="20.6" r="0.5" fill="#fff" opacity={0.85} />
            <Circle cx="29.6" cy="20.6" r="0.5" fill="#fff" opacity={0.85} />
            {/* hidung + mulut senyum */}
            <Polygon points="22,22.6 24,22.6 23,23.8" fill="#F08CA0" />
            <Path d="M23 24 C22.4 25.6 20.8 25.6 20.2 24.8 M23 24 C23.6 25.6 25.2 25.6 25.8 24.8" stroke="#4A5364" strokeWidth={0.8} fill="none" strokeLinecap="round" />
            {/* kumis */}
            <Path d="M12 20 L6.5 18.6 M12.2 22.4 L6.8 22.8 M34 20 L39.5 18.6 M33.8 22.4 L39.2 22.8" stroke="#A6AFBE" strokeWidth={0.65} strokeLinecap="round" />
            {/* MAHKOTA streak 100+ */}
            {count >= 100 && (
              <Polygon points="15,8.5 18.5,2.5 22,7 25.5,2 29,7 32.5,2.5 31,8.5 16.5,8.5" fill="#FFB300" />
            )}
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

/** Ikon api kecil untuk baris daftar chat (berwarna sesuai tier). */
export function FireDot({ color, dimmed }: { color: string; dimmed?: boolean }) {
  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center', opacity: dimmed ? 0.45 : 1 }}>
      <Svg width={12} height={12} viewBox="0 0 24 24">
        <Path d="M12 2 C15 6.5 19 9.5 19 15 A7 7 0 0 1 5 15 C5 9.5 9 6.5 12 2 Z" fill={color} />
        <Path d="M12 10 C13.6 12.2 15 13.8 15 16.2 A3.2 3.2 0 0 1 8.6 16.2 C8.6 13.8 10.4 12.2 12 10 Z" fill="#FFE082" />
      </Svg>
    </View>
  );
}
