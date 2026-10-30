/**
 * FOTO LIVE (ala iPhone Live Photo) dalam balon chat:
 *  - diam: menampilkan FOTO + lencana "LIVE";
 *  - DITEKAN-TAHAN (press & hold): video 3 detik langsung bergerak di tempat;
 *  - dilepas: kembali ke foto (persis Live Photo);
 *  - ketuk singkat: buka photo viewer penuh (onOpen).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer, type VideoSource } from 'expo-video';
import { T } from './ui';

export default function LivePhotoBubble({
  photo,
  video,
  mine,
  onOpen,
}: {
  photo: string;
  video: string;
  mine: boolean;
  onOpen: () => void;
}) {
  const [live, setLive] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedRef = useRef(false);
  const isWeb = Platform.OS === 'web';

  const player = useVideoPlayer(video as VideoSource, (p) => {
    p.loop = true;
    p.muted = false;
    p.volume = 0.6;
  });

  useEffect(() => {
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const startLive = () => {
    pressedRef.current = true;
    // delay kecil supaya ketukan singkat tetap terbaca sebagai "buka foto"
    holdTimer.current = setTimeout(() => {
      if (!pressedRef.current) return;
      setLive(true);
      try { player.currentTime = 0; player.play(); } catch {}
    }, 220);
  };

  const stopLive = () => {
    pressedRef.current = false;
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    try { player.pause(); } catch {}
    setLive(false);
  };

  return (
    <Pressable
      onPressIn={startLive}
      onPressOut={stopLive}
      onPress={() => { if (!live) onOpen(); }}
      delayLongPress={10_000_000} // long-press menu pesan dinonaktifkan di media ini
      style={{ width: 236, height: 236, borderRadius: 16, overflow: 'hidden', backgroundColor: '#0F172A' }}
    >
      {live ? (
        <VideoView
          player={player}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          allowsPictureInPicture={false}
          nativeControls={false}
        />
      ) : (
        <Image source={{ uri: photo }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
      )}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.45)',
        }}
      >
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: live ? '#FF5A5F' : 'rgba(255,255,255,0.75)' }} />
        <T v="caption" color="#fff" style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.5 }}>
          {live ? 'LIVE' : 'LIVE · tahan'}
        </T>
      </View>
      {!mine && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 8, left: 10 }}>
          <T v="caption" color="rgba(255,255,255,0.85)" style={{ fontSize: 10 }}>
            {isWeb ? 'tahan untuk memutar' : 'tahan untuk melihat geraknya'}
          </T>
        </View>
      )}
    </Pressable>
  );
}
