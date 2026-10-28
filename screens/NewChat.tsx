import React, { useMemo, useState } from 'react';
import { View, FlatList, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Header, Screen, NeuInput, Avatar, T, Row, Empty, IconBtn, Neu, UserBadges, Btn } from '../components/ui';
import { useTheme, R } from '../lib/theme';
import { useStore, openDirect, isOnline, canSee, addContact, findByUsername, joinByInvite } from '../lib/store';
import { pushBanner } from '../lib/bus';
import { placeCall } from './tabs/CallsTab';
import { User } from '../lib/types';

export default function NewChat() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const callMode = route.params?.mode === 'call';
  const { db, me } = useStore();
  const [q, setQ] = useState('');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const users = useMemo(() => {
    const s = q.toLowerCase().trim();
    return Object.values(db.users)
      .filter((u) => u.id !== me?.id && !u.banned)
      .filter((u) => (s ? u.name.toLowerCase().includes(s) || u.email.includes(s) || (u.username ?? '').includes(s.replace(/^@/, '')) : me?.contacts.includes(u.id)))
      .sort((a, b) => Number(!!me?.contacts.includes(b.id)) - Number(!!me?.contacts.includes(a.id)) || a.name.localeCompare(b.name));
  }, [db, me, q]);
  if (!me) return null;

  const render = ({ item: u }: { item: User }) => (
    <Pressable
      onPress={() => {
        const id = openDirect(u.id);
        if (!callMode) nav.replace('ChatRoom', { chatId: id });
      }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, marginHorizontal: 14, borderRadius: R.lg, boxShadow: pressed ? t.insetSm : undefined } as any)}
    >
      <Avatar uri={canSee(me, u, u.privacy.profilePhoto) ? u.avatar : null} name={u.name} color={u.color} size={48} online={isOnline(u) && canSee(me, u, u.privacy.lastSeen)} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <T v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
            {u.name}
          </T>
          <UserBadges user={u} />
        </View>
        <T v="sub" numberOfLines={1}>
          {u.username ? `@${u.username} · ` : ''}
          {canSee(me, u, u.privacy.about) ? u.about : u.email}
        </T>
      </View>
      {callMode ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <IconBtn icon="call" size={38} color={t.accent} onPress={() => placeCall(nav, openDirect(u.id), false)} />
          <IconBtn icon="videocam" size={38} color={t.accent} onPress={() => placeCall(nav, openDirect(u.id), true)} />
        </View>
      ) : (
        me.contacts.includes(u.id) ? (
          <Ionicons name="person" size={16} color={t.faint} />
        ) : (
          <IconBtn icon="person-add" size={38} color={t.accent} label="Tambah kontak" onPress={() => (addContact(u.id), pushBanner({ title: 'Kontak ditambahkan', body: `${u.name} (@${u.username ?? ''})`, icon: 'person-add' }))} />
        )
      )}
    </Pressable>
  );

  return (
    <Screen>
      <Header title={callMode ? 'Panggilan baru' : 'Chat baru'} subtitle={`${users.length} pengguna`} />
      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        renderItem={render}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 30, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: 18, gap: 16, marginBottom: 10 }}>
            <NeuInput icon="search" placeholder="Cari nama, email, atau @username" value={q} onChangeText={setQ} autoCapitalize="none" returnKeyType="search" />
            {!callMode && (
              <Neu radius={R.lg} style={{ padding: 4 }}>
                <Row icon="people" title="Grup baru" subtitle="Ngobrol bareng hingga 256 anggota" onPress={() => nav.replace('NewGroup', { type: 'group' })} />
                <Row icon="megaphone" title="Saluran baru" subtitle="Siarkan ke pengikut" onPress={() => nav.replace('NewGroup', { type: 'channel' })} />
                <Row icon="aperture" title="SW / Story baru" subtitle="Bagikan status 24 jam" onPress={() => nav.replace('StoryCreate', { mode: 'image' })} />
              </Neu>
            )}
            {!callMode && (
              <Neu radius={R.lg} style={{ padding: 14, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="link" size={17} color={t.accent} />
                  <T v="sub" style={{ fontWeight: '700' }}>Gabung pakai kode undangan</T>
                </View>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <NeuInput
                    placeholder="Tempel kode di sini…"
                    value={code}
                    onChangeText={(v: string) => setCode(v.trim().toLowerCase())}
                    autoCapitalize="none"
                    maxLength={16}
                    containerStyle={{ flex: 1, minHeight: 48 }}
                  />
                  <Btn
                    small
                    variant="primary"
                    icon="enter"
                    title="Gabung"
                    disabled={!code || joining}
                    loading={joining}
                    onPress={async () => {
                      setJoining(true);
                      const r = await joinByInvite(code);
                      setJoining(false);
                      if (r.ok && r.chatId) {
                        pushBanner({ title: 'Berhasil bergabung', body: 'Selamat datang!', icon: 'checkmark-circle' });
                        nav.replace('ChatRoom', { chatId: r.chatId });
                      } else {
                        pushBanner({ title: 'Gagal bergabung', body: r.error ?? 'Kode tidak valid.', icon: 'alert' });
                      }
                    }}
                  />
                </View>
              </Neu>
            )}
            {q.trim().startsWith('@') && findByUsername(q) && !me.contacts.includes(findByUsername(q)!.id) && (
              <Btn small icon="person-add" title={`Tambah @${findByUsername(q)!.username} ke kontak`} onPress={() => (addContact(findByUsername(q)!.id), pushBanner({ title: 'Kontak ditambahkan', body: findByUsername(q)!.name, icon: 'person-add' }))} />
            )}
            <T v="label" style={{ marginLeft: 6, marginTop: 6 }}>
              {q.trim() ? 'Hasil pencarian' : `Kontak saya · cari @username untuk menambah`}
            </T>
          </View>
        }
        ListEmptyComponent={<Empty icon="person-outline" title={q ? 'Tidak ditemukan' : 'Belum ada kontak'} body={q ? 'Coba kata kunci lain.' : 'Ketik @username teman untuk menambahkannya.'} />}
      />
    </Screen>
  );
}
