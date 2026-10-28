import React, { useEffect, useRef, useState } from 'react';
import { View, Pressable, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, FadeIn } from 'react-native-reanimated';
import { T, Avatar } from '../components/ui';
import RTCVideo from '../components/RTCVideo';
import { useTheme } from '../lib/theme';
import { useStore, endCall, chatTitle, getDB } from '../lib/store';
import { CallSession, RtcState, signalingMode } from '../lib/webrtc';
import { duration } from '../lib/format';

function Ripple({ delay, color }: { delay: number; color: string }) {
  const s = useSharedValue(0);
  useEffect(() => {
    const id = setTimeout(() => (s.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1)), delay);
    return () => clearTimeout(id);
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: 1 + s.value * 0.9 }], opacity: 0.5 * (1 - s.value) }));
  return <Animated.View style={[{ position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 2, borderColor: color }, st]} />;
}

export default function CallScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { db, me } = useStore();
  const call = db.calls.find((c) => c.id === params?.callId);
  const [local, setLocal] = useState<any>(null);
  const [remote, setRemote] = useState<any>(null);
  const [rtcState, setRtcState] = useState<RtcState>('idle');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [now, setNow] = useState(Date.now());
  const session = useRef<CallSession | null>(null);

  const chat = call ? db.chats[call.chatId] : undefined;
  const isCaller = call?.callerId === me?.id;
  const peerId = call && me ? (isCaller ? call.calleeIds[0] : call.callerId) : undefined;
  const peer = peerId ? db.users[peerId] : undefined;
  const realPeer = chat?.type === 'direct';

  // start media / peer connection
  useEffect(() => {
    if (!call || !me || !peerId) return;
    const s = new CallSession({
      callId: call.id,
      me: me.id,
      peer: peerId,
      video: call.video,
      isCaller: call.callerId === me.id,
      realPeer,
      onLocal: (st) => setLocal(st),
      onRemote: (st) => setRemote(st),
      onState: (st) => {
        setRtcState(st);
        if (st === 'closed') endCall(call.id);
      },
    });
    session.current = s;
    s.start();
    return () => s.hangup();
  }, [call?.id]);

  // tick timer
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  // leave when the call finishes
  const finished = !call || call.status === 'ended' || call.status === 'declined' || call.status === 'missed';
  useEffect(() => {
    if (finished) {
      session.current?.hangup();
      const id = setTimeout(() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main')), 1300);
      return () => clearTimeout(id);
    }
  }, [finished]);

  if (!me) return null;
  if (!call || !chat) return <View style={{ flex: 1, backgroundColor: '#0B1220' }} />;

  const title = chatTitle(chat, me.id, db);
  const status =
    call.status === 'ringing'
      ? isCaller
        ? 'Berdering…'
        : 'Menghubungkan…'
      : call.status === 'ongoing'
      ? call.connectedAt
        ? duration((now - call.connectedAt) / 1000)
        : 'Terhubung'
      : call.status === 'declined'
      ? 'Panggilan ditolak'
      : call.status === 'missed'
      ? 'Tidak dijawab'
      : 'Panggilan berakhir';

  const video = call.video;
  const dark = video || t.dark;
  const fg = dark ? '#fff' : t.text;
  const sub = dark ? 'rgba(255,255,255,0.75)' : t.sub;
  const groupMembers = chat.type === 'group' ? chat.members.filter((m) => m !== me.id).slice(0, 6) : [];

  const Ctrl = ({ icon, on, onPress, danger, label }: { icon: React.ComponentProps<typeof Ionicons>['name']; on?: boolean; onPress: () => void; danger?: boolean; label: string }) => (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={label}
        style={({ pressed }) =>
          ({
            width: danger ? 72 : 60,
            height: danger ? 72 : 60,
            borderRadius: 40,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: danger ? t.danger : on ? (dark ? '#fff' : t.accent) : dark ? 'rgba(255,255,255,0.16)' : t.bg,
            boxShadow: danger ? '0px 10px 24px rgba(255,59,92,0.45)' : dark ? undefined : pressed || on ? t.insetSm : t.raisedSm,
            transform: [{ scale: pressed ? 0.94 : 1 }],
          } as ViewStyle)
        }
      >
        <Ionicons name={icon} size={danger ? 32 : 25} color={danger ? '#fff' : on ? (dark ? '#0B1220' : '#fff') : fg} style={danger ? { transform: [{ rotate: '135deg' }] } : undefined} />
      </Pressable>
      <T v="caption" color={sub}>
        {label}
      </T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: video ? '#0B1220' : t.bg }}>
      {video && (
        <View style={{ position: 'absolute', inset: 0 } as ViewStyle}>
          {remote ? (
            <RTCVideo stream={remote} style={{ flex: 1 }} muted={false} />
          ) : local && call.status !== 'ongoing' && !camOff ? (
            <RTCVideo stream={local} mirror style={{ flex: 1, opacity: 0.85 }} />
          ) : (
            <View style={{ flex: 1, backgroundColor: '#0B1220' }} />
          )}
          <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(5,10,20,0.25)' } as ViewStyle} />
        </View>
      )}
      {!video && remote && <RTCVideo stream={remote} style={{ width: 1, height: 1, opacity: 0 }} muted={false} />}

      <View style={{ paddingTop: insets.top + 24, alignItems: 'center', gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="lock-closed" size={12} color={sub} />
          <T v="caption" color={sub}>
            {video ? 'Video call' : 'Voice call'} · WebRTC · {realPeer ? signalingMode : 'panggilan grup belum didukung'}
          </T>
        </View>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        {(!video || (!remote && call.status === 'ongoing') || (video && camOff && !remote)) && (
          <Animated.View entering={FadeIn} style={{ alignItems: 'center', justifyContent: 'center', width: 200, height: 200 }}>
            {call.status === 'ringing' && (
              <>
                <Ripple delay={0} color={video ? '#fff' : t.accent} />
                <Ripple delay={800} color={video ? '#fff' : t.accent} />
                <Ripple delay={1600} color={video ? '#fff' : t.accent} />
              </>
            )}
            {groupMembers.length > 1 ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 180, justifyContent: 'center', gap: 8 }}>
                {groupMembers.map((id) => (
                  <Avatar key={id} uri={db.users[id]?.avatar} name={db.users[id]?.name ?? ''} color={db.users[id]?.color} size={56} />
                ))}
              </View>
            ) : (
              <Avatar uri={peer?.avatar ?? chat.avatar} name={title} color={peer?.color ?? chat.color} size={150} />
            )}
          </Animated.View>
        )}
        <View style={{ alignItems: 'center', gap: 6, marginTop: video && remote ? 'auto' : 0 }}>
          <T v="h1" color={fg} style={{ textAlign: 'center', paddingHorizontal: 20 }}>
            {title}
          </T>
          <T v="body" color={call.status === 'declined' || call.status === 'missed' ? t.danger : sub} style={{ fontVariant: ['tabular-nums'] }}>
            {status}
          </T>
          {rtcState === 'no-media' && (
            <T v="caption" color={sub} style={{ textAlign: 'center', paddingHorizontal: 40, marginTop: 6 }}>
              Kamera/mikrofon tidak tersedia. Di Android gunakan development build (react-native-webrtc) dan izinkan akses.
            </T>
          )}
          {realPeer && rtcState === 'connecting' && call.status === 'ongoing' && (
            <T v="caption" color={sub}>
              Menegosiasikan koneksi peer-to-peer…
            </T>
          )}
          {rtcState === 'failed' && (
            <T v="caption" color={t.danger}>
              Koneksi gagal (NAT). Tambahkan TURN server.
            </T>
          )}
        </View>
      </View>

      {video && local && !camOff && (call.status === 'ongoing' || remote) && (
        <View style={{ position: 'absolute', top: insets.top + 64, right: 16, width: 110, height: 160, borderRadius: 20, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }}>
          <RTCVideo stream={local} mirror style={{ flex: 1 }} />
        </View>
      )}

      <View style={{ paddingBottom: insets.bottom + 30, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', maxWidth: 440, width: '100%', alignSelf: 'center', padding: 16, borderRadius: 34, backgroundColor: dark ? 'rgba(15,23,42,0.55)' : t.bg, boxShadow: dark ? undefined : t.raised } as ViewStyle}>
          <Ctrl icon={muted ? 'mic-off' : 'mic'} on={muted} label={muted ? 'Bisu' : 'Mic'} onPress={() => (setMuted(!muted), session.current?.setMuted(!muted))} />
          {video ? (
            <Ctrl icon={camOff ? 'videocam-off' : 'videocam'} on={camOff} label="Kamera" onPress={() => (setCamOff(!camOff), session.current?.setCameraOff(!camOff))} />
          ) : (
            <Ctrl icon={speaker ? 'volume-high' : 'volume-low'} on={speaker} label="Speaker" onPress={() => setSpeaker(!speaker)} />
          )}
          {video && <Ctrl icon="camera-reverse" label="Balik" onPress={() => session.current?.switchCamera()} />}
          <Ctrl
            icon="call"
            danger
            label="Akhiri"
            onPress={() => {
              session.current?.hangup();
              endCall(call.id);
              if (getDB().calls.find((c) => c.id === call.id)?.status === 'ringing') nav.goBack();
            }}
          />
        </View>
      </View>
    </View>
  );
}
