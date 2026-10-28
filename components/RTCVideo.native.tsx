import React from 'react';
import { View, ViewStyle } from 'react-native';

let RTCView: any = null;
try {
  RTCView = require('react-native-webrtc').RTCView;
} catch {
  RTCView = null;
}

export default function RTCVideo({ stream, mirror, style }: { stream: any; mirror?: boolean; style?: ViewStyle; muted?: boolean }) {
  if (!RTCView || !stream) return <View style={[{ backgroundColor: '#000' }, style]} />;
  return <RTCView streamURL={stream.toURL()} objectFit="cover" mirror={mirror} style={[{ backgroundColor: '#000' }, style]} />;
}
