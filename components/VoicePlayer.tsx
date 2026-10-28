import React, { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { T } from './ui';
import { duration as fmt } from '../lib/format';

export default function VoicePlayer({ uri, seed, dur, mine, accent }: { uri: string; seed: string; dur?: number; mine: boolean; accent: string }) {
  const source = useMemo(() => ({ uri }), [uri]);
  const player = useAudioPlayer(source);
  const st = useAudioPlayerStatus(player);
  const bars = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 28 }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0;
      return 5 + ((h >> 8) % 18) * (0.6 + 0.4 * Math.sin(i / 3));
    });
  }, [seed]);
  const total = st.duration && Number.isFinite(st.duration) && st.duration > 0 ? st.duration : dur ?? 0;
  const progress = total ? Math.min(1, st.currentTime / total) : 0;
  const fg = mine ? '#fff' : accent;
  const dim = mine ? 'rgba(255,255,255,0.45)' : 'rgba(120,135,160,0.45)';

  const toggle = () => {
    if (st.playing) player.pause();
    else {
      if (st.didJustFinish || (total && st.currentTime >= total - 0.05)) player.seekTo(0);
      player.play();
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, paddingVertical: 2 }}>
      <Pressable onPress={toggle} hitSlop={8} accessibilityLabel={st.playing ? 'Jeda' : 'Putar'} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(255,255,255,0.22)' : 'rgba(30,107,255,0.12)' }}>
        {st.isBuffering && !st.isLoaded ? <Ionicons name="hourglass" size={16} color={fg} /> : <Ionicons name={st.playing ? 'pause' : 'play'} size={18} color={fg} style={{ marginLeft: st.playing ? 0 : 2 }} />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={(e) => {
            const w = 160;
            const x = e.nativeEvent.locationX;
            if (total) player.seekTo(Math.max(0, Math.min(total, (x / w) * total)));
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 }}
        >
          {bars.map((h, i) => (
            <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / bars.length <= progress ? fg : dim }} />
          ))}
        </Pressable>
        <T v="caption" color={mine ? 'rgba(255,255,255,0.85)' : undefined} style={{ fontSize: 11 }}>
          {st.playing || st.currentTime > 0 ? fmt(st.currentTime) : fmt(total)}
        </T>
      </View>
      <Ionicons name="mic" size={18} color={fg} />
    </View>
  );
}
