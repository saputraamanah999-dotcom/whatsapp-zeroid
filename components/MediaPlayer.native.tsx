import React from 'react';
import { View, ViewStyle, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { SpotifyTrack, YouTubeTrack } from '../lib/types';

/** Android/iOS: official Spotify / YouTube embeds inside a WebView. */
export default function MediaPlayer({ track, height, style }: { track: SpotifyTrack | YouTubeTrack; height?: number; style?: ViewStyle }) {
  const isYt = track.kind === 'youtube';
  const h = height ?? (isYt ? 220 : (track as SpotifyTrack).kind === 'track' ? 152 : 352);
  const uri = isYt
    ? `https://www.youtube-nocookie.com/embed/${track.id}?rel=0&modestbranding=1`
    : `https://open.spotify.com/embed/${(track as SpotifyTrack).kind}/${track.id}?utm_source=zeroid&theme=0`;
  const allow = isYt
    ? (url: string) => /^https:\/\/(www\.)?(youtube-nocookie\.com|youtube\.com|googlevideo\.com|ytimg\.com|ggpht\.com)/.test(url) || url.startsWith('data:')
    : (url: string) => url.startsWith('https://open.spotify.com/embed') || url.includes('scdn.co') || url.includes('spotifycdn');
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
        onShouldStartLoadWithRequest={(r) => {
          if (allow(r.url)) return true;
          // open anything else (e.g. "Watch on YouTube" button) outside the app
          if (r.url.startsWith('http')) Linking.openURL(r.url).catch(() => {});
          return false;
        }}
      />
    </View>
  );
}
