import React from 'react';
import { View, ViewStyle } from 'react-native';
import { SpotifyTrack, YouTubeTrack } from '../lib/types';

/** Web: official Spotify / YouTube embeds — playback stays inside Zeroid. */
export default function MediaPlayer({ track, height, style }: { track: SpotifyTrack | YouTubeTrack; height?: number; style?: ViewStyle }) {
  const isYt = track.kind === 'youtube';
  const h = height ?? (isYt ? 220 : (track as SpotifyTrack).kind === 'track' ? 152 : 352);
  const src = isYt
    ? `https://www.youtube-nocookie.com/embed/${track.id}?rel=0&modestbranding=1`
    : `https://open.spotify.com/embed/${(track as SpotifyTrack).kind}/${track.id}?utm_source=zeroid&theme=0`;
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
        title: isYt ? `YouTube: ${track.title}` : `Spotify: ${track.title}`,
      })}
    </View>
  );
}
