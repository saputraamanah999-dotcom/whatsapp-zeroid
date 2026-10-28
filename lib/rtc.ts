// Web implementation: browsers ship WebRTC natively.
const g: any = typeof globalThis !== 'undefined' ? globalThis : {};

export const rtc = {
  available: typeof g.RTCPeerConnection !== 'undefined' && !!g.navigator?.mediaDevices,
  RTCPeerConnection: g.RTCPeerConnection as any,
  RTCSessionDescription: g.RTCSessionDescription as any,
  RTCIceCandidate: g.RTCIceCandidate as any,
  getUserMedia: (c: any): Promise<any> => g.navigator.mediaDevices.getUserMedia(c),
  platform: 'web' as 'web' | 'native',
};
