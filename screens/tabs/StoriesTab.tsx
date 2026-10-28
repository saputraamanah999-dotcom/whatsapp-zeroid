import React, { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, IconBtn, Avatar, Neu, Empty } from '../../components/ui';
import { useTheme, R } from '../../lib/theme';
import { useStore, activeStories, canSee } from '../../lib/store';
import { ago } from '../../lib/format';
import { Story } from '../../lib/types';

export default function StoriesTab() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { db, me } = useStore();
  const [refreshing, setRefreshing] = useState(false);

  const { mine, groups } = useMemo(() => {
    if (!me) return { mine: [] as Story[], groups: [] as { userId: string; list: Story[]; unseen: boolean; latest: number }[] };
    const st = activeStories(db);
    const mine = st.filter((s) => s.userId === me.id);
    const by: Record<string, Story[]> = {};
    for (const s of st) {
      if (s.userId === me.id) continue;
      const owner = db.users[s.userId];
      if (!owner || me.blocked.includes(owner.id)) continue;
      if (!me.contacts.includes(owner.id) && !owner.contacts.includes(me.id)) continue;
      (by[s.userId] ??= []).push(s);
    }
    const groups = Object.entries(by).map(([userId, list]) => ({ userId, list: list.sort((a, b) => a.createdAt - b.createdAt), unseen: list.some((s) => !s.viewers.includes(me.id)), latest: Math.max(...list.map((s) => s.createdAt)) }));
    groups.sort((a, b) => Number(b.unseen) - Number(a.unseen) || b.latest - a.latest);
    return { mine, groups };
  }, [db, me]);

  if (!me) return null;
  const myLast = mine[mine.length - 1];
  const myViews = mine.reduce((n, s) => n + s.viewers.length, 0);
  const unseen = groups.filter((g) => g.unseen);
  const seen = groups.filter((g) => !g.unseen);
  const sections: ({ kind: 'header'; title: string } | { kind: 'item'; g: (typeof groups)[0] })[] = [
    ...(unseen.length ? [{ kind: 'header' as const, title: 'Pembaruan terbaru' }, ...unseen.map((g) => ({ kind: 'item' as const, g }))] : []),
    ...(seen.length ? [{ kind: 'header' as const, title: 'Sudah dilihat' }, ...seen.map((g) => ({ kind: 'item' as const, g }))] : []),
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <T v="h1" style={{ flex: 1 }}>
          Story
        </T>
        <IconBtn icon="text" onPress={() => nav.navigate('StoryCreate', { mode: 'text' })} label="Story teks" />
        <IconBtn icon="camera" color={t.accent} onPress={() => nav.navigate('StoryCreate', { mode: 'image' })} label="Story foto" />
      </View>
      <FlatList
        data={sections}
        keyExtractor={(x, i) => (x.kind === 'header' ? 'h' + x.title : x.g.userId) + i}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), setTimeout(() => setRefreshing(false), 700))} tintColor={t.accent} colors={[t.accent]} />}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ gap: 18, marginBottom: 10 }}>
            <Neu radius={R.lg} style={{ padding: 14 }}>
              <Pressable onPress={() => (mine.length ? nav.navigate('StoryViewer', { userId: me.id }) : nav.navigate('StoryCreate', { mode: 'image' }))} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View>
                  <Avatar uri={me.avatar} name={me.name} color={me.color} size={58} ring={mine.length ? 'seen' : null} />
                  {!mine.length && (
                    <View style={{ position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.bg }}>
                      <Ionicons name="add" size={16} color="#fff" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <T v="h3">Story saya</T>
                  <T v="sub">{mine.length ? `${mine.length} story · ${ago(myLast.createdAt)} · ${myViews} dilihat` : 'Ketuk untuk menambahkan Story'}</T>
                </View>
                {mine.length > 0 && <IconBtn icon="add" size={38} onPress={() => nav.navigate('StoryCreate', { mode: 'image' })} />}
              </Pressable>
            </Neu>
            {groups.length > 0 && (
              <FlatList
                horizontal
                data={groups}
                keyExtractor={(g) => 'c' + g.userId}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingVertical: 8, paddingHorizontal: 2 }}
                renderItem={({ item }) => {
                  const last = item.list[item.list.length - 1];
                  const u = db.users[item.userId];
                  return (
                    <Pressable onPress={() => nav.navigate('StoryViewer', { userId: item.userId })} style={{ width: 110, height: 170, borderRadius: R.lg, overflow: 'hidden', backgroundColor: last.bg ?? '#000', boxShadow: t.raisedSm } as any}>
                      {last.type === 'image' && last.uri ? <Image source={{ uri: last.uri }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' } as any} contentFit="cover" /> : <View style={{ flex: 1, padding: 10, justifyContent: 'center' }}><T v="caption" color="#fff" numberOfLines={5} style={{ fontWeight: '700', textAlign: 'center' }}>{last.text ?? ''}</T></View>}
                      <View style={{ position: 'absolute', top: 8, left: 8 }}>
                        <Avatar uri={canSee(me, u, u.privacy.profilePhoto) ? u.avatar : null} name={u.name} color={u.color} size={34} ring={item.unseen ? 'unseen' : 'seen'} />
                      </View>
                      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.35)' }}>
                        <T v="caption" color="#fff" numberOfLines={1} style={{ fontWeight: '700' }}>
                          {u.name.split(' ')[0]}
                        </T>
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item.kind === 'header')
            return (
              <T v="label" style={{ marginTop: 14, marginBottom: 6, marginLeft: 6 }}>
                {item.title}
              </T>
            );
          const u = db.users[item.g.userId];
          return (
            <Pressable onPress={() => nav.navigate('StoryViewer', { userId: u.id })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: R.lg, boxShadow: pressed ? t.insetSm : undefined } as any)}>
              <Avatar uri={canSee(me, u, u.privacy.profilePhoto) ? u.avatar : null} name={u.name} color={u.color} size={52} ring={item.g.unseen ? 'unseen' : 'seen'} />
              <View style={{ flex: 1 }}>
                <T v="h3">{u.name}</T>
                <T v="sub">
                  {item.g.list.length} story · {ago(item.g.latest)}
                </T>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Empty icon="aperture-outline" title="Belum ada Story" body="Story dari kontakmu akan muncul di sini dan hilang setelah 24 jam." />}
      />
    </View>
  );
}
