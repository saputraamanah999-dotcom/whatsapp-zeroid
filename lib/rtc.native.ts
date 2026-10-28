// Native implementation via react-native-webrtc (requires a development/production build;
// Expo Go does not ship this native module, so we degrade gracefully).
let mod: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  mod = require('react-native-webrtc');
} catch {
  mod = null;
}

export const rtc = {
  available: !!mod?.RTCPeerConnection,
  RTCPeerConnection: mod?.RTCPeerConnection,
  RTCSessionDescription: mod?.RTCSessionDescription,
  RTCIceCandidate: mod?.RTCIceCandidate,
  getUserMedia: (c: any): Promise<any> => mod.mediaDevices.getUserMedia(c),
  platform: 'native' as 'web' | 'native',
};
