import { addDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { rtc } from './rtc';
import { firebase, COLLECTIONS } from './firebase';

export type SigKind = 'ready' | 'offer' | 'answer' | 'ice' | 'bye';
export type Sig = { callId: string; from: string; to: string; kind: SigKind; payload?: any; at: number };

interface Signaling {
  send(s: Omit<Sig, 'at'>): void;
  listen(me: string, callId: string, cb: (s: Sig) => void): () => void;
}

/** Same-device signaling between browser tabs (fallback only — used when Firebase is unavailable). */
class BroadcastSignaling implements Signaling {
  ch: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('zeroid-rtc') : null;
  send(s: Omit<Sig, 'at'>) {
    this.ch?.postMessage({ ...s, at: Date.now() });
  }
  listen(me: string, callId: string, cb: (s: Sig) => void) {
    const h = (e: MessageEvent) => {
      const s = e.data as Sig;
      if (s?.callId === callId && s.to === me) cb(s);
    };
    this.ch?.addEventListener('message', h);
    return () => this.ch?.removeEventListener('message', h);
  }
}

/** Cross-device signaling through Firestore: calls/{callId}/signals. */
class FirestoreSignaling implements Signaling {
  send(s: Omit<Sig, 'at'>) {
    const fb = firebase();
    if (!fb) return;
    addDoc(collection(fb.db, COLLECTIONS.calls, s.callId, 'signals'), { ...s, payload: JSON.stringify(s.payload ?? null), at: Date.now() }).catch((e) => console.warn('signal', e));
  }
  listen(me: string, callId: string, cb: (s: Sig) => void) {
    const fb = firebase();
    if (!fb) return () => {};
    const q = query(collection(fb.db, COLLECTIONS.calls, callId, 'signals'), where('to', '==', me));
    return onSnapshot(q, (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type !== 'added') return;
        const d = ch.doc.data() as any;
        cb({ ...d, payload: JSON.parse(d.payload ?? 'null') });
      });
    });
  }
}

const signaling: Signaling = firebase() ? new FirestoreSignaling() : new BroadcastSignaling();

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // Optional TURN (needed behind symmetric NAT). Set via EXPO_PUBLIC_TURN_URL / _USER / _CRED.
  ...(process.env.EXPO_PUBLIC_TURN_URL
    ? [{
        urls: (process.env.EXPO_PUBLIC_TURN_URL as string).split(',').map((x: string) => x.trim()).filter(Boolean),
        username: process.env.EXPO_PUBLIC_TURN_USER || undefined,
        credential: process.env.EXPO_PUBLIC_TURN_CRED || undefined,
      }]
    : []),
];

export type RtcState = 'idle' | 'media' | 'connecting' | 'connected' | 'failed' | 'closed' | 'no-media';

export class CallSession {
  pc: any = null;
  local: any = null;
  remote: any = null;
  private pendingIce: any[] = [];
  private unsub: (() => void) | null = null;
  private facing: 'user' | 'environment' = 'user';
  private closed = false;

  constructor(
    private o: {
      callId: string;
      me: string;
      peer: string;
      video: boolean;
      isCaller: boolean;
      realPeer: boolean;
      onLocal: (s: any) => void;
      onRemote: (s: any) => void;
      onState: (s: RtcState) => void;
    }
  ) {}

