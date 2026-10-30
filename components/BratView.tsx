/**
 * BRAT VIEW — stiker Brat dirender LANGSUNG (bukan gambar jadi):
 *  - latar PUTIH bersih, teks lowercase tebal HITAM ala brat generator asli;
 *  - teks RATA KIRI-ATAS di sudut (bukan di tengah — permintaan user);
 *  - EMOJI digambar sebagai gambar gaya iPHONE (emoji-datasource-apple via jsDelivr),
 *    jadi Android pun menampilkan emoji Apple persis seperti di iPhone;
 *  - dirender dengan react-native-svg → tajam di ukuran apa pun, sama di web/APK.
 */
import React, { useMemo } from 'react';
import Svg, { Rect, Text as SvgText, TSpan, Image as SvgImage } from 'react-native-svg';
import { appleEmojiUrl, splitEmojiSegments } from '../lib/emoji';

const BG = '#FFFFFF';
const FG = '#111111';
const PAD = 34;
const SIZE = 512;

type Piece = { kind: 'text'; value: string } | { kind: 'emoji'; value: string };

/** Pisahkan satu baris jadi potongan teks/emoji + lebar terestimasi. */
function layoutLine(line: string, fontSize: number): { pieces: Piece[]; width: number } {
  const segs = splitEmojiSegments(line);
  const pieces: Piece[] = [];
  let width = 0;
  for (const s of segs) {
    if (s.kind === 'emoji') {
      pieces.push(s);
      width += fontSize * 1.02;
    } else {
      pieces.push(s);
      // Arial bold: rata-rata ~0.58 × fontSize per karakter
      width += s.value.length * fontSize * 0.58;
    }
  }
  return { pieces, width };
}

function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur.length) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur.length) lines.push(cur);
  return lines.slice(0, 9);
}

export default function BratView({ text, size = 160 }: { text: string; size?: number }) {
  const clean = (text || '').toLowerCase().trim().slice(0, 120);

  const layout = useMemo(() => {
    // pilih ukuran font: mulai besar, kecilkan sampai semua baris muat
    for (let size = 116; size >= 26; size -= 4) {
      const maxChars = Math.max(5, Math.floor(444 / (size * 0.58)));
      const lines = wrapWords(clean, maxChars);
      const laid = lines.map((l) => layoutLine(l, size));
      const widest = Math.max(1, ...laid.map((l) => l.width));
      const fitsX = widest <= 444;
      const fitsY = PAD + size * 0.82 + (lines.length - 1) * size * 1.12 <= 478;
      if (fitsX && fitsY) return { size, lines: laid };
    }
    const maxChars = Math.max(5, Math.floor(444 / (26 * 0.58)));
    return { size: 26, lines: wrapWords(clean, maxChars).map((l) => layoutLine(l, 26)) };
  }, [clean]);

  const fontSize = layout.size;
  const lh = fontSize * 1.12;

  let emojiIndex = 0;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Rect x={0} y={0} width={SIZE} height={SIZE} fill={BG} />
      {layout.lines.map((line, li) => {
        const y = Math.round(PAD + fontSize * 0.82 + li * lh);
        let cx = PAD;
        return (
          <React.Fragment key={li}>
            {line.pieces.map((p, pi) => {
              if (p.kind === 'text') {
                const node = (
                  <SvgText key={pi} x={cx} y={y} fill={FG} fontSize={fontSize} fontWeight="bold" fontFamily="Arial, Helvetica, sans-serif">
                    <TSpan x={cx} y={y} dx={0}>{p.value}</TSpan>
                  </SvgText>
                );
                cx += p.value.length * fontSize * 0.58;
                return node;
              }
              const primary = appleEmojiUrl(p.value);
              const uri = primary;
              const ex = cx + fontSize * 0.02;
              const ey = y - fontSize * 0.94;
              const es = fontSize * 1.04;
              cx += fontSize * 1.02;
              return (
                <SvgImage
                  key={`e${emojiIndex++}-${pi}`}
                  x={ex}
                  y={ey}
                  width={es}
                  height={es}
                  href={uri}
                  preserveAspectRatio="xMidYMid meet"
                />
              );
            })}
          </React.Fragment>
        );
      })}
    </Svg>
  );
}
