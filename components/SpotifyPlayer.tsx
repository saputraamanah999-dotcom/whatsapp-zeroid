import React from 'react';
import { View, ViewStyle } from 'react-native';
import { SpotifyTrack } from '../lib/types';

/** Web: Spotify embed iframe — plays inside Zeroid, no Spotify app needed. */
export default function SpotifyPlayer({ track, height, style }: { track: SpotifyTrack; height?: number; style?: ViewStyle }) {
  const h = height ?? (track.kind === 'track' ? 152 : 352);
  return (
    <View style={[{ height: h, borderRadius: 14, overflow: 'hidden' }, style]}>
      {React.createElement('iframe', {
        src: `https://open.spotify.com/embed/${track.kind}/${track.id}?utm_source=zeroid&theme=0`,
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
