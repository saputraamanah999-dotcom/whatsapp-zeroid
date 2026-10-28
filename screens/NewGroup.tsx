import React, { useMemo, useState } from 'react';
import { View, FlatList, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Header, Screen, NeuInput, Avatar, T, Btn, Neu } from '../components/ui';
import { useTheme, R } from '../lib/theme';
import { useStore, createGroup } from '../lib/store';
import { pickGallery, uploadToStorage } from '../lib/media';

export default function NewGroup() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const type: 'group' | 'channel' = route.params?.type === 'channel' ? 'channel' : 'group';
  const { db, me } = useStore();
  const [step, setStep] = useState<1 | 2>(type === 'channel' ? 2 : 1);
  const [sel, setSel] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const users = useMemo(() => Object.values(db.users).filter((u) => u.id !== me?.id && !u.banned).sort((a, b) => a.name.localeCompare(b.name)), [db, me]);
  if (!me) return null;

  const create = async () => {
    if (name.trim().length < 2) return setErr('Nama minimal 2 karakter.');
    const av = avatar ? (await uploadToStorage(avatar, `groups/${Date.now()}_avatar.jpg`, 'image/jpeg')).url : null;
    const id = createGroup(name, sel, desc.trim(), av, type);
    nav.replace('ChatRoom', { chatId: id });
  };

  if (step === 1)
    return (
      <Screen>
        <Header title="Tambah anggota" subtitle={`${sel.length} dipilih`} right={<Btn small title="Lanjut" disabled={!sel.length} onPress={() => setStep(2)} />} />
        {sel.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 18, paddingVertical: 8 }}>
            {sel.map((id) => (
              <Pressable key={id} onPress={() => setSel(sel.filter((x) => x !== id))} style={{ alignItems: 'center', width: 60 }}>
                <Avatar uri={db.users[id].avatar} name={db.users[id].name} color={db.users[id].color} size={50} />
                <View style={{ position: 'absolute', right: 2, top: 0, backgroundColor: t.sub, borderRadius: 9 }}>
                  <Ionicons name="close" size={14} color="#fff" />
                </View>
                <T v="caption" numberOfLines={1}>
                  {db.users[id].name.split(' ')[0]}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        )}
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: 30, maxWidth: 720, width: '100%', alignSelf: 'center' }}
          renderItem={({ item: u }) => {
            const on = sel.includes(u.id);
            const disallowed = u.privacy.groups === 'nobody' || (u.privacy.groups === 'contacts' && !u.contacts.includes(me.id));
            return (
              <Pressable disabled={disallowed} onPress={() => setSel(on ? sel.filter((x) => x !== u.id) : [...sel, u.id])} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, marginHorizontal: 14, borderRadius: R.lg, opacity: disallowed ? 0.45 : 1, boxShadow: pressed ? t.insetSm : undefined } as any)}>
                <Avatar uri={u.avatar} name={u.name} color={u.color} size={46} />
                <View style={{ flex: 1 }}>
                  <T v="h3">{u.name}</T>
                  <T v="sub" numberOfLines={1}>
                    {disallowed ? 'Privasi: tidak bisa ditambahkan ke grup' : u.about}
                  </T>
                </View>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={26} color={on ? t.accent : t.faint} />
              </Pressable>
            );
          }}
        />
      </Screen>
    );

  return (
    <Screen>
      <Header title={type === 'group' ? 'Grup baru' : 'Channel baru'} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 560, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={async () => setAvatar((await pickGallery('images'))?.uri ?? avatar)} style={{ alignSelf: 'center' }}>
          <Neu radius={60} style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {avatar ? <Avatar uri={avatar} name={name || 'G'} size={120} /> : <Ionicons name="camera" size={36} color={t.accent} />}
          </Neu>
          <T v="caption" color={t.accent} style={{ textAlign: 'center', marginTop: 8, fontWeight: '600' }}>
            {avatar ? 'Ganti foto' : 'Tambah foto'}
          </T>
        </Pressable>
        <NeuInput icon={type === 'group' ? 'people' : 'megaphone'} placeholder={type === 'group' ? 'Nama grup' : 'Nama channel'} value={name} onChangeText={setName} maxLength={50} returnKeyType="next" />
        <NeuInput icon="document-text" placeholder="Deskripsi (opsional)" value={desc} onChangeText={setDesc} multiline maxLength={300} />
        {type === 'group' && (
          <View>
            <T v="label" style={{ marginLeft: 6, marginBottom: 10 }}>
              Anggota · {sel.length + 1}
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              {[me.id, ...sel].map((id) => (
                <View key={id} style={{ alignItems: 'center', width: 60 }}>
                  <Avatar uri={db.users[id].avatar} name={db.users[id].name} color={db.users[id].color} size={48} />
                  <T v="caption" numberOfLines={1}>
                    {id === me.id ? 'Kamu' : db.users[id].name.split(' ')[0]}
                  </T>
                </View>
              ))}
            </View>
          </View>
        )}
        {!!err && (
          <T v="sub" color={t.danger}>
            {err}
          </T>
        )}
        <Btn title={type === 'group' ? 'Buat grup' : 'Buat channel'} icon="checkmark" onPress={create} />
        {type === 'group' && <Btn title="Ubah anggota" variant="neu" onPress={() => setStep(1)} />}
      </ScrollView>
    </Screen>
  );
}
