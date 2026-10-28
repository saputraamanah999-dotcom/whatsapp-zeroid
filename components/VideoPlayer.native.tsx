/**
 * Inline video player for direct MP4/WebM streams — NATIVE (expo-video).
 */
import React from 'react';
import { View, Pressable, Text, Linking } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

export type VideoPlayerProps = { uri: string; poster?: string; height?: number };

export default function VideoPlayer({ uri, height = 220 }: VideoPlayerProps) {
  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = false;
  });
  return (
    <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
      <VideoView player={player} style={{ width: '100%', height }} contentFit="contain" />
    </View>
  );
}

export function VideoFallback({ uri }: { uri: string }) {
  return (
    <Pressable onPress={() => Linking.openURL(uri)}>
      <Text>Buka video di pemutar eksternal</Text>
    </Pressable>
  );
}
