/**
 * EmojiText — teks dengan EMOJI GAYA iPHONE yang konsisten di semua platform.
 *
 * Dipakai di SEMUA permukaan tampilan teks (pesan pribadi/grup/global, status,
 * komentar, nama, reaksi) supaya emoji tidak "hilang/kotak" pada perangkat
 * yang font emojinya tidak lengkap:
 *  1. emoji dirender gambar Apple (jsDelivr → unpkg → glyph bawaan perangkat);
 *  2. teks biasa tetap teks (input TIDAK diubah — tetap ketik emoji normal);
 *  3. emoji lama di pesan lama tetap tampil (pemisahan per karakter, bukan per pesan).
 */
import React from 'react';
import { Text } from 'react-native';
import { hasEmoji, renderWithEmoji } from './Emoji';

export default function EmojiText({
  text,
  size,
  numberOfLines,
  style,
}: {
  text: string;
  size: number;
  numberOfLines?: number;
  style?: any;
}) {
  if (!text) return null;
  if (!hasEmoji(text)) return <Text numberOfLines={numberOfLines} style={style}>{text}</Text>;
  return (
    <Text numberOfLines={numberOfLines} style={style}>
      {renderWithEmoji(text, size, 'et_')}
    </Text>
  );
}
