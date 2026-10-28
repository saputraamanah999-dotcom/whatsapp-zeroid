/**
 * Compact audio bar for direct MP3 streams — NATIVE (expo-audio).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer } from 'expo-audio';
import { useTheme, R } from '../lib/theme';

export type AudioBarProps = { uri: string; title?: string; subtitle?: string; thumb?: string; onClose?: () => void };

export default function AudioBar({ uri, title, subtitle, onClose }: AudioBarProps) {
  const t = useTheme();
  const player = useAudioPlayer(uri);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      try {
        setPos(player.currentTime ?? 0);
        setDur(player.duration ?? 0);
        setPlaying(player.playing ?? false);
      } catch {}
    }, 400);
    return () => clearInterval(iv);
  }, [player]);

  const fmt = (s: number) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: R.lg, backgroundColor: t.surface }}>
      <Pressable
        onPress={() => { if (playing) player.pause(); else player.play(); }}
        style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color={t.bg} />
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 13 }}>{title ?? 'Audio'}</Text>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.border, overflow: 'hidden' }}>
          <View style={{ height: 4, width: `${pct}%`, backgroundColor: t.accent }} />
        </View>
        <Text style={{ color: t.faint, fontSize: 11 }}>
          {fmt(pos)} / {fmt(dur)}{subtitle ? ` · ${subtitle}` : ''}
        </Text>
      </View>
      {!!onClose && (
        <Pressable onPress={onClose} style={{ padding: 6 }}>
          <Ionicons name="close" size={18} color={t.sub} />
        </Pressable>
      )}
    </View>
  );
}
