/**
 * Inline video player for direct MP4/WebM streams (anime watching) — WEB.
 * Native counterpart: VideoPlayer.native.tsx (expo-video).
 */
import React from 'react';
import { View } from 'react-native';

export type VideoPlayerProps = { uri: string; poster?: string; height?: number };

export default function VideoPlayer({ uri, poster, height = 220 }: VideoPlayerProps) {
  return (
    <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
      {React.createElement('video', {
        src: uri,
        poster,
        controls: true,
        playsInline: true,
        preload: 'metadata',
        style: {
          width: '100%', height, maxHeight: 320, borderRadius: 14,
          background: '#000', display: 'block', objectFit: 'contain',
        } as any,
      })}
    </View>
  );
}
