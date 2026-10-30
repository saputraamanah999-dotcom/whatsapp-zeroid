/**
 * MdText — renderer teks pesan gabungan:
 *  1. FORMAT TEKS ala WhatsApp: **tebal**, *miring*, _miring_, ~~coret~~, `kode`
 *     (permintaan user: tanda ** di tengah teks harus jadi huruf tebal sungguhan).
 *  2. MENTION @username tetap tersorot & bisa ditap (diteruskan ke MentionText
 *     untuk potongan tanpa format — kombinasi keduanya tetap jalan).
 *
 * Tanpa dependensi tambahan; aman web & native.
 */
import React from 'react';
import { Platform, Text } from 'react-native';
import { useTheme } from '../lib/theme';
import { parseMd, hasMd } from '../lib/md';
import { splitMentionParts } from '../lib/mentions';

export default function MdText({
  text,
  mentions,
  color,
  onOpenUser,
  style,
  numberOfLines,
}: {
  text: string;
  mentions?: { uid: string; name: string }[] | null;
  color?: string;
  onOpenUser?: (uid: string) => void;
  style?: any;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const base = { color: color ?? t.text } as any;
  if (!hasMd(text)) {
    // jalur cepat: tanpa format → renderer mention lama
    const parts = splitMentionParts(text, mentions);
    return (
      <Text numberOfLines={numberOfLines} style={[base, style]}>
        {parts.map((p, i) =>
          p.uid ? (
            <Text
              key={`${p.uid}-${i}`}
              onPress={onOpenUser ? () => onOpenUser(p.uid!) : undefined}
              style={{ color: t.accent, fontWeight: '700' }}
            >
              {p.text}
            </Text>
          ) : (
            <Text key={`t-${i}`}>{p.text}</Text>
          ),
        )}
      </Text>
    );
  }
  const tokens = parseMd(text);
  const mono = Platform.OS === 'web' ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'monospace';
  return (
    <Text numberOfLines={numberOfLines} style={[base, style]}>
      {tokens.map((tok, i) => {
        if (tok.style.code) {
          return (
            <Text
              key={i}
              style={{
                fontFamily: mono,
                fontSize: Math.max(12, ((style?.fontSize as number) ?? 15) - 1),
                backgroundColor: 'rgba(127,140,170,0.18)',
                color: color ?? t.text,
                paddingHorizontal: 2,
              }}
            >
              {tok.text}
            </Text>
          );
        }
        // potongan polos tetap mendukung mention @username
        const parts = splitMentionParts(tok.text, mentions);
        return (
          <Text
            key={i}
            style={{
              fontWeight: tok.style.b ? '700' : undefined,
              fontStyle: tok.style.i ? 'italic' : undefined,
              textDecorationLine: tok.style.s ? 'line-through' : undefined,
            }}
          >
            {parts.map((p, j) =>
              p.uid ? (
                <Text
                  key={`${i}-${j}`}
                  onPress={onOpenUser ? () => onOpenUser(p.uid!) : undefined}
                  style={{ color: t.accent, fontWeight: '700' }}
                >
                  {p.text}
                </Text>
              ) : (
                <Text key={`s-${i}-${j}`}>{p.text}</Text>
              ),
            )}
          </Text>
        );
      })}
    </Text>
  );
}
