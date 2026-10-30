import React, { useState, useEffect, useRef } from 'react';
import { View, ScrollView, Pressable, Platform, ActivityIndicator, Linking, Alert } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Screen, Avatar, T, Neu, Card, Row, Btn, NeuInput, Empty, UserBadges, IconBtn, CoverImage } from '../components/ui';
import { Sheet, Confirm } from '../components/Sheet';
import MediaPlayer from '../components/MediaPlayer';
import BannerMedia from '../components/BannerMedia';
import { DEFAULT_STICKERS } from '../components/Emoji';
import { useTheme, R } from '../lib/theme';
import {
  useStore,
  canSee,
  isOnline,
  openDirect,
  addContact,
  removeContact,
  toggleBlock,
  createOrder,
  sendOtp,
  confirmOtp,
  setPin,
  unlock,
  logout,
  setUsername,
  updateMe,
  createSticker,
  deleteSticker,
  stickersFor,
  isVip,
  isMemberPlan,
  planActive,
  orderLimitRemaining,
} from '../lib/store';
import { spendKoin } from '../lib/points';
import { PRODUCTS, PAYMENT_METHODS, rupiah, productOf, productSafe } from '../lib/products';
import { resolveMedia } from '../lib/spotify';
import { pickGallery, uploadMedia, pickVideo, uploadMediaDirect } from '../lib/media';
import { pushBanner } from '../lib/bus';
import { ago, chatTime } from '../lib/format';
import { placeCall } from './tabs/CallsTab';
import { ProductKey } from '../lib/types';
import { MusicSong, MusicPlaylist, MusicArtist, musicSearch, TRENDING } from '../lib/music';
import { play as playSong, openFull, usePlayer } from '../lib/player';

