/**
 * BanGlyph — ikon LARANGAN (SVG) bergaya baru untuk layar blokir:
 *  - cincin merah gradasi + garis miring bulat lembut (bukan lingkaran kaku);
 *  - cincin tipis pendukung + titik glow, terlihat jelas di tema gelap & terang;
 *  - dipakai bersama oleh BannedScreen (akun) dan DeviceBanGate (perangkat).
 */
import React from 'react';
import Svg, { Circle, Line, Defs, LinearGradient, Stop, G, Circle as Ring } from 'react-native-svg';

export default function BanGlyph({
  size = 96,
  from = '#FF5A6E',
  to = '#D7263D',
  track = 'rgba(234,67,53,0.14)',
}: {
  size?: number;
  from?: string;
  to?: string;
  track?: string;
}) {
  const c = size / 2;
  const rOut = size * 0.40;
  const rIn = size * 0.335;
  const sw = size * 0.085;
  const diag = rIn * 0.72;
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none">
      <Defs>
        <LinearGradient id={`bg-${size}`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      {/* jejak lembut di belakang (glow) */}
      <Circle cx={c} cy={c} r={rOut} stroke={track} strokeWidth={sw * 1.9} />
      {/* cincin utama gradasi */}
      <Circle cx={c} cy={c} r={rIn} stroke={`url(#bg-${size})`} strokeWidth={sw} strokeLinecap="round" />
      {/* garis miring 45° dengan ujung bulat */}
      <G strokeLinecap="round">
        <Line
          x1={c - diag} y1={c - diag} x2={c + diag} y2={c + diag}
          stroke={`url(#bg-${size})`} strokeWidth={sw}
        />
      </G>
      {/* aksen titik kecil di cincin (karakter) */}
      <Ring cx={c + rIn * 0.02} cy={c - rIn} r={sw * 0.42} fill={from} opacity={0.9} />
    </Svg>
  );
}
