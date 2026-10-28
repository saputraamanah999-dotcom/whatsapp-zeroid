import React from 'react';
import { View, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { SpotifyTrack } from '../lib/types';

/** Android/iOS: Spotify embed inside a WebView — music plays inside the Zeroid APK. */
export default function SpotifyPlayer({ track, height, style }: { track: SpotifyTrack; height?: number; style?: ViewStyle }) {
  const h = height ?? (track.kind === 'track' ? 152 : 352);
  return (
    <View style={[{ height: h, borderRadius: 14, overflow: 'hidden' }, style]}>
      <WebView
        source={{ uri: `https://open.spotify.com/embed/${track.kind}/${track.id}?utm_source=zeroid&theme=0` }}
        style={{ flex: 1, backgroundColor: 'transparent' }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith('https://open.spotify.com/embed') || r.url.includes('scdn.co') || r.url.includes('spotifycdn')}
      />
    </View>
  );
}
