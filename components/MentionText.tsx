/**
 * MentionText — merender teks pesan/SW dengan @username tersorot (warna aksen,
 * tebal) dan bisa ditap untuk membuka profil orang yang disebut.
 * Daftar mention diambil dari pesan itu sendiri (m.mentions) supaya highlight
 * tetap akurat walau username berubah; fallback: cocokkan dengan db.users.
 */
import React from 'react';
import { Text, Pressable } from 'react-native';
import { useTheme } from '../lib/theme';
import { MentionPart, splitMentionParts } from '../lib/mentions';

export default function MentionText({
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
  style?: object;
  numberOfLines?: number;
}) {
  const t = useTheme();
  const parts: MentionPart[] = splitMentionParts(text, mentions);
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: color ?? t.text }, style as any]}>
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
