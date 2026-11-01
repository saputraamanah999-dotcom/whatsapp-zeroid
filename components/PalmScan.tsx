/**
 * PalmScan (v26) — PEMINDAI TELAPAK TANGAN / SIDIK JARI untuk kunci akun.
 * SVG animasi asli: telapak tangan dengan garis-garis sidik, cincin pemindai
 * berputar, sorot biru berjalan naik-turun, dan status TERVERIFIKASI (check)
 * saat sukses — persis permintaan: "keliatan kayak telapak tangan sidik lah
 * bagus, bergerak dan terverifikasi bahwa dialah pemiliknya akun itu".
 */
import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Rect, G, Path, Defs, LinearGradient, Stop, ClipPath, Line } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withRepeat, withTiming, Easing, interpolate } from 'react-native-reanimated';
import { T } from './ui';
import { useTheme } from '../lib/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { G as SvgG } from 'react-native-svg';
const AnimatedG = Animated.createAnimatedComponent(SvgG as any);

/** Gambar telapak tangan (palm lines) — path sederhana namun jelas bentuknya. */
function PalmPaths({ color, width = 2 }: { color: string; width?: number }) {
  return (
    <G stroke={color} strokeWidth={width} strokeLinecap="round" fill="none">
      {/* telapak */}
      <Path d="M60 88 C40 88 30 104 30 124 C30 156 46 176 60 186 C70 193 92 193 102 186 C116 176 132 156 132 124 C132 104 122 88 102 88 Z" />
      {/* jari */}
      <Path d="M52 88 L52 52 C52 44 64 44 64 52 L64 86" />
      <Path d="M70 86 L70 40 C70 32 82 32 82 40 L82 85" />
      <Path d="M88 85 L88 44 C88 36 100 36 100 44 L100 86" />
      <Path d="M104 88 L104 56 C104 48 116 48 116 56 L104 90" />
      {/* garis sidik */}
      <Path d="M42 122 C58 116 76 116 92 122 C104 126 116 126 124 122" />
      <Path d="M44 140 C60 134 78 134 94 140 C104 144 114 144 122 140" />
      <Path d="M48 158 C62 153 78 153 92 158 C102 162 110 162 118 158" />
      <Path d="M54 174 C66 170 80 170 90 174" />
      {/* ibu jari */}
      <Path d="M30 132 C22 136 20 146 24 154" />
    </G>
  );
}

export function PalmScan({
  size = 190,
  state,
  label,
}: {
  size?: number;
  state: 'idle' | 'scanning' | 'ok' | 'fail';
  label?: string;
}) {
  const t = useTheme();
  const sweep = useRef(useSharedValue(0)).current;
  const spin = useRef(useSharedValue(0)).current;
  const pulse = useRef(useSharedValue(0)).current;

  useEffect(() => {
    if (state === 'scanning') {
      sweep.value = 0;
      sweep.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }), -1, true);
      spin.value = withRepeat(withTiming(360, { duration: 3200, easing: Easing.linear }), -1, false);
    } else {
      sweep.value = withTiming(state === 'ok' ? 1 : 0, { duration: 300 });
      spin.value = 0;
    }
  }, [state, sweep, spin]);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [pulse]);

  // reanimated v4: props animasi DISEBAR langsung ke komponen (bukan lewat prop `props`)
  const scanProps = useAnimatedProps(() => ({
    y1: 40 + interpolate(sweep.value, [0, 1], [0, 150]),
    y2: 40 + interpolate(sweep.value, [0, 1], [0, 150]),
    opacity: state === 'scanning' ? 0.95 : 0,
  }));
  const ringProps = useAnimatedProps(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const haloProps = useAnimatedProps(() => ({
    r: 86 + interpolate(pulse.value, [0, 1], [0, 7]),
    opacity: state === 'ok' ? 0.35 : 0.16,
  }));

  const palmColor = state === 'ok' ? '#3ddc84' : state === 'fail' ? '#ff5a5f' : t.accent;
  const label2 = label ?? (state === 'ok' ? 'Terverifikasi — pemilik akun sah' : state === 'fail' ? 'Sidik tidak cocok — ditolak' : state === 'scanning' ? 'Memindai telapak tangan…' : 'Sentuh untuk memindai sidik');

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          <Defs>
            <LinearGradient id="zsweep" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={t.accent} stopOpacity="0" />
              <Stop offset="0.5" stopColor={t.accent} stopOpacity="0.9" />
              <Stop offset="1" stopColor={t.accent} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {/* halo pulse */}
          <AnimatedCircle cx="100" cy="100" fill={palmColor} {...(haloProps as any)} />
          <Circle cx="100" cy="100" r="86" fill="none" stroke={palmColor} strokeOpacity={0.35} strokeWidth={1.5} />
          <Circle cx="100" cy="100" r="74" fill="none" stroke={palmColor} strokeOpacity={0.18} strokeWidth={1} />
          {/* cincin pemindai berputar (busur putus) */}
          <AnimatedG {...(ringProps as any)} originX="100" originY="100">
            <Circle cx="100" cy="100" r="92" fill="none" stroke={palmColor} strokeWidth={3} strokeDasharray="34 16 6 16" strokeLinecap="round" opacity={state === 'scanning' ? 0.9 : 0.4} />
          </AnimatedG>
          {/* telapak tangan */}
          <ClipPath id="zclip"><Rect x="24" y="24" width="152" height="152" rx="80" /></ClipPath>
          <G clipPath="url(#zclip)">
            <PalmPaths color={palmColor} />
            {/* sorot pemindai berjalan */}
            <AnimatedLine x1="30" x2="170" stroke="url(#zsweep)" strokeWidth={5} strokeLinecap="round" {...(scanProps as any)} />
          </G>
          {/* check sukses */}
          {state === 'ok' && (
            <Path d="M84 102 L96 114 L118 88" stroke="#3ddc84" strokeWidth={7} strokeLinecap="round" fill="none" />
          )}
        </Svg>
      </View>
      <T v="caption" style={{ fontWeight: '800', textAlign: 'center' }} color={state === 'ok' ? '#3ddc84' : state === 'fail' ? '#ff5a5f' : t.sub}>
        {label2}
      </T>
    </View>
  );
}

export default PalmScan;
