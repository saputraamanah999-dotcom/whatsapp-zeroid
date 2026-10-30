import React from 'react';
import { View, ViewStyle, Pressable, Text } from 'react-native';
import { SpotifyTrack, YouTubeTrack } from '../lib/types';

/**
 * Android/iOS: lagu YOUTUBE kini diputar lewat ENGINE MP3 expo-audio
 * (audio asli tetap bunyi di latar belakang — UIBackgroundModes audio aktif),
 * bukan lagi WebView mp4. Spotify tetap embed resmi.
 */
export default function MediaPlayer({ track, height, style }: { track: SpotifyTrack | YouTubeTrack; height?: number; style?: ViewStyle }) {
  const isYt = track.kind === 'youtube';
  if (isYt) return <YtAudioCard track={track as YouTubeTrack} style={style} />;
  const h = height ?? ((track as SpotifyTrack).kind === 'track' ? 152 : 352);
  const uri = `https://open.spotify.com/embed/${(track as SpotifyTrack).kind}/${track.id}?utm_source=zeroid&theme=0`;
  const { WebView } = require('react-native-webview');
  return (
    <View style={[{ height: h, borderRadius: 14, overflow: 'hidden' }, style]}>
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

/** Kartu audio MP3 untuk lagu YouTube (native) — pakai engine global lib/player. */
function YtAudioCard({ track, style }: { track: YouTubeTrack; style?: ViewStyle }) {
  const { play, toggle, usePlayer } = require('../lib/player') as typeof import('../lib/player');
  const st = usePlayer();
  const isCurrent = st.current?.videoId === track.id;
  const playing = isCurrent && st.playing;
  const { useTheme } = require('../lib/theme') as typeof import('../lib/theme');
  const t = useTheme();
  const song = { videoId: track.id, title: track.title, artist: (track as any).artist ?? 'Lagu profil' };
  return (
    <View style={[{ borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.bg2 }, style]}>
      <Pressable
        onPress={() => (isCurrent ? toggle() : void play(song, [song]))}
        style={({ pressed }: any) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: playing ? t.danger : t.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}
      >
        <Text style={{ color: '#fff', fontSize: 18, lineHeight: 22 }}>{playing ? '❙❙' : '▶'}</Text>
      </Pressable>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 14.5 }}>{track.title}</Text>
        <Text numberOfLines={1} style={{ color: t.sub, fontSize: 12, marginTop: 2 }}>
          {playing ? 'Memutar MP3 · tetap bunyi di latar belakang' : 'Ketuk untuk memutar MP3'}
        </Text>
      </View>
    </View>
  );
}
