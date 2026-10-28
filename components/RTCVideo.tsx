import React, { useEffect, useRef } from 'react';
import { View, ViewStyle } from 'react-native';

/** Web renderer for a MediaStream. */
export default function RTCVideo({ stream, mirror, style, muted = true }: { stream: any; mirror?: boolean; style?: ViewStyle; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream ?? null;
      ref.current.play?.().catch(() => {});
    }
  }, [stream]);
  return (
    <View style={[{ overflow: 'hidden', backgroundColor: '#000' }, style]}>
      {React.createElement('video', {
        ref,
        autoPlay: true,
        playsInline: true,
        muted,
        style: { width: '100%', height: '100%', objectFit: 'cover', transform: mirror ? 'scaleX(-1)' : undefined },
      })}
    </View>
  );
}