// ---------------- Contact / user profile ----------------
export function UserProfile() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { db, me } = useStore();
  const [confirm, setConfirm] = useState<null | 'remove' | 'block'>(null);
  const u = db.users[params?.userId];
  if (!me) return null;
  if (!u)
    return (
      <Screen>
        <Header title="Profil" />
        <Empty icon="person-outline" title="Pengguna tidak ditemukan" />
      </Screen>
    );
  const self = u.id === me.id;
  const isContact = me.contacts.includes(u.id);
  const blocked = me.blocked.includes(u.id);
  const photo = canSee(me, u, u.privacy.profilePhoto) ? u.avatar : null;
  const now = Date.now();
  return (
    <Screen>
      <Header title={self ? 'Profil saya' : 'Info kontak'} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          {!!u.banner && (
            <Pressable onPress={() => nav.navigate('MediaViewer', { uri: u.banner, type: u.bannerType === 'video' ? 'video' : 'image' })} style={({ pressed }) => ({ alignSelf: 'stretch', height: 150, borderRadius: R.lg, overflow: 'hidden', marginBottom: -64, opacity: pressed ? 0.92 : 1 })} accessibilityLabel="Banner profil">
              <BannerMedia uri={u.banner} video={u.bannerType === 'video'} height={150} />
            </Pressable>
          )}
          <Pressable disabled={!photo} onPress={() => nav.navigate('MediaViewer', { uri: photo, type: 'image' })}>
            <Avatar uri={photo} name={u.name} color={u.color} size={128} online={isOnline(u) && canSee(me, u, u.privacy.lastSeen)} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }}>
            <T v="h2">{u.name}</T>
            <UserBadges user={u} size={20} />
          </View>
          {!!u.username && (
            <T v="body" color={t.accent} style={{ marginTop: 2, fontWeight: '600' }}>
              @{u.username}
            </T>
          )}
          <T v="sub" style={{ marginTop: 4 }}>
            {canSee(me, u, u.privacy.lastSeen) ? (isOnline(u) ? 'online' : `terakhir dilihat ${ago(u.lastSeen)}`) : u.email}
          </T>
          {!self && (
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 20 }}>
              {[
                { icon: 'chatbubble' as const, label: 'Chat', on: () => nav.navigate('ChatRoom', { chatId: openDirect(u.id) }) },
                { icon: 'call' as const, label: 'Suara', on: () => placeCall(nav, openDirect(u.id), false) },
                { icon: 'videocam' as const, label: 'Video', on: () => placeCall(nav, openDirect(u.id), true) },
                { icon: isContact ? ('person-remove' as const) : ('person-add' as const), label: isContact ? 'Hapus' : 'Simpan', on: () => (isContact ? setConfirm('remove') : (addContact(u.id), pushBanner({ title: 'Kontak disimpan', body: `${u.name} ditambahkan ke kontak`, icon: 'person-add' }))) },
              ].map((a) => (
                <View key={a.label} style={{ alignItems: 'center', gap: 6 }}>
                  <IconBtn icon={a.icon} size={54} color={t.accent} onPress={a.on} label={a.label} />
                  <T v="caption">{a.label}</T>
                </View>
              ))}
            </View>
          )}
        </View>

        <Card title="Info">
          <View style={{ padding: 12, gap: 8 }}>
            <T v="body">{canSee(me, u, u.privacy.about) ? u.about : 'Disembunyikan'}</T>
            <T v="caption" color={t.faint}>
              {u.email}
              {u.phone ? ` · ${u.phone}` : ''}
            </T>
          </View>
        </Card>

        {/* TAUTAN PROFIL (ala WhatsApp Business) — semua user bisa memasangnya */}
        {!!u.links?.length && (
          <Card title="Tautan">
            <View style={{ padding: 8, gap: 6 }}>
              {u.links.filter((l) => l?.url).map((l, i) => (
                <Pressable
                  key={i}
                  onPress={() => {
                    const url = /^https?:\/\//i.test(l.url) ? l.url : `https://${l.url}`;
                    Platform.OS === 'web' ? window.open(url, '_blank') : Linking.openURL(url).catch(() => {});
                  }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: R.md, backgroundColor: pressed ? t.bg2 : t.bg })}
                >
                  <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="link" size={18} color={t.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="body" style={{ fontWeight: '600', color: t.accent }}>{l.label || l.url}</T>
                    <T v="caption" color={t.faint} numberOfLines={1}>{l.url}</T>
                  </View>
                  <Ionicons name="open-outline" size={17} color={t.faint} />
                </Pressable>
              ))}
            </View>
          </Card>
        )}

        <Card title="Lencana">
          <View style={{ padding: 10, gap: 10 }}>
            {[
              { on: !!u.blueCheck, icon: 'checkmark-circle' as const, color: '#1E9BFF', label: 'Centang biru', sub: 'Akun terverifikasi resmi' },
              { on: (u.vipUntil ?? 0) > now, icon: 'diamond' as const, color: '#FFB300', label: 'VIP', sub: u.vipUntil ? `Aktif hingga ${new Date(u.vipUntil).toLocaleDateString('id-ID')}` : '' },
              { on: (u.memberUntil ?? 0) > now, icon: 'ribbon' as const, color: '#7B61FF', label: 'Member', sub: u.memberUntil ? `Aktif hingga ${new Date(u.memberUntil).toLocaleDateString('id-ID')}` : '' },
              { on: !!u.security, icon: 'shield-checkmark' as const, color: t.success, label: 'Keamanan', sub: 'Akun dilindungi PIN & OTP' },
              { on: !!u.otpVerified, icon: 'mail' as const, color: t.accent, label: 'Gmail terverifikasi OTP', sub: 'Diverifikasi melalui kode email' },
            ]
              .filter((b) => b.on)
              .map((b) => (
                <Pressable
                  key={b.label}
                  disabled={b.label !== 'Centang biru'}
                  onPress={() =>
                    b.label === 'Centang biru' &&
                    Alert.alert(
                      'Tentang centang biru',
                      'Centang biru berarti akun ini sudah diperiksa dan dikonfirmasi ASLI oleh admin Zeroid — bukan tiruan atau penipu yang menyamar pakai nama orang lain.\n\nYang didapat: lencana di nama dan profil, prioritas dukungan dari developer, serta status resmi di seluruh chat, grup, dan saluran.\n\nIngin akunmu terverifikasi? Hubungi developer lewat menu Masukan & bantuan, atau beli paket centang biru di tab Saya.'
                    )
                  }
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
                >
                  <Ionicons name={b.icon} size={22} color={b.color} />
                  <View style={{ flex: 1 }}>
                    <T v="body" style={{ fontWeight: '600' }}>
                      {b.label}
                    </T>
                    {!!b.sub && <T v="caption">{b.sub}</T>}
                  </View>
                  {b.label === 'Centang biru' && <Ionicons name="information-circle-outline" size={16} color={t.faint} />}
                </Pressable>
              ))}
            {!u.blueCheck && !u.security && !u.otpVerified && !((u.vipUntil ?? 0) > now) && !((u.memberUntil ?? 0) > now) && <T v="sub">Belum ada lencana.</T>}
          </View>
        </Card>

        {u.spotify && (
          <Card title="Lagu profil">
            <View style={{ padding: 6 }}>
              <MediaPlayer track={u.spotify} />
            </View>
          </Card>
        )}

        {!self && (
          <Card>
            <Row icon="chatbubbles" title="Kirim pesan" onPress={() => nav.navigate('ChatRoom', { chatId: openDirect(u.id) })} />
            {isContact ? <Row icon="person-remove" title="Hapus kontak" danger onPress={() => setConfirm('remove')} /> : <Row icon="person-add" title="Tambah ke kontak" onPress={() => addContact(u.id)} />}
            <Row icon={blocked ? 'lock-open' : 'ban'} title={blocked ? 'Buka blokir' : 'Blokir kontak'} danger onPress={() => (blocked ? toggleBlock(u.id) : setConfirm('block'))} />
          </Card>
        )}
      </ScrollView>
      <Confirm visible={confirm === 'remove'} title={`Hapus ${u.name} dari kontak?`} body="Riwayat chat tetap tersimpan. Kamu bisa menambahkannya lagi lewat @username." confirm="Hapus" danger onConfirm={() => removeContact(u.id)} onClose={() => setConfirm(null)} />
      <Confirm visible={confirm === 'block'} title={`Blokir ${u.name}?`} body="Kontak yang diblokir tidak dapat menelepon atau mengirim pesan kepadamu." confirm="Blokir" danger onConfirm={() => toggleBlock(u.id)} onClose={() => setConfirm(null)} />
    </Screen>
  );
}

