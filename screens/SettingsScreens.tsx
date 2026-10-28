import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable, FlatList, RefreshControl, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { Header, Screen, Avatar, T, Neu, Row, Card, Toggle, NeuInput, Btn, Empty, Segmented, IconBtn } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { useTheme, R } from '../lib/theme';
import { useStore, updateMe, changePassword, toggleBlock, markNotificationsRead, clearNotifications, messagePreview, chatTitle, sendVerification, toggleStar } from '../lib/store';
import { Visibility, Privacy, NotifPrefs } from '../lib/types';
import { pickCamera, pickGallery, pickVideo, uploadMedia, uploadMediaDirect, MediaError } from '../lib/media';
import BannerMedia from '../components/BannerMedia';
import { pushBanner } from '../lib/bus';
import { ago, chatTime } from '../lib/format';
import { getPermission, ensurePermission, PERM_INFO, PermKind, PermState, openAppSettings } from '../lib/permissions';
import { registerPushToken } from '../lib/notify';

// ---------------- Edit profile ----------------
export function EditProfile() {
  const t = useTheme();
  const { me } = useStore();
  const [name, setName] = useState(me?.name ?? '');
  const [about, setAbout] = useState(me?.about ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [photoSheet, setPhotoSheet] = useState(false);
  const [bannerSheet, setBannerSheet] = useState(false);
  const [busyMedia, setBusyMedia] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  if (!me) return null;

  const setPhoto = async (cam: boolean) => {
    const p = cam ? await pickCamera() : await pickGallery('images');
    if (!p) return;
    setBusyMedia(true);
    try {
      const r = await uploadMedia(p.uri, `avatars/${me.id}/${Date.now()}.jpg`, 'image/jpeg');
      updateMe({ avatar: r.url });
      pushBanner({ title: 'Foto profil diperbarui', body: 'Foto baru sudah tersimpan.', icon: 'checkmark-circle' });
    } catch (e: any) {
      pushBanner({ title: 'Unggah foto gagal', body: e?.message ?? 'Coba lagi.', icon: 'alert' });
    } finally {
      setBusyMedia(false);
    }
  };

  const setBanner = async (video = false) => {
    const p = video ? await pickVideo() : await pickGallery('images');
    if (!p) return;
    setBusyMedia(true);
    try {
      if (video) {
        // video: > 3.2 MB lewat unggahan langsung (host CORS), kecil lewat proxy
        const size = p.size ?? 0;
        const r = size > 3.2 * 1024 * 1024
          ? await uploadMediaDirect(p.uri, (p.name ?? 'banner') .replace(/[^\w.-]/g, '_'), p.mime ?? 'video/mp4')
          : await uploadMedia(p.uri, `banners/${me.id}/${Date.now()}.mp4`, p.mime ?? 'video/mp4');
        updateMe({ banner: r.url, bannerType: 'video' });
      } else {
        const r = await uploadMedia(p.uri, `banners/${me.id}/${Date.now()}.jpg`, 'image/jpeg');
        updateMe({ banner: r.url, bannerType: 'image' });
      }
      pushBanner({ title: 'Banner diperbarui', body: video ? 'Banner video aktif — diputar berulang otomatis.' : 'Banner profil sudah tersimpan.', icon: 'checkmark-circle' });
    } catch (e: any) {
      pushBanner({ title: 'Unggah banner gagal', body: e?.message ?? 'Coba lagi.', icon: 'alert' });
    } finally {
      setBusyMedia(false);
    }
  };

  const save = () => {
    if (name.trim().length < 2) return pushBanner({ title: 'Nama terlalu pendek', body: 'Minimal 2 karakter', icon: 'alert-circle' });
    updateMe({ name: name.trim(), about: about.trim() || 'Hai! Aku pakai Zeroid-whatsapp.', phone: phone.trim() || undefined });
    pushBanner({ title: 'Profil disimpan', body: 'Perubahan berhasil diterapkan', icon: 'checkmark-circle' });
  };

  return (
    <Screen>
      <Header title="Edit profil" right={<Btn small title="Simpan" onPress={save} />} />
      <ScrollView contentContainerStyle={{ padding: 20, gap: 18, maxWidth: 560, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setBannerSheet(true)} disabled={busyMedia} style={({ pressed }) => ({ height: 116, borderRadius: R.lg, overflow: 'hidden', backgroundColor: t.bg2, opacity: pressed ? 0.9 : 1 })} accessibilityLabel="Ganti banner profil">
          {me.banner ? (
            <BannerMedia uri={me.banner} video={me.bannerType === 'video'} height={116} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Ionicons name="image-outline" size={22} color={t.sub} />
              <T v="caption" color={t.sub}>Ketuk untuk pasang banner profil</T>
            </View>
          )}
          <View style={{ position: 'absolute', right: 10, bottom: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="camera" size={16} color="#fff" />
          </View>
        </Pressable>
        <Pressable onPress={() => setPhotoSheet(true)} disabled={busyMedia} style={{ alignSelf: 'center' }}>
          <Avatar uri={me.avatar} name={me.name} color={me.color} size={130} />
          <View style={{ position: 'absolute', right: 4, bottom: 4, width: 40, height: 40, borderRadius: 20, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: t.bg }}>
            <Ionicons name="camera" size={19} color="#fff" />
          </View>
        </Pressable>
        <T v="label" style={{ marginLeft: 6 }}>
          Nama tampilan
        </T>
        <NeuInput icon="person" value={name} onChangeText={setName} placeholder="Nama" maxLength={40} />
        <T v="label" style={{ marginLeft: 6 }}>
          Info
        </T>
        <NeuInput icon="information-circle" value={about} onChangeText={setAbout} placeholder="Info" maxLength={140} />
        <T v="label" style={{ marginLeft: 6 }}>
          Telepon (opsional)
        </T>
        <NeuInput icon="call" value={phone} onChangeText={setPhone} placeholder="+62…" keyboardType="phone-pad" maxLength={20} />
        <Card title="Keamanan akun">
          <Row icon="mail" title={me.email} subtitle={me.verified ? 'Email terverifikasi' : 'Belum diverifikasi — ketuk untuk kirim ulang'} right={<Ionicons name={me.verified ? 'checkmark-circle' : 'alert-circle'} size={20} color={me.verified ? t.success : t.warning} />} onPress={me.verified ? undefined : sendVerification} />
          <Row icon="key" title="Ganti password" onPress={() => (setOldPw(''), setNewPw(''), setPwErr(''), setPwOpen(true))} />
        </Card>
      </ScrollView>
      <Sheet
        visible={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Foto profil"
        options={[
          { icon: 'camera', label: 'Ambil foto', onPress: () => setPhoto(true) },
          { icon: 'images', label: 'Pilih dari galeri', onPress: () => setPhoto(false) },
          ...(me.avatar ? [{ icon: 'trash' as const, label: 'Hapus foto', danger: true, onPress: () => updateMe({ avatar: null }) }] : []),
        ]}
      />
      <Sheet
        visible={bannerSheet}
        onClose={() => setBannerSheet(false)}
        title="Banner profil"
        options={[
          { icon: 'images', label: 'Foto dari galeri', onPress: () => setBanner(false) },
          { icon: 'videocam', label: 'Video loop dari galeri', color: '#7B61FF', onPress: () => setBanner(true) },
          ...(me.banner ? [{ icon: 'trash' as const, label: 'Hapus banner', danger: true, onPress: () => updateMe({ banner: null, bannerType: undefined }) }] : []),
        ]}
      />
      <Sheet visible={pwOpen} onClose={() => setPwOpen(false)} title="Ganti password">
        <View style={{ gap: 14 }}>
          <NeuInput icon="lock-closed" placeholder="Password lama" secureTextEntry value={oldPw} onChangeText={setOldPw} />
          <NeuInput icon="lock-open" placeholder="Password baru (min. 6)" secureTextEntry value={newPw} onChangeText={setNewPw} />
          {!!pwErr && (
            <T v="sub" color={t.danger}>
              {pwErr}
            </T>
          )}
          <Btn
            title="Simpan password"
            onPress={async () => {
              const r = await changePassword(oldPw, newPw);
              if (!r.ok) return setPwErr(r.error ?? 'Gagal');
              setPwOpen(false);
              pushBanner({ title: 'Password diganti', body: 'Gunakan password baru saat masuk berikutnya.', icon: 'key' });
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

// ---------------- Privacy ----------------
const VIS: { value: Visibility; label: string }[] = [
  { value: 'everyone', label: 'Semua' },
  { value: 'contacts', label: 'Kontak' },
  { value: 'nobody', label: 'Tidak ada' },
];

export function PrivacyScreen() {
  const { db, me } = useStore();
  const t = useTheme();
  if (!me) return null;
  const p = me.privacy;
  const set = (patch: Partial<Privacy>) => updateMe({ privacy: { ...p, ...patch } });
  const item = (key: 'lastSeen' | 'profilePhoto' | 'about' | 'groups', title: string, icon: React.ComponentProps<typeof Ionicons>['name']) => (
    <View style={{ padding: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={icon} size={18} color={t.accent} />
        <T v="body" style={{ fontWeight: '500' }}>
          {title}
        </T>
      </View>
      <Segmented value={p[key]} options={VIS} onChange={(v) => set({ [key]: v } as Partial<Privacy>)} />
    </View>
  );
  return (
    <Screen>
      <Header title="Privasi" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Card title="Siapa yang dapat melihat">
          {item('lastSeen', 'Terakhir dilihat & online', 'time')}
          {item('profilePhoto', 'Foto profil', 'person-circle')}
          {item('about', 'Info', 'information-circle')}
        </Card>
        <Card title="Interaksi">
          {item('groups', 'Siapa yang dapat menambahkan ke grup', 'people')}
          <Row icon="checkmark-done" title="Tanda dibaca" subtitle="Jika dimatikan, kamu juga tidak melihat tanda dibaca orang lain" right={<Toggle value={p.readReceipts} onChange={(v) => set({ readReceipts: v })} />} />
          <Row icon="chatbubble-ellipses" title="Izinkan balasan Story" right={<Toggle value={p.storyReplies} onChange={(v) => set({ storyReplies: v })} />} />
        </Card>
        <Card title={`Kontak diblokir · ${me.blocked.length}`}>
          {me.blocked.length === 0 && (
            <T v="sub" style={{ padding: 12 }}>
              Tidak ada kontak yang diblokir.
            </T>
          )}
          {me.blocked.map((id) => {
            const u = db.users[id];
            if (!u) return null;
            return (
              <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
                <Avatar uri={u.avatar} name={u.name} color={u.color} size={40} />
                <T v="body" style={{ flex: 1 }}>
                  {u.name}
                </T>
                <Btn small variant="neu" title="Buka" onPress={() => toggleBlock(id)} />
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ---------------- Notification settings ----------------
export function NotifSettings() {
  const { me } = useStore();
  const nav = useNavigation<any>();
  if (!me) return null;
  const n = me.notif;
  const set = (patch: Partial<NotifPrefs>) => updateMe({ notif: { ...n, ...patch } });
  return (
    <Screen>
      <Header title="Notifikasi" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Card title="Event">
          <Row icon="chatbubble" title="Pesan pribadi" right={<Toggle value={n.messages} onChange={(v) => set({ messages: v })} />} />
          <Row icon="people" title="Grup" right={<Toggle value={n.groups} onChange={(v) => set({ groups: v })} />} />
          <Row icon="aperture" title="Story baru & aktivitas Story" right={<Toggle value={n.stories} onChange={(v) => set({ stories: v })} />} />
          <Row icon="call" title="Panggilan tak terjawab" right={<Toggle value={n.calls} onChange={(v) => set({ calls: v })} />} />
        </Card>
        <Card title="Tampilan">
          <Row icon="eye" title="Pratinjau pesan" subtitle="Tampilkan isi pesan di notifikasi" right={<Toggle value={n.preview} onChange={(v) => set({ preview: v })} />} />
          <Row icon="musical-note" title="Suara" right={<Toggle value={n.sound} onChange={(v) => set({ sound: v })} />} />
        </Card>
        <Card title="Sistem">
          <Row icon="key" title="Izin notifikasi perangkat" subtitle="POST_NOTIFICATIONS (Android 13+)" onPress={() => nav.navigate('Permissions')} />
          <Row
            icon="cloud-upload"
            title="Daftarkan token FCM"
            subtitle="Diperlukan agar panggilan masuk berdering saat aplikasi tertutup"
            onPress={async () => {
              const ok = await ensurePermission('notifications');
              if (!ok) return;
              const tok = await registerPushToken(me.id);
              pushBanner({ title: tok ? 'Token FCM terdaftar' : 'Token tidak tersedia', body: tok ? `${tok.slice(0, 24)}…` : Platform.OS === 'web' ? 'FCM native hanya di Android build.' : 'Periksa google-services.json.', icon: 'cloud-done' });
            }}
          />
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ---------------- Permission manager screen ----------------
export function PermissionsScreen() {
  const t = useTheme();
  const kinds: PermKind[] = ['notifications', 'microphone', 'camera', 'media'];
  const [st, setSt] = useState<Record<string, PermState>>({});
  const refresh = useCallback(async () => {
    const out: Record<string, PermState> = {};
    for (const k of kinds) out[k] = await getPermission(k);
    setSt(out);
  }, []);
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );
  const label = (s?: PermState) => (s === 'granted' ? 'Diizinkan' : s === 'blocked' ? 'Ditolak permanen' : s === 'denied' ? 'Ditolak' : s === 'unavailable' ? 'Tidak tersedia' : 'Belum diminta');
  const color = (s?: PermState) => (s === 'granted' ? t.success : s === 'blocked' || s === 'denied' ? t.danger : t.warning);
  return (
    <Screen>
      <Header title="Izin aplikasi" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Neu radius={R.lg} style={{ padding: 16, marginBottom: 22, flexDirection: 'row', gap: 12 }}>
          <Ionicons name="shield-checkmark" size={24} color={t.accent} />
          <T v="sub" style={{ flex: 1, lineHeight: 20 }}>
            Zeroid hanya meminta izin saat fitur terkait digunakan. Penjelasan ditampilkan terlebih dahulu sebelum popup sistem Android muncul.
          </T>
        </Neu>
        <Card title="Izin sensitif">
          {kinds.map((k) => (
            <View key={k} style={{ padding: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Neu small radius={14} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={PERM_INFO[k].icon as any} size={20} color={t.accent} />
                </Neu>
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ fontWeight: '600' }}>
                    {PERM_INFO[k].title}
                  </T>
                  <T v="caption">{PERM_INFO[k].why}</T>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 54 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color(st[k]) }} />
                <T v="caption" color={color(st[k])} style={{ flex: 1, fontWeight: '600' }}>
                  {label(st[k])}
                </T>
                {st[k] !== 'granted' && st[k] !== 'unavailable' && <Btn small title={st[k] === 'blocked' ? 'Pengaturan' : 'Izinkan'} onPress={async () => (st[k] === 'blocked' && Platform.OS !== 'web' ? openAppSettings() : await ensurePermission(k), refresh())} style={{ height: 36 }} />}
              </View>
            </View>
          ))}
        </Card>
        <Card title="Android (khusus panggilan)">
          <Row icon="phone-portrait" title="USE_FULL_SCREEN_INTENT" subtitle="Layar panggilan masuk saat perangkat terkunci (Android 14+: dapat dicabut di Pengaturan)" chevron={false} />
          <Row icon="pulse" title="FOREGROUND_SERVICE_PHONE_CALL" subtitle="Menjaga panggilan aktif di latar belakang" chevron={false} />
          <Row icon="settings" title="Buka pengaturan aplikasi" onPress={openAppSettings} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ---------------- Notification center ----------------
export function NotificationsScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { db, me } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const list = useMemo(() => db.notifications.filter((n) => n.userId === me?.id), [db, me]);
  useEffect(() => {
    const id = setTimeout(markNotificationsRead, 1500);
    return () => clearTimeout(id);
  }, []);
  if (!me) return null;
  const icon = (k: string) => (k === 'story' ? 'aperture' : k === 'call' ? 'call' : k === 'group' ? 'people' : k === 'message' ? 'chatbubble' : 'megaphone');
  return (
    <Screen>
      <Header title="Notifikasi" right={list.length ? <Btn small variant="neu" title="Bersihkan" onPress={clearNotifications} /> : undefined} />
      <FlatList
        data={list}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => (setRefreshing(true), setTimeout(() => setRefreshing(false), 600))} tintColor={t.accent} colors={[t.accent]} />}
        contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        renderItem={({ item: n }) => (
          <Pressable
            onPress={() => (n.chatId ? nav.navigate('ChatRoom', { chatId: n.chatId }) : n.storyUserId ? nav.navigate('StoryViewer', { userId: n.storyUserId }) : undefined)}
            style={({ pressed }) => ({ flexDirection: 'row', gap: 14, padding: 14, marginBottom: 10, borderRadius: R.lg, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm } as any)}
          >
            <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: n.read ? t.accentSoft : t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={icon(n.kind) as any} size={20} color={n.read ? t.accent : '#fff'} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="h3" style={{ fontSize: 15 }}>
                {n.title}
              </T>
              <T v="sub">{n.body}</T>
              <T v="caption" color={t.faint} style={{ marginTop: 4 }}>
                {ago(n.createdAt)}
              </T>
            </View>
            {!n.read && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t.accent, marginTop: 6 }} />}
          </Pressable>
        )}
        ListEmptyComponent={<Empty icon="notifications-off-outline" title="Tidak ada notifikasi" body="Aktivitas Story, grup, panggilan tak terjawab, dan pengumuman akan muncul di sini." />}
      />
    </Screen>
  );
}

// ---------------- Starred ----------------
export function StarredScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { db, me } = useStore();
  const list = useMemo(() => {
    const out = [];
    for (const [cid, arr] of Object.entries(db.messages)) {
      if (params?.chatId && cid !== params.chatId) continue;
      for (const m of arr) if (me && m.starredBy.includes(me.id) && !m.deletedFor.includes(me.id)) out.push(m);
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }, [db, me, params?.chatId]);
  if (!me) return null;
  return (
    <Screen>
      <Header title="Pesan berbintang" subtitle={`${list.length} pesan`} />
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        renderItem={({ item: m }) => {
          const chat = db.chats[m.chatId];
          const u = db.users[m.senderId];
          return (
            <Pressable onPress={() => nav.navigate('ChatRoom', { chatId: m.chatId })} style={({ pressed }) => ({ padding: 14, marginBottom: 10, borderRadius: R.lg, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm, gap: 6 } as any)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Avatar uri={u?.avatar} name={u?.name ?? '?'} color={u?.color} size={26} />
                <T v="caption" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
                  {m.senderId === me.id ? 'Kamu' : u?.name} → {chat ? chatTitle(chat, me.id, db) : ''}
                </T>
                <T v="caption" color={t.faint}>
                  {chatTime(m.createdAt)}
                </T>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <Ionicons name="star" size={14} color={t.warning} style={{ marginTop: 3 }} />
                <T v="body" style={{ flex: 1 }}>
                  {messagePreview(m)}
                </T>
                <IconBtn icon="star" size={34} color={t.warning} label="Hapus bintang" onPress={() => toggleStar(m.chatId, m.id)} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<Empty icon="star-outline" title="Belum ada pesan berbintang" body="Tekan lama sebuah pesan lalu pilih Bintangi agar mudah ditemukan." />}
      />
    </Screen>
  );
}