  async start() {
    if (!rtc.available) {
      this.o.onState('no-media');
      return;
    }
    try {
      this.local = await rtc.getUserMedia({ audio: true, video: this.o.video ? { facingMode: this.facing, width: { ideal: 720 }, height: { ideal: 1280 } } : false });
      if (this.closed) return this.release();
      this.o.onLocal(this.local);
      this.o.onState('media');
    } catch (e) {
      console.warn('getUserMedia', e);
      this.o.onState('no-media');
      return;
    }
    if (!this.o.realPeer) return;
    this.pc = new rtc.RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.local.getTracks().forEach((t: any) => this.pc.addTrack(t, this.local));
    this.pc.ontrack = (ev: any) => {
      this.remote = ev.streams?.[0] ?? this.remote;
      if (this.remote) this.o.onRemote(this.remote);
    };
    this.pc.onicecandidate = (ev: any) => {
      if (ev.candidate) this.send('ice', ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate);
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState;
      if (s === 'connected') this.o.onState('connected');
      else if (s === 'failed') this.o.onState('failed');
      else if (s === 'connecting') this.o.onState('connecting');
    };
    this.unsub = signaling.listen(this.o.me, this.o.callId, (s) => this.onSignal(s));
    if (!this.o.isCaller) this.send('ready');
    this.o.onState('connecting');
  }

  private send(kind: SigKind, payload?: any) {
    signaling.send({ callId: this.o.callId, from: this.o.me, to: this.o.peer, kind, payload });
  }

  private async flushIce() {
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(new rtc.RTCIceCandidate(c)).catch(() => {});
  }

  private async onSignal(s: Sig) {
    if (!this.pc) return;
    try {
      if (s.kind === 'ready' && this.o.isCaller) {
        const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: this.o.video });
        await this.pc.setLocalDescription(offer);
        this.send('offer', { type: offer.type, sdp: offer.sdp });
      } else if (s.kind === 'offer' && !this.o.isCaller) {
        await this.pc.setRemoteDescription(new rtc.RTCSessionDescription(s.payload));
        const ans = await this.pc.createAnswer();
        await this.pc.setLocalDescription(ans);
        this.send('answer', { type: ans.type, sdp: ans.sdp });
        await this.flushIce();
      } else if (s.kind === 'answer' && this.o.isCaller) {
        await this.pc.setRemoteDescription(new rtc.RTCSessionDescription(s.payload));
        await this.flushIce();
      } else if (s.kind === 'ice') {
        if (this.pc.remoteDescription) await this.pc.addIceCandidate(new rtc.RTCIceCandidate(s.payload)).catch(() => {});
        else this.pendingIce.push(s.payload);
      } else if (s.kind === 'bye') {
        this.o.onState('closed');
      }
    } catch (e) {
      console.warn('signal handling', e);
    }
  }

  setMuted(muted: boolean) {
    this.local?.getAudioTracks().forEach((t: any) => (t.enabled = !muted));
  }
  setCameraOff(off: boolean) {
    this.local?.getVideoTracks().forEach((t: any) => (t.enabled = !off));
  }
  async switchCamera() {
    const track = this.local?.getVideoTracks()[0];
    if (!track) return;
    if (rtc.platform === 'native' && typeof track._switchCamera === 'function') {
      track._switchCamera();
      return;
    }
    this.facing = this.facing === 'user' ? 'environment' : 'user';
    try {
      const s = await rtc.getUserMedia({ video: { facingMode: this.facing } });
      const nt = s.getVideoTracks()[0];
      const sender = this.pc?.getSenders().find((x: any) => x.track?.kind === 'video');
      await sender?.replaceTrack(nt);
      this.local.removeTrack(track);
      track.stop();
      this.local.addTrack(nt);
      this.o.onLocal(this.local);
    } catch (e) {
      console.warn('switch camera', e);
    }
  }

  private release() {
    this.local?.getTracks().forEach((t: any) => t.stop());
    this.local = null;
  }

  hangup(notify = true) {
    if (this.closed) return;
    this.closed = true;
    if (notify && this.o.realPeer) this.send('bye');
    this.unsub?.();
    try {
      this.pc?.close();
    } catch {}
    this.pc = null;
    this.release();
  }
}

export const webrtcAvailable = rtc.available;
export const signalingMode = firebase() ? 'Firestore (calls/{callId}/signals, dibersihkan saat panggilan berakhir)' : 'BroadcastChannel (antar-tab, fallback)';
