/**
 * CALL BAR — pill mengambang "panggilan berlangsung" (ala WhatsApp).
 * Tampil di SEMUA layar saat panggilan jalan di latar; ketuk → kembali ke layar
 * panggilan; tombol merah → akhiri. Hilang otomatis saat panggilan berakhir.
 */
import React, { useEffect, useState } from 'react';
import { View, Pressable, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { T, Avatar } from './ui';
import { useTheme, R } from '../lib/theme';
import { useStore, endCall } from '../lib/store';
import { useHubCall, hubHangup, hubLeaveScreen } from '../lib/callhub';
import { duration } from '../lib/format';

export default function CallBar() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { db, me } = useStore();
  const hb = useHubCall();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!hb) return;
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, [hb?.callId]);

  // panggilan berakhir di server (lawan akhiri / ditolak) → bersihkan hub
  const call = hb ? db.calls.find((c) => c.id === hb.callId) : undefined;
  useEffect(() => {
    if (hb && (!call || ['ended', 'missed', 'declined', 'busy'].includes(call.status))) hubHangup('selesai');
  }, [hb?.callId, call?.status]);

  if (!hb || hb.onScreen || !me) return null;
  const peer = db.users[hb.peerId];
  const chat = db.chats[hb.chatId];
  const title = peer?.name ?? chat?.name ?? 'Panggilan';
  const durText = call?.connectedAt
    ? duration((now - call.connectedAt) / 1000)
    : hb.rtcState === 'failed' ? 'gagal' : 'menyambungkan…';

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: 92, zIndex: 60 } as ViewStyle}>
      <Pressable
        onPress={() => nav.navigate('Call', { callId: hb.callId })}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 12,
          paddingVertical: 9, paddingLeft: 9, paddingRight: 9,
          borderRadius: R.lg, backgroundColor: t.dark ? 'rgba(18,23,34,0.96)' : '#fff',
          borderWidth: 1, borderColor: 'rgba(20,196,122,0.35)',
          boxShadow: '0px 10px 26px rgba(0,0,0,0.30)', opacity: pressed ? 0.95 : 1,
        } as ViewStyle)}
        accessibilityLabel="Kembali ke panggilan berlangsung"
      >
        <View style={{ position: 'relative' }}>
          <Avatar uri={peer?.avatar ?? chat?.avatar} name={title} color={peer?.color ?? chat?.color} size={40} />
          <View style={{ position: 'absolute', right: -2, bottom: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#14C47A', borderWidth: 2, borderColor: t.dark ? '#121722' : '#fff' }} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="sub" numberOfLines={1} style={{ fontWeight: '800' }}>
            {hb.video ? 'Panggilan video' : 'Panggilan suara'} · {title}
          </T>
          <T v="caption" color="#14C47A" style={{ fontVariant: ['tabular-nums'] as any }}>
            {durText} · ketuk untuk kembali
          </T>
        </View>
        <Pressable
          onPress={() => {
            hubHangup('bar');
            if (hb.callId) endCall(hb.callId);
            hubLeaveScreen();
          }}
          accessibilityLabel="Akhiri panggilan dari bar"
          style={({ pressed }) => ({
            width: 42, height: 42, borderRadius: 21, backgroundColor: t.danger,
            alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }],
          } as ViewStyle)}
        >
          <Ionicons name="call" size={20} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </Pressable>
    </View>
  );
}
