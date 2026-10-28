/**
 * Banner profil — mendukung FOTO dan VIDEO loop.
 * Video: autoplay, muted, loop terus (web <video loop>; native expo-video loop).
 */
import React from 'react';
import { Platform, View, ViewStyle } from 'react-native';

export type BannerMediaProps = { uri: string; video?: boolean; height?: number; style?: ViewStyle };

export default function BannerMedia({ uri, video = false, height = 140, style }: BannerMediaProps) {
  if (!video) {
    // foto — biar konsisten pakai expo-image
    const { Image } = require('expo-image');
    return (
      <View style={[{ width: '100%', height, overflow: 'hidden' }, style]}>
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
      </View>
    );
  }
  if (Platform.OS !== 'web') {
    const { useVideoPlayer, VideoView } = require('expo-video');
    const player = useVideoPlayer(uri, (p: any) => {
      p.loop = true;
      p.muted = true;
      try { p.play(); } catch {}
    });
    return (
      <View style={[{ width: '100%', height, overflow: 'hidden', backgroundColor: '#000' }, style]}>
        <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      </View>
    );
  }
  return (
    <View style={[{ width: '100%', height, overflow: 'hidden', backgroundColor: '#000' }, style]}>
      {React.createElement('video', {
        src: uri,
        autoPlay: true,
        loop: true,
        muted: true,
        playsInline: true,
        controls: false,
        style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as any,
      })}
    </View>
  );
}
