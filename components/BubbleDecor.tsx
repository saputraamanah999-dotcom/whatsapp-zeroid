/**
 * HIASAN SVG GAYA BALON — telinga & ciri khas hewan menempel di balon chat.
 * Murni react-native-svg (jalan di web + Android/iOS), digambar dari warna balon
 * sendiri supaya menyatu; pointerEvents none (tidak mengganggu tekan pesan).
 */
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Polygon } from 'react-native-svg';

export type DecorKind =
  | 'cat' | 'frog' | 'bear' | 'bunny' | 'panda' | 'fox' | 'crown' | 'horns';

const W = 74;
const H = 34;

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

export default function BubbleDecor({ kind, bg, mine }: { kind: DecorKind; bg: string; mine: boolean }) {
  const dark = darker(bg);
  const inner = kind === 'cat' ? '#F7A8B8' : kind === 'fox' ? '#FFFFFF' : darker(bg, 0.55);
  const align = mine ? { right: -2 } : { left: -2 };
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -H + 6, ...align }}>
      <Svg width={W} height={H} viewBox="0 0 74 34">
        {kind === 'cat' && (
          <>
            <Polygon points="10,34 20,4 34,30" fill={bg} stroke={dark} strokeWidth={1} />
            <Polygon points="15,26 20,10 28,25" fill={inner} />
            <Polygon points="40,30 52,2 64,32" fill={bg} stroke={dark} strokeWidth={1} />
            <Polygon points="47,25 52,9 59,25" fill={inner} />
          </>
        )}
        {kind === 'fox' && (
          <>
            <Polygon points="8,34 16,2 34,28" fill={bg} stroke={dark} strokeWidth={1} />
            <Polygon points="40,28 56,1 66,34" fill={bg} stroke={dark} strokeWidth={1} />
            <Polygon points="52,7 56,1 60,8" fill={inner} />
          </>
        )}
        {kind === 'bunny' && (
          <>
            <Ellipse cx={20} cy={18} rx={8} ry={17} fill={bg} stroke={dark} strokeWidth={1} />
            <Ellipse cx={20} cy={19} rx={4} ry={11} fill={inner} />
            <Ellipse cx={50} cy={16} rx={8} ry={18} fill={bg} stroke={dark} strokeWidth={1} />
            <Ellipse cx={50} cy={17} rx={4} ry={12} fill={inner} />
          </>
        )}
        {(kind === 'bear' || kind === 'panda') && (
          <>
            <Circle cx={16} cy={16} r={12} fill={bg} stroke={dark} strokeWidth={1} />
            <Circle cx={58} cy={16} r={12} fill={bg} stroke={dark} strokeWidth={1} />
            {kind === 'panda' && <Circle cx={16} cy={16} r={7} fill="#1B1B1F" />}
            {kind === 'panda' && <Circle cx={58} cy={16} r={7} fill="#1B1B1F" />}
            {kind === 'bear' && <Circle cx={16} cy={16} r={6} fill={inner} />}
            {kind === 'bear' && <Circle cx={58} cy={16} r={6} fill={inner} />}
          </>
        )}
        {kind === 'frog' && (
          <>
            <Circle cx={18} cy={16} r={13} fill={bg} stroke={dark} strokeWidth={1} />
            <Circle cx={56} cy={16} r={13} fill={bg} stroke={dark} strokeWidth={1} />
            <Circle cx={18} cy={15} r={6} fill="#FFFFFF" />
            <Circle cx={56} cy={15} r={6} fill="#FFFFFF" />
            <Circle cx={19} cy={16} r={3} fill="#111111" />
            <Circle cx={55} cy={16} r={3} fill="#111111" />
          </>
        )}
        {kind === 'crown' && (
          <Polygon points="8,32 12,8 24,20 37,4 50,20 62,8 66,32" fill="#FFD34D" stroke="#D9A400" strokeWidth={1.2} />
        )}
        {kind === 'horns' && (
          <>
            <Path d="M10 33 C 6 20, 12 8, 22 4 C 18 16, 20 26, 26 33 Z" fill="#B3261E" />
            <Path d="M64 33 C 68 20, 62 8, 52 4 C 56 16, 54 26, 48 33 Z" fill="#B3261E" />
          </>
        )}
      </Svg>
    </View>
  );
}
