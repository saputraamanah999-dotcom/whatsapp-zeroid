/**
 * Global message search — WhatsApp-style: searches inside ALL chats the user
 * is a member of (newest 200 messages per chat, client-side filter), debounced.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, Pressable, TextInput, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T, Screen, Header, Empty } from '../components/ui';
import { Icon } from '../lib/icons';
import { useTheme, font, R } from '../lib/theme';
import { useStore, searchAllMessages, SearchHit, chatTitle, messagePreview } from '../lib/store';
import { timeShort } from '../lib/format';

export default function SearchScreen({ navigation }: any) {
  const t = useTheme();
  const { db, me } = useStore();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runId = useRef(0);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setHits([]); setScanning(false); setDone(false);
      return;
    }
    setScanning(true);
    timer.current = setTimeout(async () => {
      const id = ++runId.current;
      const res = await searchAllMessages(q);
      if (id !== runId.current) return;
      setHits(res);
      setScanning(false);
      setDone(true);
    }, 450);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const open = (hit: SearchHit) => {
    navigation.navigate('ChatRoom', { chatId: hit.chatId, jumpTo: hit.message.id });
  };

  return (
    <Screen>
      <Header title="Cari pesan" />
      <View style={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.bg, borderRadius: R.md, paddingHorizontal: 12, boxShadow: t.insetSm } as any}>
          <Ionicons name="search" size={17} color={t.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Cari di semua chat (min. 2 huruf)…"
            placeholderTextColor={t.faint}
            autoFocus
            maxLength={80}
            style={[font, { flex: 1, color: t.text, fontSize: 15, paddingVertical: 12, ...(Platform_style() as object) }]}
          />
          {!!q && (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Bersihkan">
              <Ionicons name="close" size={16} color={t.faint} />
            </Pressable>
          )}
        </View>
        {scanning && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <ActivityIndicator size="small" color={t.accent} />
            <T v="caption" color={t.faint}>Memindai semua chat…</T>
          </View>
        )}
        {!scanning && done && hits.length === 0 && q.trim().length >= 2 && (
          <T v="sub" color={t.faint} style={{ marginTop: 16, textAlign: 'center' }}>
            Tidak ada pesan yang cocok dengan "{q.trim()}".
          </T>
        )}
      </View>
      <FlatList
        data={hits}
        keyExtractor={(h) => h.message.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 30, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        renderItem={({ item }) => {
          const chat = db.chats[item.chatId];
          const preview = item.message.text || messagePreview(item.message);
          return (
            <Pressable
              onPress={() => open(item)}
              style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: pressed ? t.bg2 : 'transparent' })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={(chat?.type === 'group' || chat?.type === 'channel' ? 'people' : 'chatbubble-ellipses') as any} size={17} color={t.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <T v="sub" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                      {chat ? chatTitle(chat, me?.id ?? '', db) : 'Chat'}
                    </T>
                    <T v="caption" color={t.faint}>{timeShort(item.message.createdAt)}</T>
                  </View>
                  <T v="caption" color={t.sub} numberOfLines={2}>
                    {item.message.senderId === me?.id ? 'Kamu: ' : ''}
                    {preview}
                  </T>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !scanning && q.trim().length < 2 ? (
            <Empty icon="search-outline" title="Cari di semua chat" body="Ketik kata kunci untuk menemukan pesan di seluruh chat pribadi, grup, dan channel." />
          ) : null
        }
      />
    </Screen>
  );
}

/** web outline removal helper (kept tiny) */
const Platform_style = () => (typeof navigator !== 'undefined' ? { outlineStyle: 'none' } : {});
