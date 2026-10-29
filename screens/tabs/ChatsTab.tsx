import React, { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, IconBtn, NeuInput, Empty, Btn } from '../../components/ui';
import ChatRow from '../../components/ChatRow';
import { Sheet, Confirm } from '../../components/Sheet';
import { useTheme, R } from '../../lib/theme';
import { useStore, isMember, lastMessage, chatLastMsg, unreadCount, chatTitle, toggleChatFlag, markRead, deleteChat, chatPeer, removeContact, toggleBlock } from '../../lib/store';
import { Chat } from '../../lib/types';

type Filter = 'all' | 'unread' | 'groups' | 'pinned';

export default function ChatsTab() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { db, me } = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [archived, setArchived] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sel, setSel] = useState<Chat | null>(null);
  const [ask, setAsk] = useState<null | { kind: 'delete' | 'remove' | 'block'; chat: Chat }>(null);

  const notifCount = db.notifications.filter((n) => n.userId === me?.id && !n.read).length;

  const { list, archivedCount } = useMemo(() => {
    if (!me) return { list: [], archivedCount: 0 };
    let all = Object.values(db.chats).filter((c) => (c.type === 'direct' || c.type === 'group' || c.type === 'ai' || c.type === 'global') && isMember(c, me.id));
    all = all.filter((c) => c.type !== 'direct' || (db.messages[c.id] ?? []).some((m) => !m.deletedFor.includes(me.id)) || c.createdBy === me.id || !!c.lastMsg);
    const archivedCount = all.filter((c) => c.archivedBy.includes(me.id)).length;
    let list = all.filter((c) => (archived ? c.archivedBy.includes(me.id) : !c.archivedBy.includes(me.id)));
    if (filter === 'unread') list = list.filter((c) => unreadCount(c, me.id) > 0);
    if (filter === 'groups') list = list.filter((c) => c.type === 'group');
    if (filter === 'pinned') list = list.filter((c) => c.pinnedBy.includes(me.id));
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((c) => chatTitle(c, me.id, db).toLowerCase().includes(s) || (db.messages[c.id] ?? []).some((m) => m.text?.toLowerCase().includes(s)));
    }
    list.sort((a, b) => {
      // CHAT GLOBAL selalu paling atas — user baru langsung melihatnya pertama
      const ga = a.type === 'global' ? 2 : 0;
      const gb = b.type === 'global' ? 2 : 0;
      if (ga !== gb) return gb - ga;
      const pa = a.pinnedBy.includes(me.id) ? 1 : 0;
      const pb = b.pinnedBy.includes(me.id) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (chatLastMsg(b, me.id)?.createdAt ?? b.createdAt) - (chatLastMsg(a, me.id)?.createdAt ?? a.createdAt);
    });
    return { list, archivedCount };
  }, [db, me, q, filter, archived]);

  if (!me) return null;
  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 700);
  };

  const chips: { k: Filter; l: string }[] = [
    { k: 'all', l: 'Semua' },
    { k: 'unread', l: 'Belum dibaca' },
    { k: 'groups', l: 'Grup' },
    { k: 'pinned', l: 'Disematkan' },
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {archived ? <IconBtn icon="chevron-back" onPress={() => setArchived(false)} /> : null}
        <View style={{ flex: 1 }}>
          <T v="h1">{archived ? 'Diarsipkan' : 'Chat'}</T>
          {archived && <T v="caption" color={t.sub}>{archivedCount} chat tersimpan — pesan baru tetap masuk</T>}
        </View>
        <IconBtn icon="notifications-outline" badge={notifCount} onPress={() => nav.navigate('Notifications')} label="Notifikasi" />
        <IconBtn icon="search-outline" onPress={() => nav.navigate('Search')} label="Cari semua pesan" />
        {!archived && <IconBtn icon="create-outline" onPress={() => nav.navigate('NewChat')} label="Chat baru" color={t.accent} />}
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={t.accent} colors={[t.accent]} />}
        contentContainerStyle={{ paddingBottom: 20, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 18, paddingTop: 10, gap: 14, marginBottom: 6 }}>
            <NeuInput icon="search" placeholder="Cari chat atau pesan" value={q} onChangeText={setQ} returnKeyType="search" containerStyle={{ minHeight: 48 }} right={q ? <Ionicons name="close-circle" size={18} color={t.faint} onPress={() => setQ('')} /> : undefined} />
            <Pressable onPress={() => nav.navigate('Search')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 4, opacity: pressed ? 0.7 : 1, alignSelf: 'flex-start' })}>
              <Ionicons name="search-sharp" size={14} color={t.accent} />
              <T v="caption" color={t.accent} style={{ fontWeight: '700' }}>Cari di SEMUA pesan (seluruh chat) ›</T>
            </Pressable>
            {!archived && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 6, paddingHorizontal: 2 }}>
                {chips.map((c) => {
                  const on = filter === c.k;
                  return (
                    <Pressable key={c.k} onPress={() => setFilter(c.k)} style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 8, borderRadius: R.pill, backgroundColor: on ? t.accent : t.bg, boxShadow: on ? '0px 6px 14px rgba(30,107,255,0.3)' : pressed ? t.insetSm : t.raisedSm } as any)}>
                      <T v="sub" color={on ? '#fff' : t.sub} style={{ fontWeight: '600' }}>
                        {c.l}
                      </T>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {!archived && archivedCount > 0 && filter === 'all' && !q && (
              <Pressable onPress={() => setArchived(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 8, paddingVertical: 6 }}>
                <Ionicons name="archive-outline" size={20} color={t.sub} />
                <T v="body" style={{ flex: 1, fontWeight: '500' }}>
                  Diarsipkan
                </T>
                <T v="caption" color={t.accent}>
                  {archivedCount}
                </T>
              </Pressable>
            )}
          </View>
        }
        renderItem={({ item }) => <ChatRow chat={item} me={me} db={db} onPress={() => nav.navigate('ChatRoom', { chatId: item.id })} onLongPress={() => setSel(item)} />}
        ListEmptyComponent={
          <Empty
            icon={q ? 'search' : 'chatbubbles-outline'}
            title={q ? 'Tidak ditemukan' : archived ? 'Tidak ada arsip' : 'Belum ada chat'}
            body={q ? `Tidak ada chat yang cocok dengan "${q}".` : 'Mulai percakapan baru dengan kontak atau buat grup.'}
            action={!q && !archived ? <Btn small title="Chat baru" icon="add" onPress={() => nav.navigate('NewChat')} /> : undefined}
          />
        }
      />
      <Sheet
        visible={!!sel}
        onClose={() => setSel(null)}
        title={sel ? chatTitle(sel, me.id, db) : ''}
        options={
          sel
            ? [
                ...(sel.type === 'direct' && chatPeer(sel, me.id, db)
                  ? [
                      { icon: 'person-circle' as const, label: 'Lihat profil kontak', onPress: () => nav.navigate('UserProfile', { userId: chatPeer(sel, me.id, db)!.id }) },
                      ...(me.contacts.includes(chatPeer(sel, me.id, db)!.id) ? [{ icon: 'person-remove' as const, label: 'Hapus kontak', danger: true, onPress: () => setAsk({ kind: 'remove', chat: sel }) }] : []),
                      { icon: 'ban' as const, label: me.blocked.includes(chatPeer(sel, me.id, db)!.id) ? 'Buka blokir kontak' : 'Blokir kontak', danger: true, onPress: () => (me.blocked.includes(chatPeer(sel, me.id, db)!.id) ? toggleBlock(chatPeer(sel, me.id, db)!.id) : setAsk({ kind: 'block', chat: sel })) },
                    ]
                  : []),
                { icon: 'pin', label: sel.pinnedBy.includes(me.id) ? 'Lepas sematan' : 'Sematkan chat', onPress: () => toggleChatFlag(sel.id, 'pinnedBy') },
                { icon: sel.mutedBy.includes(me.id) ? 'volume-high' : 'volume-mute', label: sel.mutedBy.includes(me.id) ? 'Bunyikan notifikasi' : 'Bisukan notifikasi', onPress: () => toggleChatFlag(sel.id, 'mutedBy') },
                { icon: 'archive', label: sel.archivedBy.includes(me.id) ? 'Keluarkan dari arsip' : 'Arsipkan chat', onPress: () => toggleChatFlag(sel.id, 'archivedBy') },
                { icon: 'checkmark-done', label: 'Tandai sudah dibaca', onPress: () => markRead(sel.id) },
                { icon: 'trash', label: sel.type === 'group' ? 'Keluar & hapus grup' : 'Hapus chat', danger: true, onPress: () => setAsk({ kind: 'delete', chat: sel }) },
              ]
            : []
        }
      />
      <Confirm
        visible={!!ask}
        title={ask ? (ask.kind === 'delete' ? `Hapus chat "${chatTitle(ask.chat, me.id, db)}"?` : ask.kind === 'remove' ? `Hapus ${chatTitle(ask.chat, me.id, db)} dari kontak?` : `Blokir ${chatTitle(ask.chat, me.id, db)}?`) : ''}
        body={ask?.kind === 'delete' ? 'Semua pesan di chat ini akan dihapus dari perangkatmu.' : ask?.kind === 'remove' ? 'Kontak dihapus. Kamu bisa menambahkannya lagi lewat @username.' : 'Kontak yang diblokir tidak bisa mengirim pesan atau menelepon.'}
        confirm={ask?.kind === 'delete' ? 'Hapus chat' : ask?.kind === 'remove' ? 'Hapus kontak' : 'Blokir'}
        danger
        onConfirm={() => {
          if (!ask) return;
          const peer = chatPeer(ask.chat, me.id, db);
          if (ask.kind === 'delete') deleteChat(ask.chat.id);
          else if (ask.kind === 'remove' && peer) removeContact(peer.id);
          else if (ask.kind === 'block' && peer) toggleBlock(peer.id);
        }}
        onClose={() => setAsk(null)}
      />
    </View>
  );
}
