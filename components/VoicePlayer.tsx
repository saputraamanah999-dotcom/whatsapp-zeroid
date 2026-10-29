/**
 * VoicePlayer — gelembung pesan suara di chat.
 * Diputar lewat ENGINE GLOBAL (lib/voice.ts) → keluar dari chat pun suara
 * tetap jalan (mini bar mengikuti), progress di gelembung ini tetap sinkron
 * karena keduanya membaca state global yang sama.
 */
import React, { useMemo } from 'react';
import { View, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVoice, voicePlay, voiceToggle, voiceSeek } from '../lib/voice';
import { T } from './ui';
import { duration as fmt } from '../lib/format';

export default function VoicePlayer({ uri, seed, dur, mine, accent, msgId, chatTitle }: { uri: string; seed: string; dur?: number; mine: boolean; accent: string; msgId: string; chatTitle?: string }) {
  const st = useVoice();
  const active = st.id === msgId;
  const bars = useMemo(() => {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return Array.from({ length: 28 }, (_, i) => {
      h = (h * 1103515245 + 12345) >>> 0;
      return 5 + ((h >> 8) % 18) * (0.6 + 0.4 * Math.sin(i / 3));
    });
  }, [seed]);
  const total = active ? (st.duration || (dur ?? 0)) : (dur ?? 0);
  const pos = active ? st.position : 0;
  const playing = active && st.playing;
  const progress = total ? Math.min(1, pos / total) : 0;
  const fg = mine ? '#fff' : accent;
  const dim = mine ? 'rgba(255,255,255,0.45)' : 'rgba(120,135,160,0.45)';

  const toggle = () => {
    if (active) voiceToggle();
    else void voicePlay({ id: msgId, uri, dur, title: chatTitle });
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 210, paddingVertical: 2 }}>
      <Pressable onPress={toggle} hitSlop={8} accessibilityLabel={playing ? 'Jeda' : 'Putar'} style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(255,255,255,0.22)' : 'rgba(30,107,255,0.12)' }}>
        {active && st.loading ? <Ionicons name="hourglass" size={16} color={fg} /> : <Ionicons name={playing ? 'pause' : 'play'} size={18} color={fg} style={{ marginLeft: playing ? 0 : 2 }} />}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Pressable
          onPress={(e) => {
            const w = 160;
            const x = e.nativeEvent.locationX;
            if (!active) return;
            if (total) voiceSeek(Math.max(0, Math.min(total, (x / w) * total)));
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28 }}
        >
          {bars.map((h, i) => (
            <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / bars.length <= progress ? fg : dim }} />
          ))}
        </Pressable>
        <T v="caption" color={mine ? 'rgba(255,255,255,0.85)' : undefined} style={{ fontSize: 11 }}>
          {active && (playing || pos > 0) ? fmt(pos) : fmt(total)}
        </T>
      </View>
      <Ionicons name="mic" size={18} color={fg} />
    </View>
  );
}
