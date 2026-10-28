import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polygon } from 'react-native-svg';

/**
 * FIRE PET — kucing yang dirawat BARENG seluruh anggota chat + api streak.
 * Semua animasi berjalan di Animated.View (aman web & android, useNativeDriver):
 * - api 2 lapis berkedip, glow bernapas
 * - kucing bernapas + ekor bergoyang (pivot pangkal ekor via transformOrigin)
 * - ukuran api naik mengikuti streak; warna berubah tiap kelipatan 100
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
    if (lit && !dimmed) ag.start();
    return () => { a1.stop(); a2.stop(); ab.stop(); at.stop(); ag.stop(); };
  }, [lit, dimmed, flick1, flick2, glow, breath, tail]);

  const main = color ?? (lit ? '#FF8A00' : '#8A93A6');
  const H = size;
  const W = Math.round(size * 1.2);
  // level pertumbuhan: 3-29 anak kucing, 30-99 kucing, 100+ kucing besar bermahkota
  const catScale = count >= 100 ? 1.1 : count >= 30 ? 1.0 : 0.88;
  const flameH = dimmed ? 18 : count >= 100 ? 34 : count >= 30 ? 27 : 20;
  const tailRot = tail.interpolate({ inputRange: [0, 1], outputRange: ['-8deg', '8deg'] });

  return (
    <View style={{ width: W, height: H, alignItems: 'center', justifyContent: 'flex-end' }}
      accessibilityLabel={`Pet kucing streak ${count} hari`}>

      {/* GLOW api */}
      {lit && (
        <Animated.View style={{ position: 'absolute', bottom: H * 0.30, alignSelf: 'center', opacity: glow }}>
          <Svg width={W * 0.9} height={W * 0.9} viewBox="0 0 60 60">
            <Circle cx="30" cy="30" r="26" fill={main} opacity={0.16} />
          </Svg>
        </Animated.View>
      )}

      {/* API luar + dalam (2 lapis berkedip beda fase) */}
      {lit && (
        <>
          <Animated.View style={{
            position: 'absolute', bottom: H * 0.42, alignSelf: 'center',
            transform: [{ scale: flick1 }],
          }}>
            <Svg width={36} height={flameH + 16} viewBox="0 0 36 50">
              <Path d="M18 2 C23 10 30 15 30 27 C30 37 24.5 44 18 44 C11.5 44 6 37 6 27 C6 15 13 10 18 2 Z" fill={main} />
            </Svg>
          </Animated.View>
          <Animated.View style={{
            position: 'absolute', bottom: H * 0.42, alignSelf: 'center',
            transform: [{ scaleY: flick2 }, { scaleX: flick2 }],
          }}>
            <Svg width={36} height={flameH + 16} viewBox="0 0 36 50">
              <Path d="M18 14 C21 18.5 25 22 25 29 C25 35 21.8 39 18 39 C14.2 39 11 35 11 29 C11 22 15 18.5 18 14 Z" fill="#FFD54A" />
              <Path d="M18 26 C19.4 28 21 30 21 32.6 C21 34.8 19.6 36.4 18 36.4 C16.4 36.4 15 34.8 15 32.6 C15 30 16.6 28 18 26 Z" fill="#FFF6D6" />
            </Svg>
          </Animated.View>
        </>
      )}

      {/* EKOR bergoyang (pivot pangkal) */}
      <Animated.View style={{
        position: 'absolute', right: W * 0.02, bottom: H * 0.10,
        transformOrigin: '12% 88%', transform: [{ rotate: tailRot }],
      } as any}>
        <Svg width={26} height={30} viewBox="0 0 26 30">
          <Path d="M4 28 C14 26 20 18 15 8 C13.8 5.6 9.8 6.4 10.6 9 C13 15 9 22 2 24 Z"
            fill={count >= 100 ? main : '#4C5563'} />
        </Svg>
      </Animated.View>

      {/* KUCING */}
      <Animated.View style={{ transform: [{ scale: breath }] }}>
        <Animated.View style={{ transform: [{ scale: catScale }] }}>
          <Svg width={W} height={H * 0.62} viewBox="0 0 74 40">
            {/* badan */}
            <Ellipse cx="34" cy="27" rx="20" ry="12.5" fill="#59616F" />
            {/* kaki */}
            <Ellipse cx="24" cy="37.6" rx="4" ry="2.4" fill="#4C5563" />
            <Ellipse cx="42" cy="37.6" rx="4" ry="2.4" fill="#4C5563" />
            {/* kepala */}
            <Circle cx="18" cy="17" r="11" fill="#6B7484" />
            {/* telinga */}
            <Polygon points="9,10 11,1 16,7" fill="#6B7484" />
            <Polygon points="27,10 25,1 20,7" fill="#6B7484" />
            <Polygon points="10.4,8.6 11.6,4 14.2,7.2" fill="#F2A3B1" />
            <Polygon points="25.6,8.6 24.4,4 21.8,7.2" fill="#F2A3B1" />
            {/* mata */}
            <Circle cx="14" cy="16" r="1.8" fill="#1B2433" />
            <Circle cx="22" cy="16" r="1.8" fill="#1B2433" />
            <Circle cx="14.6" cy="15.4" r="0.6" fill="#fff" />
            <Circle cx="22.6" cy="15.4" r="0.6" fill="#fff" />
            {/* hidung + mulut */}
            <Polygon points="17.2,19.4 18.8,19.4 18,20.4" fill="#F2A3B1" />
            <Path d="M18 20.6 C17.4 22 15.8 22 15.2 21.2 M18 20.6 C18.6 22 20.2 22 20.8 21.2" stroke="#3D4655" strokeWidth="0.7" fill="none" />
            {/* kumis */}
            <Path d="M8 17 L2.5 15.6 M8 19 L2.5 19.6 M28 17 L33.5 15.6 M28 19 L33.5 19.6" stroke="#9AA3B2" strokeWidth="0.6" />
            {/* mahkota streak 100+ */}
            {count >= 100 && (
              <Polygon points="28,7 31,2 34,6 37,1.5 40,6 43,2 46,7 43,9 31,9" fill="#FFB300" />
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
