/**
 * Compact audio bar for direct MP3 streams (music preview / downloads) — WEB.
 * Native counterpart: AudioBar.native.tsx (expo-audio).
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme, R } from '../lib/theme';

export type AudioBarProps = { uri: string; title?: string; subtitle?: string; thumb?: string; onClose?: () => void };

export default function AudioBar({ uri, title, subtitle, onClose }: AudioBarProps) {
  const t = useTheme();
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = new Audio(uri);
    ref.current = a;
    a.addEventListener('play', () => setPlaying(true));
    a.addEventListener('pause', () => setPlaying(false));
    a.addEventListener('ended', () => setPlaying(false));
    a.addEventListener('timeupdate', () => setPos(a.currentTime));
    a.addEventListener('loadedmetadata', () => setDur(a.duration || 0));
    return () => { a.pause(); ref.current = null; };
  }, [uri]);

  const fmt = (s: number) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
  const pct = dur ? Math.min(100, (pos / dur) * 100) : 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: R.lg, backgroundColor: t.surface }}>
      <Pressable
        onPress={() => (ref.current ? (playing ? ref.current.pause() : ref.current.play().catch(() => {})) : null)}
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
