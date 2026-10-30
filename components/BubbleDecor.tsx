/**
 * HIASAN SVG GAYA BALON — kreasi ORIGINAL Zeroid (bukan tiruan aplikasi lain):
 * telinga & ciri khas hewan dengan lapisan warna, highlight lembut, dan
 * ANIMASI MENGAMBAANG halus (bob) supaya balon terasa hidup tanpa berat.
 *
 * Murni react-native-svg + Animated (jalan web & APK), pointerEvents none.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polygon, Defs, LinearGradient, Stop, G } from 'react-native-svg';

export type DecorKind =
  | 'cat' | 'frog' | 'bear' | 'bunny' | 'panda' | 'fox' | 'crown' | 'horns' | 'alien' | 'love';

const W = 78;
const H = 36;

/** Warna hiasan otomatis dari warna balon: versi lebih gelap utk garis dalam. */
function darker(hex: string, f = 0.72): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Warna versi lebih terang untuk highlight. */
function lighter(hex: string, f = 1.25): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f) + 18);
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f) + 18);
  const b = Math.min(255, Math.round((n & 255) * f) + 18);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default function BubbleDecor({ kind, bg, mine }: { kind: DecorKind; bg: string; mine: boolean }) {
  const dark = darker(bg);
  const lite = lighter(bg);
  const inner = kind === 'cat' || kind === 'bunny' ? '#F9B8C4' : kind === 'fox' ? '#FFF3E8' : darker(bg, 0.55);
  const align = mine ? { right: -2 } : { left: -2 };

  // ANIMASI MENGAMBAANG halus — telinga/hiasan naik-turun ±1.5px (2.4 dtk)
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -1.6, duration: 1200, useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  const gid = `g_${kind}`;
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -H + 6, ...align, transform: [{ translateY: bob }] }}>
      <Svg width={W} height={H} viewBox="0 0 78 36">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lite} />
            <Stop offset="1" stopColor={bg} />
          </LinearGradient>
        </Defs>
        {/* KUCING — telinga lengkung lembut dengan inner pink + kilau */}
        {kind === 'cat' && (
          <>
            <Path d="M8 36 C 6 22, 10 10, 18 5 C 24 12, 28 22, 30 34 Z" fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} strokeLinejoin="round" />
            <Path d="M13 30 C 12 22, 14 15, 18 10 C 21 15, 24 23, 25 30 Z" fill={inner} opacity={0.85} />
            <Path d="M42 34 C 44 22, 49 10, 58 5 C 64 12, 67 23, 66 36 Z" fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} strokeLinejoin="round" />
            <Path d="M48 30 C 49 22, 52 15, 57 10 C 60 15, 62 23, 61 30 Z" fill={inner} opacity={0.85} />
          </>
        )}
        {/* RUBAH — telinga runcing anggun dengan ujung putih */}
        {kind === 'fox' && (
          <>
            <Path d="M6 36 C 5 22, 9 9, 17 3 C 24 10, 28 22, 29 34 Z" fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} strokeLinejoin="round" />
            <Path d="M14 8 C 16 5, 17 4, 18 4 C 19 5, 20 7, 21 9 C 18 10, 16 10, 14 8 Z" fill={inner} />
            <Path d="M44 34 C 46 21, 51 8, 60 3 C 67 10, 70 23, 69 36 Z" fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} strokeLinejoin="round" />
            <Path d="M55 6 C 57 4, 59 4, 60 5 C 61 7, 62 9, 62 11 C 59 10, 57 8, 55 6 Z" fill={inner} />
          </>
        )}
        {/* KELINCI — telinga panjang melengkung + inner pink + kilau */}
        {kind === 'bunny' && (
          <>
            <Ellipse cx={18} cy={18} rx={9} ry={17} fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} />
            <Ellipse cx={18} cy={19} rx={4.4} ry={11} fill={inner} opacity={0.9} />
            <Ellipse cx={16} cy={9} rx={1.7} ry={3.4} fill="#FFFFFF" opacity={0.55} />
            <Ellipse cx={52} cy={16} rx={9} ry={18} fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} />
            <Ellipse cx={52} cy={17} rx={4.4} ry={12} fill={inner} opacity={0.9} />
            <Ellipse cx={50} cy={8} rx={1.7} ry={3.4} fill="#FFFFFF" opacity={0.55} />
          </>
        )}
        {/* BERUANG / PANDA — telinga bundar gemuk dengan ring warna */}
        {(kind === 'bear' || kind === 'panda') && (
          <>
            <Circle cx={16} cy={16} r={12.5} fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} />
            <Circle cx={58} cy={16} r={12.5} fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} />
            {kind === 'panda' && <Circle cx={16} cy={16} r={7.5} fill="#1B1B1F" />}
            {kind === 'panda' && <Circle cx={58} cy={16} r={7.5} fill="#1B1B1F" />}
            {kind === 'bear' && <Circle cx={16} cy={16} r={6.5} fill={inner} />}
            {kind === 'bear' && <Circle cx={58} cy={16} r={6.5} fill={inner} />}
            <Circle cx={12.5} cy={11.5} r={2.6} fill="#FFFFFF" opacity={0.5} />
            <Circle cx={54.5} cy={11.5} r={2.6} fill="#FFFFFF" opacity={0.5} />
          </>
        )}
        {/* KODOK — mata gembul dengan iris + kilau + kelopak */}
        {kind === 'frog' && (
          <>
            <Circle cx={19} cy={17} r={13.5} fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} />
            <Circle cx={57} cy={17} r={13.5} fill={`url(#${gid})`} stroke={dark} strokeWidth={1.1} />
            <Circle cx={19} cy={16} r={7} fill="#FFFFFF" />
            <Circle cx={57} cy={16} r={7} fill="#FFFFFF" />
            <Circle cx={20.5} cy={17} r={3.4} fill="#14210E" />
            <Circle cx={55.5} cy={17} r={3.4} fill="#14210E" />
            <Circle cx={21.8} cy={15.4} r={1.3} fill="#FFFFFF" />
            <Circle cx={56.8} cy={15.4} r={1.3} fill="#FFFFFF" />
            <Path d="M12 10 C 15 7, 23 7, 26 10" stroke={dark} strokeWidth={1.4} fill="none" strokeLinecap="round" />
            <Path d="M50 10 C 53 7, 61 7, 64 10" stroke={dark} strokeWidth={1.4} fill="none" strokeLinecap="round" />
          </>
        )}
        {/* MAHKOTA — emas berlapis dengan permata (kreasi Zeroid) */}
        {kind === 'crown' && (
          <>
            <Defs>
              <LinearGradient id="crownGold" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFE79A" />
                <Stop offset="1" stopColor="#E8A913" />
              </LinearGradient>
            </Defs>
            <Polygon points="10,34 13,8 26,21 39,4 52,21 65,8 68,34" fill="url(#crownGold)" stroke="#B57F00" strokeWidth={1.2} strokeLinejoin="round" />
            <Circle cx={13} cy={9} r={2.6} fill="#FF6B9C" />
            <Circle cx={39} cy={5} r={3} fill="#4FC3F7" />
            <Circle cx={65} cy={9} r={2.6} fill="#FF6B9C" />
            <Circle cx={39} cy={26} r={3.4} fill="#7C4DFF" opacity={0.9} />
            <Circle cx={38} cy={25} r={1.1} fill="#FFFFFF" opacity={0.8} />
          </>
        )}
        {/* TANDUK — melengkung merah gelap berkilau */}
        {kind === 'horns' && (
          <>
            <Defs>
              <LinearGradient id="hornRed" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#E85B4F" />
                <Stop offset="1" stopColor="#8E1B14" />
              </LinearGradient>
            </Defs>
            <Path d="M12 35 C 7 22, 12 8, 24 3 C 19 15, 21 26, 27 35 Z" fill="url(#hornRed)" />
            <Path d="M64 35 C 69 22, 64 8, 52 3 C 57 15, 55 26, 49 35 Z" fill="url(#hornRed)" />
            <Path d="M15 22 C 14 16, 16 10, 20 6" stroke="#FFB4AC" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.75} />
            <Path d="M61 22 C 62 16, 60 10, 56 6" stroke="#FFB4AC" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.75} />
          </>
        )}
        {/* ALIEN — antena bercahaya (kreasi baru Zeroid) */}
        {kind === 'alien' && (
          <>
            <Path d="M20 34 C 18 22, 18 14, 22 8" stroke={dark} strokeWidth={2.6} fill="none" strokeLinecap="round" />
            <Path d="M56 34 C 58 22, 58 14, 54 8" stroke={dark} strokeWidth={2.6} fill="none" strokeLinecap="round" />
            <Circle cx={22} cy={6} r={4.6} fill="#8AFFC1" stroke="#2FBF71" strokeWidth={1} />
            <Circle cx={54} cy={6} r={4.6} fill="#8AFFC1" stroke="#2FBF71" strokeWidth={1} />
            <Circle cx={20.6} cy={4.6} r={1.5} fill="#FFFFFF" opacity={0.85} />
            <Circle cx={52.6} cy={4.6} r={1.5} fill="#FFFFFF" opacity={0.85} />
          </>
        )}
        {/* LOVE — sepasang hati melayang (kreasi baru Zeroid) */}
        {kind === 'love' && (
          <>
            <Path d="M18 26 C 8 20, 10 8, 18 9 C 22 9.6, 23 12, 23 12 C 23 12, 24 9.6, 28 9 C 36 8, 38 20, 28 26 C 24 28.6, 18 26, 18 26 Z" fill="#FF5C8A" stroke="#C22553" strokeWidth={1} />
            <Circle cx={16.5} cy={13.5} r={2} fill="#FFFFFF" opacity={0.65} />
            <Path d="M55 20 C 49 16, 50.5 8.5, 55.5 9 C 58 9.3, 59 11, 59 11 C 59 11, 60 9.3, 62.5 9 C 67.5 8.5, 69 16, 63 20 C 60.4 21.8, 55 20, 55 20 Z" fill="#FF8FB0" stroke="#C22553" strokeWidth={0.9} opacity={0.95} />
            <Circle cx={54} cy={12.5} r={1.5} fill="#FFFFFF" opacity={0.65} />
          </>
        )}
      </Svg>
    </Animated.View>
  );
}
