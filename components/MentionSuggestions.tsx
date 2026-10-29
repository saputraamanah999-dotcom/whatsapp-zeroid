/**
 * MentionSuggestions — popup daftar @username saat pengguna mengetik "@" di
 * Composer. Opsi "@semua" (tag semua anggota) selalu di atas untuk grup/global.
 */
import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { T, Avatar } from './ui';
import { useTheme, R } from '../lib/theme';
import { Ionicons } from '@expo/vector-icons';

export type MentionOption = {
  label: string;
  sub: string;
  uid?: string;
  insert: string;
  all?: boolean;
};

export default function MentionSuggestions({
  options,
  onPick,
}: {
  options: MentionOption[];
  onPick: (o: MentionOption) => void;
}) {
  const t = useTheme();
  if (!options.length) return null;
  return (
    <View
      style={{
        maxHeight: 220,
        marginHorizontal: 10,
        marginBottom: 4,
        borderRadius: R.lg,
        backgroundColor: t.bg,
        boxShadow: t.raised,
        overflow: 'hidden',
      }}
      accessibilityLabel="Saran mention"
    >
      <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
        {options.map((o, i) => (
          <Pressable
            key={`${o.uid ?? 'all'}-${i}`}
            onPress={() => onPick(o)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 12,
              paddingVertical: 8,
              backgroundColor: pressed ? t.accentSoft : 'transparent',
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: t.border,
            })}
          >
            {o.all ? (
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people" size={17} color="#fff" />
              </View>
            ) : (
              <Avatar uri={null} name={o.label} size={34} />
            )}
            <View style={{ flex: 1 }}>
              <T v="body" numberOfLines={1}>
                {o.all ? '@semua' : o.label}
              </T>
              <T v="caption" color={t.sub} numberOfLines={1}>
                {o.all ? 'Tag semua anggota grup' : o.sub}
              </T>
            </View>
            {o.all && (
              <T v="caption" color={t.accent}>
                SEMUA
              </T>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
