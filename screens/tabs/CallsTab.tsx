import React, { useEffect, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, IconBtn, Avatar, Empty, Neu, Btn, UserBadges } from '../../components/ui';
import { useTheme, R } from '../../lib/theme';
import { useStore, startCall, chatTitle, chatPeer, markCallsSeen, chatBadge } from '../../lib/store';
import { chatTime, duration } from '../../lib/format';
import { ensureAll } from '../../lib/permissions';
import { Call } from '../../lib/types';
import { VerifiedBadge } from '../../lib/icons';

export async function placeCall(nav: any, chatId: string, video: boolean) {
  const ok = await ensureAll(video ? ['microphone', 'camera'] : ['microphone']);
  if (!ok) return;
  const id = startCall(chatId, video);
  if (id) nav.navigate('Call', { callId: id });
}

export default function CallsTab() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { db, me } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'missed'>('all');

  // REAL-TIME: begitu tab dibuka, badge panggilan hilang (missed call dianggap terbaca)
  useEffect(() => { markCallsSeen(); }, []);

  const calls = useMemo(() => {
    if (!me) return [];
    let l = db.calls.filter((c) => c.id !== '_schema' && (c.callerId === me.id || c.calleeIds.includes(me.id)));
    if (filter === 'missed') l = l.filter((c) => (c.status === 'missed' || c.status === 'declined') && c.callerId !== me.id);
    return l.sort((a, b) => b.startedAt - a.startedAt);
  }, [db, me, filter]);
  if (!me) return null;

  const render = ({ item }: { item: Call }) => {
    const chat = db.chats[item.chatId];
    if (!chat) return null;
    const outgoing = item.callerId === me.id;
    const peer = chatPeer(chat, me.id, db);
    const title = chatTitle(chat, me.id, db);
    const bad = item.status === 'missed' || item.status === 'declined';
    const dur = item.connectedAt && item.endedAt ? duration((item.endedAt - item.connectedAt) / 1000) : null;
    return (
      <Pressable onPress={() => nav.navigate('ChatInfo', { chatId: chat.id })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, marginHorizontal: 14, marginVertical: 4, borderRadius: R.lg, boxShadow: pressed ? t.insetSm : undefined } as any)}>
        <Avatar uri={peer?.avatar ?? chat.avatar} name={title} color={peer?.color ?? chat.color} size={50} icon={chat.type === 'group' && !chat.avatar ? 'people' : undefined} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T v="h3" color={bad && !outgoing ? t.danger : t.text} numberOfLines={1} style={{ flexShrink: 1 }}>
              {title}
            </T>
            {/* centang biru tampil SEBELUM membuka info (chat pribadi, grup, saluran) */}
            {chat.type === 'direct' ? <UserBadges user={peer} size={14} /> : chatBadge(chat, db) ? <VerifiedBadge size={14} animate={false} /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <Ionicons name={outgoing ? 'arrow-up-outline' : 'arrow-down-outline'} size={14} color={bad ? t.danger : t.success} style={{ transform: [{ rotate: '45deg' }] }} />
            <T v="sub">
              {outgoing ? 'Keluar' : 'Masuk'} · {chatTime(item.startedAt)}
              {dur ? ` · ${dur}` : item.status === 'declined' ? ' · ditolak' : item.status === 'missed' ? ' · tak terjawab' : ''}
            </T>
          </View>
        </View>
        <IconBtn icon={item.video ? 'videocam' : 'call'} color={t.accent} size={42} onPress={() => placeCall(nav, chat.id, item.video)} />
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T v="h1" style={{ flex: 1 }}>
          Panggilan
        </T>
        <IconBtn icon={filter === 'missed' ? 'funnel' : 'funnel-outline'} active={filter === 'missed'} onPress={() => setFilter(filter === 'all' ? 'missed' : 'all')} label="Filter tak terjawab" />
        <IconBtn icon="add-circle-outline" color={t.accent} onPress={() => nav.navigate('NewChat', { mode: 'call' })} label="Panggilan baru" />
      </View>
      <FlatList
        data={calls}
        keyExtractor={(c) => c.id}
        renderItem={render}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), setTimeout(() => setRefreshing(false), 700))} tintColor={t.accent} colors={[t.accent]} />}
        contentContainerStyle={{ paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          calls.length > 0 ? (
            <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
              <T v="label" style={{ marginLeft: 6 }}>
                Terbaru
              </T>
            </View>
          ) : null
        }
        ListEmptyComponent={<Empty icon="call-outline" title={filter === 'missed' ? 'Tidak ada panggilan tak terjawab' : 'Belum ada riwayat panggilan'} body="Mulai voice atau video call dari halaman chat atau tombol + di atas." />}
      />
    </View>
  );
}
