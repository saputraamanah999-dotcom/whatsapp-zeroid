import React from 'react';
import { View, ViewStyle } from 'react-native';
import { SpotifyTrack, YouTubeTrack } from '../lib/types';

/**
 * Web: lagu YOUTUBE kini diputar lewat ENGINE MP3 ZEROID MUSIC (audio asli,
 * tetap bunyi saat pindah halaman/minimalkan tab — bukan lagi iframe mp4),
 * dengan UI kartu ringkas + tombol putar. Spotify tetap embed resmi.
 */
export default function MediaPlayer({ track, height, style }: { track: SpotifyTrack | YouTubeTrack; height?: number; style?: ViewStyle }) {
  const isYt = track.kind === 'youtube';
  if (isYt) return <YtAudioCard track={track as YouTubeTrack} style={style} />;
  const h = height ?? ((track as SpotifyTrack).kind === 'track' ? 152 : 352);
  const src = `https://open.spotify.com/embed/${(track as SpotifyTrack).kind}/${track.id}?utm_source=zeroid&theme=0`;
  return (
    <View style={[{ height: h, borderRadius: 14, overflow: 'hidden' }, style]}>
      {React.createElement('iframe', {
        src,
        width: '100%',
        height: h,
        frameBorder: 0,
        allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
        loading: 'lazy',
        style: { border: 0, borderRadius: 14 },
        title: `Spotify: ${track.title}`,
      })}
    </View>
  );
}

/** Kartu audio MP3 untuk lagu YouTube (web) — pakai engine global lib/player. */
function YtAudioCard({ track, style }: { track: YouTubeTrack; style?: ViewStyle }) {
  const { View: RNView, Pressable, Text: RNText } = require('react-native');
  const { play, usePlayer } = require('../lib/player') as typeof import('../lib/player');
  const st = usePlayer();
  const isCurrent = st.current?.videoId === track.id;
  const playing = isCurrent && st.playing;
  const { useTheme } = require('../lib/theme') as typeof import('../lib/theme');
  const t = useTheme();
  const song = { videoId: track.id, title: track.title, artist: (track as any).artist ?? 'Lagu profil' };
  const onPress = () => {
    if (isCurrent) require('../lib/player').toggle();
    else void play(song, [song]);
  };
  return (
    <RNView style={[{ borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg2 }, style]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }: any) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: playing ? t.danger : t.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
      >
        <RNText style={{ color: '#fff', fontSize: 18, lineHeight: 22 }}>{playing ? '❙❙' : '▶'}</RNText>
      </Pressable>
      <RNView style={{ flex: 1, minWidth: 0 }}>
        <RNText numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 14.5 }}>{track.title}</RNText>
        <RNText numberOfLines={1} style={{ color: t.sub, fontSize: 12, marginTop: 2 }}>
          {playing ? 'Memutar MP3 · tetap bunyi di luar halaman' : 'Ketuk untuk memutar MP3'}
        </RNText>
      </RNView>
    </RNView>
  );
}
