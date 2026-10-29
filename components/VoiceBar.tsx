/**
 * VOICE BAR — mini bar "pesan suara sedang diputar" ala WhatsApp.
 * Muncul di SEMUA halaman selama VN berjalan (karena VN kini global),
 * kecuali di ChatRoom (progress sudah terlihat di gelembung pesannya).
 * Tombol: play/pause + stop. VN tetap bunyi walau bar ditutup —
 * pemberhentian hanya lewat tombol stop (permintaan pemilik).
 */
import React from 'react';
import { View, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVoice, voiceToggle, voiceStop } from '../lib/voice';
import { usePlayer } from '../lib/player';
import { useActiveRouteName } from '../lib/bus';
import { useTheme } from '../lib/theme';
import { T } from './ui';
import { duration as fmt } from '../lib/format';

export default function VoiceBar() {
  const st = useVoice();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const route = useActiveRouteName();
  const music = usePlayer();
  if (!st.id) return null;
  if (route === 'ChatRoom' || route === 'Call') return null; // kontrolnya sudah ada di layar tsb

  // tumpuk di atas MusicBar bila bar musik sedang tampil di posisi yang sama
  const musicBarShown = !!music.current && music.barVisible && !['ChatRoom', 'Call', 'MediaViewer', 'StoryViewer', 'StoryCreate', 'AnimeWatch', 'Music'].includes(route ?? '');
  const bottom = insets.bottom + (musicBarShown ? 148 : 84);

  const glass = {
    backgroundColor: t.dark ? 'rgba(30,36,46,0.72)' : 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: t.dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px) saturate(1.5)', WebkitBackdropFilter: 'blur(18px) saturate(1.5)' } as any) : {}),
  } as any;

  const ratio = st.duration > 0 ? Math.min(1, st.position / st.duration) : 0;

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(16)}
      exiting={FadeOutDown.duration(160)}
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 12, right: 12, bottom, zIndex: 901 }}
    >
      <View style={[glass, { borderRadius: 20, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 480, alignSelf: 'center', width: '100%', boxShadow: '0px 12px 30px rgba(0,0,0,0.28)' }]}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="mic" size={20} color={t.accent} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="sub" numberOfLines={1} style={{ fontWeight: '800', fontSize: 13 }}>Pesan suara · {st.title}</T>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: t.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)', overflow: 'hidden' }}>
            <View style={{ width: `${ratio * 100}%`, height: '100%', backgroundColor: t.accent }} />
          </View>
          <T v="caption" color={t.sub} style={{ fontSize: 10.5 }}>{fmt(st.position)} / {st.duration ? fmt(st.duration) : '—'}</T>
        </View>
        <Pressable onPress={voiceToggle} hitSlop={8} accessibilityLabel={st.playing ? 'Jeda pesan suara' : 'Lanjutkan pesan suara'}>
          <Ionicons name={st.playing ? 'pause-circle' : 'play-circle'} size={32} color={t.accent} />
        </Pressable>
        <Pressable onPress={voiceStop} hitSlop={8} accessibilityLabel="Hentikan pesan suara">
          <Ionicons name="close-circle" size={24} color={t.sub} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
