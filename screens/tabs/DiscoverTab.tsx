import React, { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, IconBtn, Avatar, Neu, Btn, Badge } from '../../components/ui';
import { useTheme, R } from '../../lib/theme';
import { useStore, toggleFollow, unreadCount, lastMessage, messagePreview, openAI } from '../../lib/store';
import { Chat } from '../../lib/types';

export default function DiscoverTab() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { db, me } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const channels = useMemo(() => Object.values(db.chats).filter((c) => c.type === 'channel'), [db]);
  if (!me) return null;
  const following = channels.filter((c) => c.members.includes(me.id));
  const explore = channels.filter((c) => !c.members.includes(me.id));
  const global = db.chats.c_global;
  const botId = `bot_${me.id}`;
  const bot = db.chats[botId];

  const ChannelItem = ({ c, follow }: { c: Chat; follow?: boolean }) => {
    const last = lastMessage(c.id, me.id);
    const un = unreadCount(c, me.id);
    return (
      <Pressable onPress={() => nav.navigate('ChatRoom', { chatId: c.id })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: R.lg, boxShadow: pressed ? t.insetSm : undefined } as any)}>
        <Avatar uri={c.avatar} name={c.name ?? ''} color={c.color} size={50} icon={c.avatar ? undefined : 'megaphone'} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <T v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {c.name}
            </T>
            {c.verified && <Ionicons name="checkmark-circle" size={15} color={t.accent} />}
          </View>
          <T v="sub" numberOfLines={1}>
            {follow ? `${c.members.length} pengikut · ${c.description ?? ''}` : messagePreview(last) || c.description}
          </T>
        </View>
        {follow ? <Btn small title="Ikuti" onPress={() => toggleFollow(c.id)} style={{ height: 36 }} /> : <Badge n={un} />}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T v="h1" style={{ flex: 1 }}>
          Channel
        </T>
        <IconBtn icon="add" color={t.accent} onPress={() => nav.navigate('NewGroup', { type: 'channel' })} label="Buat saluran" />
      </View>
      <FlatList
        data={following}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), setTimeout(() => setRefreshing(false), 700))} tintColor={t.accent} colors={[t.accent]} />}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: 16, marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <Pressable onPress={() => nav.navigate('ChatRoom', { chatId: openAI() })} style={({ pressed }) => ({ flex: 1, borderRadius: R.lg, padding: 16, backgroundColor: t.accent, transform: [{ scale: pressed ? 0.98 : 1 }], boxShadow: '0px 12px 24px rgba(30,107,255,0.35)' } as any)}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="sparkles" size={22} color="#fff" />
                </View>
                <T v="h3" color="#fff" style={{ marginTop: 14 }}>
                  Zeroid AI
                </T>
                <T v="caption" color="rgba(255,255,255,0.85)">
                  {bot && unreadCount(bot, me.id) ? `${unreadCount(bot, me.id)} pesan baru` : 'Tanya apa saja · Jerexd'}
                </T>
              </Pressable>
              {global && (
                <Pressable onPress={() => nav.navigate('ChatRoom', { chatId: global.id })} style={({ pressed }) => ({ flex: 1, borderRadius: R.lg, padding: 16, backgroundColor: t.bg, boxShadow: pressed ? t.inset : t.raised } as any)}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="globe" size={22} color={t.accent} />
                  </View>
                  <T v="h3" style={{ marginTop: 14 }}>
                    Global Chat
                  </T>
                  <T v="caption">{unreadCount(global, me.id) ? `${unreadCount(global, me.id)} pesan baru` : `${Object.keys(db.users).length - 1} anggota`}</T>
                </Pressable>
              )}
            </View>
            <T v="label" style={{ marginLeft: 6, marginTop: 8 }}>
              Diikuti
            </T>
            {following.length === 0 && (
              <Neu radius={R.lg} style={{ padding: 18 }}>
                <T v="sub">Kamu belum mengikuti channel apa pun. Jelajahi di bawah.</T>
              </Neu>
            )}
          </View>
        }
        renderItem={({ item }) => <ChannelItem c={item} />}
        ListFooterComponent={
          explore.length ? (
            <View style={{ marginTop: 18 }}>
              <T v="label" style={{ marginLeft: 6, marginBottom: 8 }}>
                Jelajahi channel
              </T>
              <Neu radius={R.lg} style={{ padding: 4 }}>
                {explore.map((c) => (
                  <ChannelItem key={c.id} c={c} follow />
                ))}
              </Neu>
            </View>
          ) : null
        }
      />
    </View>
  );
}
