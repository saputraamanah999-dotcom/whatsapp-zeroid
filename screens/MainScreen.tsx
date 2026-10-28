import React, { useState } from 'react';
import { View, Pressable, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useTheme, R } from '../lib/theme';
import { T, IconName } from '../components/ui';
import { useStore, unreadCount, isMember, activeStories, incomingCallFor } from '../lib/store';
import ChatsTab from './tabs/ChatsTab';
import StoriesTab from './tabs/StoriesTab';
import CallsTab from './tabs/CallsTab';
import DiscoverTab from './tabs/DiscoverTab';
import MeTab from './tabs/MeTab';

type Tab = 'chats' | 'stories' | 'calls' | 'discover' | 'me';
const TABS: { key: Tab; label: string; icon: IconName; iconOn: IconName }[] = [
  { key: 'chats', label: 'Chat', icon: 'chatbubbles-outline', iconOn: 'chatbubbles' },
  { key: 'stories', label: 'Story', icon: 'aperture-outline', iconOn: 'aperture' },
  { key: 'calls', label: 'Panggilan', icon: 'call-outline', iconOn: 'call' },
  { key: 'discover', label: 'Channel', icon: 'megaphone-outline', iconOn: 'megaphone' },
  { key: 'me', label: 'Saya', icon: 'person-circle-outline', iconOn: 'person-circle' },
];

export default function MainScreen() {
  const [tab, setTab] = useState<Tab>('chats');
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { db, me } = useStore();
  if (!me) return null;

  const chatUnread = Object.values(db.chats).filter((c) => (c.type === 'direct' || c.type === 'group' || c.type === 'ai') && isMember(c, me.id) && !c.archivedBy.includes(me.id) && unreadCount(c, me.id) > 0).length;
  const channelUnread = Object.values(db.chats).filter((c) => c.type === 'channel' && c.members.includes(me.id) && unreadCount(c, me.id) > 0).length;
  const storyNew = activeStories(db).some((s) => s.userId !== me.id && !s.viewers.includes(me.id) && me.contacts.includes(s.userId));
  const missed = db.calls.filter((c) => c.status === 'missed' && c.calleeIds.includes(me.id) && c.startedAt > (me.lastSeen - 86400000)).length;
  const badges: Partial<Record<Tab, number | 'dot'>> = { chats: chatUnread, discover: channelUnread, stories: storyNew ? 'dot' : 0, calls: missed };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Animated.View key={tab} entering={FadeIn.duration(180)} style={{ flex: 1 }}>
        {tab === 'chats' && <ChatsTab />}
        {tab === 'stories' && <StoriesTab />}
        {tab === 'calls' && <CallsTab />}
        {tab === 'discover' && <DiscoverTab />}
        {tab === 'me' && <MeTab />}
      </Animated.View>
      <View style={{ paddingBottom: insets.bottom + 10, paddingTop: 10, paddingHorizontal: 14, backgroundColor: t.bg }}>
        <View style={{ flexDirection: 'row', backgroundColor: t.bg, borderRadius: R.xl, padding: 6, boxShadow: t.raised, maxWidth: 560, width: '100%', alignSelf: 'center' } as ViewStyle}>
          {TABS.map((x) => {
            const on = x.key === tab;
            const b = badges[x.key];
            return (
              <Pressable key={x.key} onPress={() => setTab(x.key)} style={{ flex: 1 }} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.label}>
                <View style={{ alignItems: 'center', paddingVertical: 8, borderRadius: R.lg, boxShadow: on ? t.insetSm : undefined } as ViewStyle}>
                  <View>
                    <Ionicons name={on ? x.iconOn : x.icon} size={23} color={on ? t.accent : t.sub} />
                    {b === 'dot' ? (
                      <View style={{ position: 'absolute', top: -1, right: -3, width: 9, height: 9, borderRadius: 5, backgroundColor: t.accent, borderWidth: 1.5, borderColor: t.bg }} />
                    ) : b ? (
                      <View style={{ position: 'absolute', top: -5, right: -10, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: x.key === 'calls' ? t.danger : t.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: t.bg }}>
                        <T v="caption" color="#fff" style={{ fontSize: 9, fontWeight: '800' }}>
                          {b > 99 ? '99+' : b}
                        </T>
                      </View>
                    ) : null}
                  </View>
                  <T v="caption" color={on ? t.accent : t.sub} style={{ marginTop: 3, fontSize: 11, fontWeight: on ? '700' : '500' }}>
                    {x.label}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