// ---------------- Premium store ----------------
export function PremiumScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { db, me } = useStore();
  const [buy, setBuy] = useState<{ product: ProductKey; plan: number } | null>(null);
  if (!me) return null;
  const myOrders = db.orders.filter((o) => o.userId === me.id);
  const active = (k: ProductKey) => planActive(k, me);
  const limit = orderLimitRemaining(me);
  return (
    <Screen>
      <Header title="Zeroid Premium" subtitle="VIP · Member · Centang biru · Keamanan" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 18 }}>
        {/* INFO RAPI: konfirmasi manual + limit beli — satu kartu, baris rapi */}
        <Neu radius={R.xl} style={{ padding: 16, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="shield-checkmark" size={22} color={t.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="h3">Konfirmasi manual oleh admin</T>
              <T v="caption" color={t.sub} style={{ lineHeight: 18 }}>
                Transfer → kirim bukti di chat admin → fitur aktif setelah diverifikasi.
              </T>
            </View>
            <Pressable
              onPress={() => {
                const adminUser = Object.values(db.users).find((x) => x.role === 'developer' || x.role === 'admin');
                if (adminUser) nav.navigate('ChatRoom', { chatId: openDirect(adminUser.id) });
              }}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: t.accentSoft } as any}
            >
              <T v="caption" color={t.accent} style={{ fontWeight: '800' }}>Chat admin</T>
            </Pressable>
          </View>
          <View style={{ height: 1, backgroundColor: t.border }} />
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="speedometer" size={16} color={limit.left <= 1 ? t.warning : t.accent} />
              <T v="caption" style={{ flex: 1 }}>
                <T v="caption" style={{ fontWeight: '800' }}>{limit.left}x</T> lagi dalam 1 jam (maks 5x) · produk aktif tak bisa dibeli ulang sampai habis masa berlaku
              </T>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.bg2, overflow: 'hidden' } as any}>
              <View style={{ width: `${Math.round((limit.left / 5) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: limit.left <= 1 ? t.warning : t.accent } as any} />
            </View>
          </View>
        </Neu>
        {PRODUCTS.map((p) => (
          <Neu key={p.key} radius={R.xl} style={{ padding: 18, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: p.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={p.icon as any} size={24} color={p.color} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="h3" style={{ fontSize: 18 }}>
                  {p.title}
                </T>
                <T v="caption">{p.desc}</T>
              </View>
              {active(p.key) && (
                <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: t.success }}>
                  <T v="caption" color="#fff" style={{ fontWeight: '700' }}>
                    Aktif
                  </T>
                </View>
              )}
            </View>
            {p.perks.map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons name="checkmark" size={16} color={p.color} />
                <T v="sub" style={{ flex: 1 }}>
                  {x}
                </T>
              </View>
            ))}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
              {p.plans.map((pl, i) => {
                const isActive = active(p.key);
                return (
                  <Pressable
                    key={pl.label}
                    disabled={isActive}
                    onPress={() => setBuy({ product: p.key, plan: i })}
                    style={({ pressed }) => ({ flexGrow: 1, flexBasis: '30%', padding: 12, borderRadius: R.md, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm, alignItems: 'center', opacity: isActive ? 0.5 : 1 } as any)}
                  >
                    <T v="caption">{pl.label}</T>
                    <T v="h3" color={p.color}>
                      {rupiah(pl.price)}
                    </T>
                    {isActive && <T v="caption" color={t.success} style={{ fontSize: 10, fontWeight: '700' }}>TIDAK BISA BELI LAGI</T>}
                  </Pressable>
                );
              })}
            </View>
          </Neu>
        ))}
        {myOrders.length > 0 && (
          <Card title="Riwayat pesanan">
            {myOrders.filter((o) => o.id !== '_schema').map((o) => {
            const po = productSafe(o.product);
            return (
              <Row
                key={o.id}
                icon={po.icon as any}
                iconColor={po.color}
                title={`${po.title} · ${o.plan ?? '-'}`}
                subtitle={`${rupiah(o.price)} · ${o.method} · ${chatTime(o.createdAt)} · ${o.status === 'pending' ? 'menunggu konfirmasi' : o.status === 'paid' ? 'lunas' : 'ditolak'}`}
                onPress={() => o.chatId && o.chatId !== '_schema' ? nav.navigate('ChatRoom', { chatId: o.chatId }) : undefined}
              />
            );
            })}
          </Card>
        )}
      </ScrollView>
      <Sheet
        visible={!!buy}
        onClose={() => setBuy(null)}
        title={buy ? `Bayar ${productOf(buy.product).title} · ${rupiah(productOf(buy.product).plans[buy.plan].price)}` : ''}
        options={[
          ...PAYMENT_METHODS.map((m) => ({
            icon: 'wallet' as const,
            label: m.label,
            onPress: () => {
              if (!buy) return;
              const r = createOrder(buy.product, buy.plan, m.key);
              if (r && 'error' in r) {
                pushBanner({ title: 'Pembelian dibatasi', body: r.error, icon: 'alert' });
                return;
              }
              if (r && 'chatId' in r) nav.navigate('ChatRoom', { chatId: r.chatId });
            },
          })),
          // BAYAR DENGAN KOIN: potong saldo koin langsung (1 koin = Rp1 → harga = jumlah koin)
          {
            icon: 'sparkles' as const,
            label: `Koin Zeroid (${(me.points ?? 0).toLocaleString('id-ID')} koin · butuh ${Math.ceil(productOf(buy?.product ?? 'vip').plans[buy?.plan ?? 0].price).toLocaleString('id-ID')})`,
            onPress: async () => {
              if (!buy) return;
              const price = productOf(buy.product).plans[buy.plan].price;
              const need = Math.ceil(price);
              const spent = await spendKoin(me, need, `beli ${productOf(buy.product).title}`);
              if (!spent.ok) {
                pushBanner({ title: 'Koin belum cukup', body: spent.error ?? `Butuh ${need.toLocaleString('id-ID')} koin — ajak teman / check-in harian untuk nambah.`, icon: 'alert' });
                return;
              }
              const r = createOrder(buy.product, buy.plan, 'koin');
              if (r && 'error' in r) {
                pushBanner({ title: 'Pembelian dibatasi', body: r.error, icon: 'alert' });
                return;
              }
              pushBanner({ title: 'Dibayar dengan koin', body: `${need.toLocaleString('id-ID')} koin terpakai — menunggu konfirmasi admin.`, icon: 'checkmark-circle' });
              if (r && 'chatId' in r) nav.navigate('ChatRoom', { chatId: r.chatId });
            },
          },
        ]}
      />
    </Screen>
  );
}

// ---------------- Security ----------------
export function SecurityScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { me } = useStore();
  const [code, setCode] = useState('');
  const [pin, setPinInput] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  if (!me) return null;
  return (
    <Screen>
      <Header title="Keamanan" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Card title="Verifikasi OTP Gmail">
          <View style={{ padding: 12, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={me.otpVerified ? 'checkmark-circle' : 'alert-circle'} size={18} color={me.otpVerified ? t.success : t.warning} />
              <T v="sub" style={{ flex: 1 }}>
                {me.otpVerified ? `${me.email} sudah terverifikasi OTP` : `Kirim kode OTP ke ${me.email}`}
              </T>
            </View>
            {!me.otpVerified && (
              <>
                <Btn
                  small
                  title="Kirim OTP ke Gmail"
                  icon="mail"
                  loading={sending}
                  onPress={async () => {
                    setSending(true);
                    const via = await sendOtp(me.id);
                    setSending(false);
                    setMsg({ ok: true, text: via === 'firebase' ? 'OTP dikirim lewat Firebase ke inbox Gmail kamu.' : 'Mode lokal: OTP dikirim ke kotak notifikasi aplikasi.' });
                  }}
                />
                <NeuInput icon="keypad" placeholder="Kode OTP 6 digit" keyboardType="number-pad" value={code} onChangeText={(s) => setCode(s.replace(/\D/g, '').slice(0, 6))} />
                <Btn small variant="neu" title="Verifikasi OTP" icon="checkmark-circle" onPress={() => {
                  const r = confirmOtp(me.id, code);
                  setMsg({ ok: r.ok, text: r.ok ? 'Berhasil diverifikasi' : r.error ?? 'Gagal' });
                }} />
              </>
            )}
            {msg && (
              <T v="sub" color={msg.ok ? t.success : t.danger}>
                {msg.text}
              </T>
            )}
          </View>
        </Card>
        <Card title="Kunci aplikasi (PIN)">
          {me.security ? (
            <View style={{ padding: 12, gap: 12 }}>
              <T v="sub">{me.pin ? 'PIN aktif — aplikasi terkunci setiap dibuka.' : 'Atur PIN 4–6 digit untuk mengunci Zeroid.'}</T>
              <NeuInput icon="lock-closed" placeholder="PIN baru" secureTextEntry keyboardType="number-pad" value={pin} onChangeText={(s) => setPinInput(s.replace(/\D/g, '').slice(0, 6))} />
              <Btn small title={me.pin ? 'Ganti PIN' : 'Aktifkan PIN'} icon="lock-closed" disabled={pin.length < 4} onPress={() => (setPin(pin), setPinInput(''), pushBanner({ title: 'PIN disimpan', body: 'Aplikasi akan meminta PIN saat dibuka.', icon: 'lock-closed' }))} />
              {!!me.pin && <Btn small variant="ghost" title="Matikan PIN" onPress={() => setPin(null)} />}
            </View>
          ) : (
            <View style={{ padding: 12, gap: 12 }}>
              <T v="sub">Fitur kunci PIN & peringatan login tersedia di paket Keamanan.</T>
              <Btn small title="Beli paket Keamanan" icon="shield-checkmark" onPress={() => nav.navigate('Premium')} />
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

// ---------------- Music (Spotify/YouTube embed + Jerexd search/lirik/MP3) ----------------

/** quick-search presets — one tap fills the search box (works for Spotify & YouTube) */
const VIRAL_CHIPS = ['lagu viral 2026', 'top hits indonesia', 'lagu barat terbaru', 'lagu sad viral', 'dj tiktok viral'];

export function MusicScreen() {
  const t = useTheme();
  const { me } = useStore();
  const st = usePlayer();
  const [q, setQ] = useState('');
  const [songs, setSongs] = useState<MusicSong[]>([]);
  const [pls, setPls] = useState<MusicPlaylist[]>([]);
  const [arts, setArts] = useState<MusicArtist[]>([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState('');
  const [link, setLink] = useState('');
  const [linkBusy, setLinkBusy] = useState(false);
  // ANTI-NGELEG: (1) debounce timer di ref, (2) nomor urut pencarian — hasil
  // respons lama TIDAK BOLEH menimpa ketikan terbaru, (3) runSearch TIDAK
  // menyentuh setQ — dulu ia menulis balik teks lama → ketikan "balik sendiri"
  // setelah dihapus dan layar terasa delay.
  const seq = useRef(0);
  const debounceT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = async (text: string) => {
    const s = text.trim();
    const my = ++seq.current;
    if (!s) {
      setSongs([]); setPls([]); setArts([]); setErr(''); setSearching(false);
      return;
    }
    setSearching(true);
    setErr('');
    try {
      const r = await musicSearch(s, 'all') as any;
      if (my !== seq.current) return; // ketikan lebih baru sudah jalan — buang hasil basi
      // search 'all' → kembalikan songs+playlists+artists sekaligus
      const list: MusicSong[] = Array.isArray(r) ? r : r?.songs ?? [];
      setSongs(list);
      setPls(r?.playlists ?? []);
      setArts(r?.artists ?? []);
      if (!list.length && !r?.playlists?.length && !r?.artists?.length) setErr('Tidak ada hasil. Coba kata kunci lain.');
    } catch (e: any) {
      if (my !== seq.current) return;
      setErr(e?.message ?? 'Pencarian gagal.');
      setSongs([]); setPls([]); setArts([]);
    } finally {
      if (my === seq.current) setSearching(false);
    }
  };

  const onType = (s: string) => {
    setQ(s); // input SELALU mengikuti ketikan pengguna
    if (debounceT.current) clearTimeout(debounceT.current);
    const txt = s;
    debounceT.current = setTimeout(() => void runSearch(txt), 450);
  };

  useEffect(() => () => { if (debounceT.current) clearTimeout(debounceT.current); }, []);

  const openSong = (s: MusicSong) => {
    void playSong(s, songs.length ? songs : [s]);
    setTimeout(openFull, 350);
  };

  const resolveLink = async () => {
    const l = link.trim();
    if (!l) return;
    setLinkBusy(true);
    setErr('');
    try {
      const tr = await resolveMedia(l);
      if (!tr) { setErr('Link tidak valid. Gunakan link Spotify atau YouTube.'); return; }
      const query = tr.title ?? '';
      if (!query) { setErr('Tidak dapat membaca judul dari link itu.'); return; }
      setLink('');
      setQ(query);
      const r = await musicSearch(query, 'songs');
      const list = r?.songs ?? [];
      setSongs(list); setPls(r?.playlists ?? []); setArts(r?.artists ?? []);
      if (list.length) { void playSong(list[0], list); setTimeout(openFull, 350); }
      else setErr('Lagu tidak ditemukan di katalog — coba cari manual.');
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memproses link.');
    } finally {
      setLinkBusy(false);
    }
  };

  const glass: any = {
    backgroundColor: t.dark ? 'rgba(30,36,46,0.72)' : 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: t.dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px) saturate(1.5)', WebkitBackdropFilter: 'blur(18px) saturate(1.5)' } as any) : {}),
  };

  return (
    <Screen>
      <Header title="ZEROID MUSIC" subtitle="Spotify kita — cari, putar, lirik" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 90, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 14 }} keyboardShouldPersistTaps="handled">

        {/* HERO — lagu yang sedang berputar di player global */}
        <View style={[glass, { borderRadius: R.lg, padding: 14, gap: 12, boxShadow: t.raisedSm }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 18, overflow: 'hidden', backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              {st.current?.thumb ? (
                <Image source={{ uri: st.current.thumb }} style={{ width: 64, height: 64 }} contentFit="cover" />
              ) : (
                <Ionicons name="musical-notes" size={28} color={t.accent} />
              )}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="h3" numberOfLines={1}>{st.current?.title ?? 'Belum ada lagu'}</T>
              <T v="caption" color={t.sub} numberOfLines={1}>
                {st.current ? (st.loading ? 'Menyiapkan audio…' : st.current.artist ?? 'ZEROID MUSIC') : 'Cari lagu di bawah untuk mulai memutar'}
              </T>
            </View>
            {!!st.current && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <IconBtn icon="expand" size={44} color={t.accent} onPress={openFull} label="Perbesar pemutar" />
              </View>
            )}
          </View>
          {!!st.current && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn small variant="neu" icon="document-text" title="Lirik" onPress={openFull} style={{ flex: 1 }} />
              <Btn
                small
                variant="neu"
                icon="person-circle"
                title={me?.spotify?.id === st.current.videoId ? 'Lagu profil saat ini' : 'Jadikan lagu profil'}
                disabled={me?.spotify?.id === st.current.videoId}
                onPress={() => {
                  // kind:'youtube' — videoId berasal dari katalog YouTube, diputar via
                  // pemutar YouTube resmi di profil (BUKAN embed Spotify — itu yang
                  // bikin "Page not available").
                  updateMe({ spotify: { id: st.current!.videoId, kind: 'youtube', title: st.current!.title, thumb: st.current!.thumb } as any });
                  pushBanner({ title: 'Lagu profil diperbarui', body: st.current!.title, icon: 'musical-notes' });
                }}
                style={{ flex: 2 }}
              />
            </View>
          )}
          <T v="caption" color={t.faint}>Lagu tetap menyala di semua halaman — mini-bar bisa disembunyikan (tahan gelembung untuk berhenti).</T>
        </View>

        {/* pencarian */}
        <NeuInput
          icon="search"
          placeholder="Cari lagu, artis, album…"
          value={q}
          onChangeText={onType}
          onSubmitEditing={() => {
            if (debounceT.current) clearTimeout(debounceT.current);
            void runSearch(q);
          }}
          returnKeyType="search"
          autoCapitalize="none"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingHorizontal: 2 }}>
          {TRENDING.map((c) => (
            <Pressable
              key={c}
              onPress={() => { setQ(c); void runSearch(c); }}
              style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: q === c ? t.accent : t.bg2, borderWidth: 1, borderColor: q === c ? t.accent : t.border, opacity: pressed ? 0.85 : 1 })}
            >
              <T v="caption" color={q === c ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{c}</T>
            </Pressable>
          ))}
        </ScrollView>
        {searching && <ActivityIndicator color={t.accent} style={{ paddingVertical: 10 }} />}
        {!!err && <T v="sub" color={t.danger} style={{ textAlign: 'center' }}>{err}</T>}

        {!!songs.length && (
          <View style={{ gap: 2 }}>
            <T v="label" style={{ marginLeft: 8, marginTop: 4 }}>Lagu · {songs.length}</T>
            {songs.map((s, i) => {
              const active = st.current?.videoId === s.videoId;
              return (
                <Row
                  key={`${s.videoId}-${i}`}
                  icon="musical-note"
                  image={s.thumb}
                  chevron={false}
                  title={active && st.playing ? `${s.title}  ♪` : s.title}
                  subtitle={[s.artist, s.album, s.duration].filter(Boolean).join(' · ') || 'Lagu'}
                  onPress={() => openSong(s)}
                  right={
                    <Pressable
                      onPress={() => openSong(s)}
                      hitSlop={8}
                      accessibilityLabel={active ? 'Sedang diputar' : 'Putar lagu'}
                      style={({ pressed }) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? 'rgba(29,185,84,0.14)' : 'transparent', transform: [{ scale: pressed ? 0.9 : 1 }] })}
                    >
                      {active && st.loading ? (
                        <ActivityIndicator size="small" color="#1DB954" />
                      ) : active ? (
                        <Ionicons name={st.playing ? 'volume-high' : 'play'} size={20} color="#1DB954" />
                      ) : (
                        <Ionicons name="play-circle" size={30} color="#1DB954" />
                      )}
                    </Pressable>
                  }
                />
              );
            })}
          </View>
        )}

        {!!arts.length && (
          <Card title="Artis">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, padding: 8 }}>
              {arts.map((a) => (
                <Pressable key={a.browseId} onPress={() => { setQ(a.name); void runSearch(a.name); }} style={{ alignItems: 'center', width: 86, gap: 6 }}>
                  <CoverImage uri={a.thumb} size={74} round fallbackIcon="person" />
                  <T v="caption" numberOfLines={2} style={{ textAlign: 'center', fontWeight: '700' }}>{a.name}</T>
                </Pressable>
              ))}
            </ScrollView>
          </Card>
        )}

        {!!pls.length && (
          <Card title="Playlist">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, padding: 8 }}>
              {pls.map((p) => (
                <Pressable key={p.browseId} onPress={() => void runSearch(p.title)} style={{ width: 132, gap: 6 }}>
                  <CoverImage uri={p.thumb} size={132} round={false} fallbackIcon="list" />
                  <T v="caption" numberOfLines={2} style={{ fontWeight: '700' }}>{p.title}</T>
                  {!!p.author && <T v="caption" color={t.faint} numberOfLines={1}>{p.author}</T>}
                </Pressable>
              ))}
            </ScrollView>
          </Card>
        )}

        {/* tempel link Spotify / YouTube */}
        <Card title="Tempel link Spotify atau YouTube">
          <View style={{ padding: 10, gap: 10 }}>
            <NeuInput icon="link" placeholder="https://open.spotify.com/... atau https://youtu.be/..." value={link} onChangeText={setLink} autoCapitalize="none" returnKeyType="go" onSubmitEditing={() => void resolveLink()} />
            <Btn small title={linkBusy ? 'Memproses…' : 'Putar dari link'} icon="play" loading={linkBusy} onPress={() => void resolveLink()} />
            <T v="caption" color={t.faint}>Link Spotify/YouTube akan dicocokkan ke katalog lagu, lalu diputar dengan player ZEROID.</T>
          </View>
        </Card>

        <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
          Sumber: katalog YouTube Music + lirik LRCLIB (via server sendiri, tanpa kunci API di aplikasi).
        </T>
      </ScrollView>
    </Screen>
  );
}

// ---------------- Sticker manager ----------------
export function StickersScreen() {
  const t = useTheme();
  const { db, me } = useStore();
  const [global, setGlobal] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  if (!me) return null;
  const canGlobal = me.role === 'admin' || !!me.developer;
  const mine = stickersFor(me.id, db);
  const make = async () => {
    const p = await pickGallery('images');
    if (!p) return;
    const res = await uploadMedia(p.uri, `stickers/${me.id}/${Date.now()}.png`, 'image/png');
    const uri = res.url;
    createSticker(uri, global);
    pushBanner({ title: 'Stiker dibuat', body: global ? 'Dibagikan untuk semua pengguna' : 'Tersimpan di koleksimu', icon: 'happy' });
  };
  return (
    <Screen>
      <Header title="Stiker" subtitle={`${mine.length} stiker kustom`} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Btn title="Buat stiker dari foto" icon="add-circle" onPress={make} />
        {canGlobal && (
          <Pressable onPress={() => setGlobal(!global)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 6 }}>
            <Ionicons name={global ? 'checkbox' : 'square-outline'} size={22} color={t.accent} />
            <T v="sub" style={{ flex: 1 }}>
              Admin & developer: bagikan stiker baru ke semua pengguna
            </T>
          </Pressable>
        )}
        <Card title="Koleksi saya & global">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 8 }}>
            {mine.length === 0 && <T v="sub">Belum ada stiker kustom.</T>}
            {mine.map((s) => (
              <Pressable key={s.id} onLongPress={() => (s.ownerId === me.id || canGlobal) && setDel(s.id)} style={{ width: 84, height: 84, borderRadius: 16, backgroundColor: t.bg, boxShadow: t.insetSm, alignItems: 'center', justifyContent: 'center' } as any}>
                <Image source={{ uri: s.uri }} style={{ width: 72, height: 72 }} contentFit="contain" />
                {s.global && <Ionicons name="globe" size={14} color={t.accent} style={{ position: 'absolute', top: 4, right: 4 }} />}
              </Pressable>
            ))}
          </View>
        </Card>
        <Card title="Paket Zeroid (bawaan)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 8 }}>
            {DEFAULT_STICKERS.map((s) => (
              <Image key={s.id} source={{ uri: s.uri }} style={{ width: 60, height: 60 }} contentFit="contain" />
            ))}
          </View>
        </Card>
        <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
          Tekan lama stiker untuk menghapus.
        </T>
      </ScrollView>
      <Confirm visible={!!del} title="Hapus stiker ini?" confirm="Hapus" danger onConfirm={() => del && deleteSticker(del)} onClose={() => setDel(null)} />
    </Screen>
  );
}

// ---------------- Username gate (new login / register without username) ----------------
export function SetUsernameScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { me } = useStore();
  const [u, setU] = useState(me?.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '') ?? '');
  const [err, setErr] = useState('');
  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 60, padding: 26, gap: 16, maxWidth: 480, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <T v="h1" style={{ textAlign: 'center' }}>
          Pilih username
        </T>
        <T v="sub" style={{ textAlign: 'center' }}>
          Username membuatmu bisa ditemukan dan ditambahkan sebagai kontak lewat pencarian.
        </T>
        <NeuInput icon="at" placeholder="username" value={u} onChangeText={(s) => setU(s.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={20} />
        {!!err && (
          <T v="sub" color={t.danger}>
            {err}
          </T>
        )}
        <Btn
          title="Simpan"
          icon="checkmark"
          onPress={async () => {
            const r = await setUsername(u);
            if (!r.ok) setErr(r.error ?? 'Gagal');
          }}
        />
        <Btn title="Keluar" variant="ghost" onPress={logout} />
      </ScrollView>
    </Screen>
  );
}

// ---------------- PIN lock ----------------
export function LockScreen() {
  const t = useTheme();
  const { me } = useStore();
  const [pin, setPinInput] = useState('');
  const [err, setErr] = useState('');
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <View style={{ flex: 1, paddingTop: insets.top + 80, padding: 26, gap: 18, alignItems: 'center', maxWidth: 420, width: '100%', alignSelf: 'center' }}>
        <Avatar uri={me?.avatar} name={me?.name ?? ''} color={me?.color} size={90} />
        <T v="h2">Zeroid terkunci</T>
        <NeuInput
          icon="keypad"
          placeholder="Masukkan PIN"
          secureTextEntry
          keyboardType="number-pad"
          value={pin}
          autoFocus
          onChangeText={(s) => setPinInput(s.replace(/\D/g, '').slice(0, 6))}
          onSubmitEditing={() => (unlock(pin) ? null : setErr('PIN salah'))}
          containerStyle={{ width: '100%' }}
        />
        {!!err && (
          <T v="sub" color={t.danger}>
            {err}
          </T>
        )}
        <Btn title="Buka" icon="lock-open" style={{ width: '100%' }} onPress={() => (unlock(pin) ? null : setErr('PIN salah'))} />
        <Btn title="Keluar akun" variant="ghost" onPress={logout} />
      </View>
    </Screen>
  );
}
