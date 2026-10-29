import React, { useEffect, useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, IconBtn, Avatar, Empty, Neu, Btn, UserBadges } from '../../components/ui';
import { Confirm } from '../../components/Sheet';
import { useTheme, R } from '../../lib/theme';
import { useStore, startCall, chatTitle, chatPeer, markCallsSeen, chatBadge, deleteCallHistory, clearCallHistory } from '../../lib/store';
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
  // mode seleksi: tekan lama baris → pilih beberapa → hapus terpilih; ikon tempah → hapus semua
  const [selMode, setSelMode] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<null | 'all' | 'sel'>(null);

  // REAL-TIME: begitu tab dibuka, badge panggilan hilang (missed call dianggap terbaca)
  useEffect(() => { markCallsSeen(); }, []);

  const calls = useMemo(() => {
    if (!me) return [];
    let l = db.calls.filter(
      (c) => c.id !== '_schema' && !(c.hiddenFor ?? []).includes(me.id) && (c.callerId === me.id || c.calleeIds.includes(me.id))
    );
    if (filter === 'missed') l = l.filter((c) => (c.status === 'missed' || c.status === 'declined') && c.callerId !== me.id);
    return l.sort((a, b) => b.startedAt - a.startedAt);
  }, [db, me, filter]);

  // keluar dari mode seleksi otomatis bila daftar kosong / pilihan tidak valid
  useEffect(() => {
    if (selMode && !calls.length) { setSelMode(false); setSel([]); }
    if (sel.length && !calls.some((c) => sel.includes(c.id))) setSel((s) => s.filter((id) => calls.some((c) => c.id === id)));
  }, [calls, selMode, sel.length]);

  if (!me) return null;

  const toggleSel = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const doDeleteSel = () => {
    deleteCallHistory(sel);
    setSel([]); setSelMode(false); setConfirm(null);
  };
  const doDeleteAll = () => {
    clearCallHistory();
    setSel([]); setSelMode(false); setConfirm(null);
  };

  const render = ({ item }: { item: Call }) => {
    const chat = db.chats[item.chatId];
    if (!chat) return null;
    const outgoing = item.callerId === me.id;
    const peer = chatPeer(chat, me.id, db);
    const title = chatTitle(chat, me.id, db);
    const bad = item.status === 'missed' || item.status === 'declined';
    const dur = item.connectedAt && item.endedAt ? duration((item.endedAt - item.connectedAt) / 1000) : null;
    const checked = sel.includes(item.id);
    return (
      <Pressable
        onPress={() => (selMode ? toggleSel(item.id) : nav.navigate('ChatInfo', { chatId: chat.id }))}
        onLongPress={() => { setSelMode(true); setSel((s) => (s.includes(item.id) ? s : [...s, item.id])); }}
        delayLongPress={280}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginHorizontal: 14, marginVertical: 4, borderRadius: R.lg, backgroundColor: selMode && checked ? t.accentSoft : undefined, boxShadow: pressed ? t.insetSm : undefined } as any)}
      >
        {/* kotak centang mode seleksi (ala WhatsApp) */}
        {selMode ? (
          <Ionicons name={checked ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={checked ? t.accent : t.faint} />
        ) : null}
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
        {!selMode && <IconBtn icon={item.video ? 'videocam' : 'call'} color={t.accent} size={42} onPress={() => placeCall(nav, chat.id, item.video)} />}
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {selMode ? (
          <>
            <IconBtn icon="close" onPress={() => { setSelMode(false); setSel([]); }} label="Keluar mode pilih" />
            <T v="h2" style={{ flex: 1 }}>{sel.length ? `${sel.length} dipilih` : 'Pilih riwayat'}</T>
            <IconBtn
              icon={sel.length === calls.length && calls.length > 0 ? 'checkbox' : 'square-outline'}
              onPress={() => setSel(sel.length === calls.length ? [] : calls.map((c) => c.id))}
              label="Pilih semua"
            />
            <IconBtn icon="trash" color={t.danger} onPress={() => sel.length && setConfirm('sel')} label="Hapus terpilih" />
          </>
        ) : (
          <>
            <T v="h1" style={{ flex: 1 }}>Panggilan</T>
            <IconBtn icon="trash-outline" color={t.danger} onPress={() => calls.length && setConfirm('all')} label="Hapus semua riwayat" />
            <IconBtn icon={filter === 'missed' ? 'funnel' : 'funnel-outline'} active={filter === 'missed'} onPress={() => setFilter(filter === 'all' ? 'missed' : 'all')} label="Filter tak terjawab" />
            <IconBtn icon="add-circle-outline" color={t.accent} onPress={() => nav.navigate('NewChat', { mode: 'call' })} label="Panggilan baru" />
          </>
        )}
      </View>
      <FlatList
        data={calls}
        keyExtractor={(c) => c.id}
        renderItem={render}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), setTimeout(() => setRefreshing(false), 700))} tintColor={t.accent} colors={[t.accent]} />}
        contentContainerStyle={{ paddingBottom: 24, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          calls.length > 0 ? (
            <View style={{ paddingHorizontal: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'center' }}>
              <T v="label" style={{ marginLeft: 6, flex: 1 }}>Terbaru</T>
              {!selMode && <T v="caption" color={t.faint}>tekan lama untuk pilih</T>}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Empty
            icon={selMode ? 'checkmark-done-circle-outline' : filter === 'missed' ? 'call-outline' : 'call-outline'}
            title={selMode ? 'Tidak ada yang bisa dipilih' : filter === 'missed' ? 'Tidak ada panggilan tak terjawab' : 'Belum ada riwayat panggilan'}
            body={selMode ? 'Keluar dari mode pilih dengan tombol × di atas.' : 'Mulai voice atau video call dari halaman chat atau tombol + di atas.'}
          />
        }
        ListFooterComponent={
          !selMode && calls.length > 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <Btn small variant="ghost" icon="trash" title="Hapus semua riwayat" onPress={() => setConfirm('all')} />
            </View>
          ) : null
        }
      />

      <Confirm
        visible={confirm === 'all'}
        title="Hapus semua riwayat panggilan?"
        body="Semua riwayat panggilan (masuk, keluar, tak terjawab) akan dihapus dari daftarmu. Riwayat di pihak lain tidak terhapus."
        confirm="Hapus semua"
        danger
        onConfirm={doDeleteAll}
        onClose={() => setConfirm(null)}
      />
      <Confirm
        visible={confirm === 'sel'}
        title={`Hapus ${sel.length} riwayat terpilih?`}
        body="Riwayat panggilan yang dipilih akan dihapus dari daftarmu."
        confirm="Hapus"
        danger
        onConfirm={doDeleteSel}
        onClose={() => setConfirm(null)}
      />
    </View>
  );
}
