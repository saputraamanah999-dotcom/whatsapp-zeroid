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
import { attachOrderProof, adminUpdateOrder } from '../lib/store';
import { getVoucher, voucherUsable, redeemVoucher, priceWithDiscount, Voucher } from '../lib/vouchers';
import { PRODUCTS, PAYMENT_METHODS, rupiah, productOf, productSafe, API_PRODUCTS, apiProductOf } from '../lib/products';
import { vanzzQris, vanzzCall } from '../lib/vanzz';
import { resolveMedia } from '../lib/spotify';
import { pickGallery, uploadMedia, pickVideo, uploadMediaDirect } from '../lib/media';
import { pushBanner } from '../lib/bus';
import { ago, chatTime } from '../lib/format';
import { placeCall } from './tabs/CallsTab';
import { ProductKey } from '../lib/types';
import { MusicSong, MusicPlaylist, MusicArtist, musicSearch, TRENDING } from '../lib/music';
import { play as playSong, openFull, usePlayer } from '../lib/player';
import FirePet from '../components/FirePet';
import { fireState, reviveFire, FIRE_MIN_STREAK, REVIVES_PER_MONTH } from '../lib/streak';
import { setTheme } from '../lib/store';
import { useThemeMode, ThemeMode } from '../lib/theme';
import { Segmented } from '../components/ui';
import { vanzzAmVerify, vanzzDeliver } from '../lib/vanzz';
import { unitPriceOf, isUnitProduct } from '../lib/products';

// ---------------- Contact / user profile ----------------
export function UserProfile() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { db, me } = useStore();
  const mode = useThemeMode();
  const [confirm, setConfirm] = useState<null | 'remove' | 'block'>(null);
  const [petOpen, setPetOpen] = useState(false);
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
  // chat pribadi dengan user ini (untuk kartu kustomisasi: api & kucing, wallpaper, gaya balon)
  const dm = Object.values(db.chats).find((c) => c.type === 'direct' && c.members.includes(me.id) && c.members.includes(u.id));
  const fst = dm ? fireState(dm, me) : null;
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

        {/* KUSTOMISASI CHAT BERSAMA USER INI (v23) — pindahan dari bar atas ChatRoom:
            api & kucing streak, wallpaper & tema chat, gaya balon obrolan.
            Tema aplikasi (terang/gelap/sistem) ada di kartu berikutnya. */}
        {dm && fst && (
          <Card title="Kustomisasi chat">
            <View style={{ padding: 12, gap: 12 }}>
              {/* API & KUCING STREAK */}
              <Pressable onPress={() => setPetOpen(true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.md, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm } as any)}>
                <FirePet count={fst.count} color={fst.color} lit={!fst.dead} dimmed={fst.dimmed} size={54} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="body" style={{ fontWeight: '800' }}>
                    {fst.dead ? 'Api padam' : fst.count >= FIRE_MIN_STREAK ? `Api ${fst.count} hari beruntun` : 'Api & kucing streak'}
                  </T>
                  <T v="caption" color={fst.dead ? t.danger : fst.dimmed ? t.warning : t.success}>
                    {fst.dead ? 'Ketuk untuk hidupkan lagi' : fst.dimmed ? 'Api melemah — kirim pesan sekarang' : fst.count >= FIRE_MIN_STREAK ? 'Menyala penuh — rawat tiap hari' : 'Kirim pesan tiap hari supaya menyala'}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={16} color={t.faint} />
              </Pressable>
              <Row icon="color-palette" iconColor="#FF7A9C" title="Wallpaper & tema chat" subtitle="Latar & warna khusus chat ini" onPress={() => nav.navigate('Wallpaper', { chatId: dm.id })} />
              <Row icon="chatbox" iconColor="#7B61FF" title="Gaya balon obrolan" subtitle={me.bubble && me.bubble !== 'default' ? 'Kustom — terlihat orang lain real-time' : 'Pilih gaya balon kesukaanmu'} onPress={() => nav.navigate('ChatBubbles')} />
            </View>
          </Card>
        )}

        {/* TEMA APLIKASI — pindahan dari tab Saya (bar atas rapi, tema di profil) */}
        {self && (
          <Card title="Tampilan aplikasi">
            <View style={{ padding: 12, gap: 10 }}>
              <Segmented<ThemeMode>
                value={mode}
                onChange={setTheme}
                options={[
                  { value: 'light', label: 'Terang' },
                  { value: 'dark', label: 'Gelap' },
                  { value: 'system', label: 'Sistem' },
                ]}
              />
              <T v="caption" color={t.faint}>Tema terpasang di seluruh aplikasi — chat, panggilan, dan profil.</T>
            </View>
          </Card>
        )}

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
      {/* API & KUCING — detail streak chat pribadi (pindahan dari bar atas ChatRoom) */}
      {dm && fst && (
        <Sheet visible={petOpen} onClose={() => setPetOpen(false)} title="Api & kucing streak">
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
            <FirePet count={fst.count} color={fst.color} lit={!fst.dead} dimmed={fst.dimmed} size={120} />
            <T v="h2" style={{ fontWeight: '900' }}>
              {fst.dead ? 'Api padam' : fst.count >= FIRE_MIN_STREAK ? `${fst.count} hari beruntun!` : 'Rawat terus apinya'}
            </T>
            <T v="caption" color={t.sub} style={{ textAlign: 'center', lineHeight: 19 }}>
              Kucing ini dirawat bareng {u.id === me.id ? 'chatmu' : u.name.split(' ')[0]}. Kirim pesan tiap hari supaya api terus menyala —
              1 jam kosong apinya melemah, 1 hari penuh kosong apinya padam. Tiap 10 hari beruntun warna api
              berganti dan makin menyala — angkanya tampil di daftar chat, contoh 100 {'\u{1F525}'} = 100 hari.
            </T>
            {fst.dead && (
              <T v="caption" color={t.danger} style={{ textAlign: 'center' }}>
                Kesempatan hidupkan lagi: {fst.revivesLeft} dari {REVIVES_PER_MONTH}x bulan ini.
              </T>
            )}
            {fst.dead && (
              <Btn
                title={fst.reviveable ? 'Hidupkan api lagi (1 kesempatan)' : 'Lewat 7 hari — mulai dari awal'}
                icon="flame"
                disabled={!fst.reviveable || fst.revivesLeft <= 0}
                onPress={async () => {
                  const r = await reviveFire(dm, me);
                  if (r.ok) {
                    pushBanner({ title: 'Api menyala kembali!', body: 'Kirim pesan hari ini untuk melanjutkan streak.', icon: 'flame' });
                    setPetOpen(false);
                  } else pushBanner({ title: 'Gagal', body: r.error ?? 'Coba lagi.', icon: 'alert' });
                }}
              />
            )}
            {!fst.dead && fst.count >= FIRE_MIN_STREAK && (
              <T v="caption" color={fst.dimmed ? t.danger : t.success}>
                {fst.dimmed ? 'Api melemah — 1 jam tanpa pesan. Kirim pesan sekarang!' : 'Api menyala penuh — pertahankan!'}
              </T>
            )}
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

// ---------------- Premium store ----------------

/** Ambil objek hasil dari order.result (bisa {json:'…'} / objek / string). */
function resultObj(o: any): any {
  const r = o?.result;
  if (!r) return null;
  if (typeof r === 'string') { try { return JSON.parse(r); } catch { return { raw: r }; } }
  if (typeof r === 'object' && typeof r.json === 'string') { try { return JSON.parse(r.json); } catch { return { raw: String(r.json).slice(0, 500) }; } }
  return r;
}

/** Cari nilai pertama yang ada dari daftar kunci (beda bentuk respons API). */
function pickAny(o: any, keys: string[]): string {
  for (const k of keys) {
    const v = o?.[k];
    if (v != null && typeof v !== 'object' && String(v).trim()) return String(v).trim();
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = pickAny(v, keys);
      if (inner) return inner;
    }
  }
  return '';
}

/** Satu baris label-nilai pada kartu hasil. */
function ResRow({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTheme();
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <T v="caption" color={t.faint} style={{ width: 118, paddingTop: 1 }}>{label}</T>
      <T v="caption" color={color} style={{ flex: 1, fontWeight: '700', flexWrap: 'wrap' }}>{value}</T>
    </View>
  );
}

/**
 * KARTU HASIL CANTIK (bukan JSON!) — semua produk API tampil sebagai kartu
 * berwarna dengan ikon + baris label-nilai sesuai jenis produknya.
 */
function ResultCard({ order, title, color, icon }: { order: any; title: string; color: string; icon: string }) {
  const t = useTheme();
  const r = resultObj(order) ?? {};
  const kind = String(r.kind ?? order.product ?? '');
  const isFollowers = kind === 'followers';
  const isReaction = kind === 'reaction';
  const isVerifyDone = r.verifyDone === true || String(r.status ?? '') === 'success' || !!r.premium;
  const isAmp = order.product === 'amp' || order.product === 'amunlock';
  // pasangan [label, nilai] per produk
  let rows: [string, string][] = [];
  let headline = '';
  let sub = '';
  if (isFollowers) {
    headline = `${Number(r.added ?? 0).toLocaleString('id-ID')} followers terkirim`;
    sub = `Saluran "${r.channel ?? '-'}"`;
    rows = [['Total pengikut', `${Number(r.total ?? 0).toLocaleString('id-ID')}`], ['Diproses', order.deliveredAt ? chatTime(order.deliveredAt) : '']];
  } else if (isReaction) {
    headline = `${Number(r.added ?? 0).toLocaleString('id-ID')} reaksi terkirim`;
    sub = `Saluran "${r.channel ?? '-'}" · pesan terakhir`;
    rows = [['Diproses', order.deliveredAt ? chatTime(order.deliveredAt) : '']];
  } else if (order.product === 'checknomor') {
    const d = r.data && typeof r.data === 'object' ? r.data : r;
    headline = pickAny(d, ['nomor', 'number', 'phone']) || 'Nomor terlacak';
    rows = [
      ['Operator', pickAny(d, ['operator', 'provider', 'provider_name', 'card'])],
      ['Prefix', pickAny(d, ['prefix', 'awalan'])],
      ['Wilayah', pickAny(d, ['region', 'wilayah', 'area', 'location', 'lokasi'])],
      ['Jaringan', pickAny(d, ['network', 'jaringan', 'tipe'])],
      ['Status', pickAny(d, ['status', 'state'])],
      ['Terdaftar', pickAny(d, ['registered', 'registered_at', 'terdaftar', 'created'])],
      ['Berlaku s/d', pickAny(d, ['expired', 'expired_at', 'berlaku', 'valid_until'])],
    ];
  } else if (order.product === 'cekresi') {
    const d = r.data && typeof r.data === 'object' ? r.data : r;
    // riwayat perjalanan paket (bila API memberi array)
    const hist = Array.isArray(d?.history) ? d.history : Array.isArray(d?.riwayat) ? d.riwayat : Array.isArray(d?.data) ? d.data : [];
    headline = pickAny(d, ['status', 'status_pengiriman', 'latest_status']) || 'Paket ditemukan';
    rows = [
      ['Resi', pickAny(d, ['noresi', 'resi', 'waybill', 'awb']) || order?.meta?.resi],
      ['Ekspedisi', pickAny(d, ['ekspedisi', 'courier', 'kurir', 'carrier']) || order?.meta?.ekspedisi],
      ['Penerima', pickAny(d, ['receiver', 'penerima', 'received_by'])],
      ['Posisi', pickAny(d, ['position', 'posisi', 'last_location', 'lokasi_terakhir'])],
      ['Waktu', pickAny(d, ['delivertime', 'delivered_time', 'waktu', 'timestamp', 'updated_at'])],
    ];
  } else if (order.product === 'netflix') {
    const d = r.data && typeof r.data === 'object' ? r.data : r;
    headline = 'Akun Netflix siap dipakai';
    rows = [
      ['Token', pickAny(d, ['token', 'access_token', 'key'])],
      ['Berlaku s/d', pickAny(d, ['expired', 'expired_at', 'valid', 'valid_until', 'masa_aktif'])],
      ['Negara', pickAny(d, ['country', 'negara'])],
      ['Paket', pickAny(d, ['plan', 'paket', 'profile'])],
      ['Catatan', pickAny(d, ['note', 'catatan', 'info', 'pesan'])],
    ];
  } else if (isAmp) {
    headline = isVerifyDone ? 'Yeay! Akun kamu udah premium' : 'Magic link terkirim ke email';
    rows = [
      ['Email', pickAny(r, ['email']) || order?.meta?.email],
      ['Status', isVerifyDone ? 'Premium aktif' : 'Menunggu verifikasi'],
      ['Pesan', pickAny(d0(r), ['message', 'msg', 'info'])],
      ['Berlaku s/d', pickAny(r, ['expired', 'expired_at', 'valid_until'])],
    ];
  } else {
    // fallback generik — tampil rapi per baris, BUKAN JSON mentah
    headline = title;
    rows = flatPairs(r).slice(0, 8);
  }
  // JIKA baris spesifik semuanya kosong (bentuk payload beda dari dugaan),
  // pakai baris generik — hasil tetap terbaca cantik, tidak pernah kosong.
  if (!rows.some(([, v]) => !!v)) rows = flatPairs(r).slice(0, 10);
  return (
    <Neu inset radius={R.lg} style={{ padding: 14, marginTop: 6, gap: 8, borderWidth: 1, borderColor: color + '44' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={(isVerifyDone && isAmp ? 'checkmark-circle' : isFollowers ? 'people' : isReaction ? 'heart' : icon) as any} size={21} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="h3" style={{ fontSize: 15 }}>{headline}</T>
          {!!sub && <T v="caption" color={t.sub}>{sub}</T>}
        </View>
      </View>
      <View style={{ gap: 6 }}>
        {rows.filter(([, v]) => !!v).map(([k, v], i) => (
          <ResRow key={`${k}${i}`} label={k} value={v.length > 160 ? v.slice(0, 160) + '…' : v} />
        ))}
      </View>
      {/* token panjang (Netflix dkk) — blok monospace dengan tombol salin */}
      {(() => {
        const tok = pickAny(resultObj(order), ['token', 'access_token', 'key']);
        return /^[\w-]{20,}$/.test(tok) ? (
          <Pressable
            onPress={async () => { try { await (await import('expo-clipboard')).setStringAsync(tok); pushBanner({ title: 'Token disalin', body: 'Tempel saat login.', icon: 'copy' }); } catch {} }}
            style={{ padding: 10, borderRadius: R.md, backgroundColor: t.bg2, flexDirection: 'row', alignItems: 'center', gap: 8 } as any}
          >
            <T v="caption" style={{ flex: 1, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }} numberOfLines={1}>{tok}</T>
            <Ionicons name="copy" size={16} color={t.accent} />
            <T v="caption" color={t.accent} style={{ fontWeight: '800' }}>Salin</T>
          </Pressable>
        ) : null;
      })()}
      {/* URL verifikasi AlightMotion — tombol buka */}
      {(() => {
        const url = pickAny(resultObj(order), ['url', 'link', 'verify_url', 'urlVerify']);
        return /^https?:\/\//.test(url) ? (
          <Pressable
            onPress={() => (Platform.OS === 'web' ? window.open(url, '_blank') : Linking.openURL(url).catch(() => {}))}
            style={{ padding: 10, borderRadius: R.md, backgroundColor: color + '18', flexDirection: 'row', alignItems: 'center', gap: 8 } as any}
          >
            <Ionicons name="open-outline" size={16} color={color} />
            <T v="caption" color={color} style={{ flex: 1, fontWeight: '800' }} numberOfLines={1}>{url}</T>
          </Pressable>
        ) : null;
      })()}
    </Neu>
  );
}

/** Objek nested → daftar pasangan [label, nilai] untuk fallback generik. */
function flatPairs(o: any, prefix = '', depth = 0): [string, string][] {
  if (!o || typeof o !== 'object' || depth > 2) return [];
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v == null) continue;
    const label = k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
    if (typeof v !== 'object') out.push([label, String(v)]);
    else if (Array.isArray(v) && v.length && typeof v[0] !== 'object') out.push([label, v.join(', ')]);
    else if (typeof v === 'object' && depth < 2) out.push(...flatPairs(v, prefix + label + ' · ', depth + 1));
  }
  return out;
}
/** helper kecil untuk akses r.data aman */
function d0(r: any): any { return r?.data && typeof r.data === 'object' ? r.data : r; }

export function PremiumScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { db, me } = useStore();
  // BUY SHEET — alur: pilih metode (QRIS/DANA/Koin) → detail bayar + unggah BUKTI.
  const [buy, setBuy] = useState<{ product: ProductKey; plan: number; meta?: Record<string, string> | null } | null>(null);
  const [payStep, setPayStep] = useState<'method' | 'pay'>('method');
  const [payMethod, setPayMethod] = useState<'qris' | 'dana' | 'koin'>('qris');
  const [activeOrder, setActiveOrder] = useState<{ orderId: string; chatId: string } | null>(null);
  const [qrisImg, setQrisImg] = useState<string | null>(null);
  const [qrisBusy, setQrisBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  // form produk API berbayar (Cek Nomor / Netflix / AM / Resi / Followers / Reaksi)
  const [apiMeta, setApiMeta] = useState<Record<string, string>>({});
  // verifikasi AlightMotion: { orderId → URL verifikasi yang diketik }
  const [amVerify, setAmVerify] = useState<Record<string, string>>({});
  const [amBusy, setAmBusy] = useState<string | null>(null);
  // VOUCHER DISKON — kode ditukar di sini, harga semua paket langsung berkurang
  const [vCode, setVCode] = useState('');
  const [vBusy, setVBusy] = useState(false);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [vMsg, setVMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!me) return null;
  const myOrders = db.orders.filter((o) => o.userId === me.id);
  const active = (k: ProductKey) => planActive(k, me);
  const limit = orderLimitRemaining(me);
  // AMAN untuk produk API yang tidak punya plans — dulu productOf(k).plans[plan].price
  // langsung crash untuk kunci baru. Produk SATUAN (followers/reaksi) mengikuti
  // jumlah yang diketik: total = ceil(amount/unit) * harga per unit.
  const metaAmount = (k: ProductKey) => Number((apiMeta[`${k}.amount`] ?? '').replace(/[^0-9]/g, '') || 0);
  const basePrice = (k: ProductKey, plan: number, meta?: Record<string, string> | null) => {
    const ap = apiProductOf(k);
    if (ap?.unit) {
      const raw = String(meta?.amount ?? apiMeta[`${k}.amount`] ?? '').replace(/[^0-9]/g, '');
      return unitPriceOf(k, Number(raw || ap.minAmount || ap.unit));
    }
    return ap?.price ?? productSafe(k).plans[plan]?.price ?? 0;
  };
  const priceOf = (k: ProductKey, plan: number, meta?: Record<string, string> | null) => (voucher ? priceWithDiscount(basePrice(k, plan, meta), voucher.percent) : basePrice(k, plan, meta));
  const pay = db.payments;
  const activeProof = activeOrder ? myOrders.find((o) => o.id === activeOrder.orderId) : null;

  const applyVoucher = async () => {
    if (vBusy || !me) return;
    const c = vCode.trim();
    if (!c) { setVMsg({ ok: false, text: 'Tulis kode voucher-nya dulu.' }); return; }
    setVBusy(true); setVMsg(null);
    const v = await getVoucher(c);
    const u = voucherUsable(v, me);
    setVBusy(false);
    if (!u.ok) { setVoucher(null); setVMsg({ ok: false, text: u.why ?? 'Voucher tidak bisa dipakai.' }); return; }
    setVoucher(v);
    setVMsg({ ok: true, text: `Voucher ${v!.code} aktif — diskon ${v!.percent}% untuk semua paket!` });
  };

  const buyWithVoucher = async (product: ProductKey, plan: number, method: string) => {
    const p = productOf(product);
    const original = p.plans[plan].price;
    // v19 AUDIT (anti hangus): order DIBUAT DULU dengan harga diskon + kode
    // voucher tercatat; voucher BARU ditukarkan SETELAH order sukses. Kalau
    // order gagal → kuota voucher tidak hangus; kalau penukaran kalah race →
    // admin melihat kode di pesanan dan memverifikasi daftar pemakai.
    if (voucher) {
      const paid = priceWithDiscount(original, voucher.percent);
      const r = createOrder(product, plan, method, undefined, paid, voucher.code);
      if (r && 'error' in r) { pushBanner({ title: 'Pembelian dibatasi', body: r.error, icon: 'alert' }); return; }
      const rd = await redeemVoucher(voucher.code, me);
      if (!rd.ok || !rd.voucher) {
        pushBanner({ title: 'Voucher belum tercatat', body: `${rd.error ?? 'Kuota mungkin habis'} — tunjukkan kode ${voucher.code} ke admin agar pesananmu disesuaikan.`, icon: 'alert' });
      } else {
        pushBanner({ title: `Voucher ${rd.voucher.code} terpakai`, body: `Diskon ${rd.voucher.percent}% — kamu bayar ${rupiah(paid)} (normal ${rupiah(original)}).`, icon: 'ticket' });
      }
      setVoucher(null); setVCode(''); setVMsg(null);
      if (r && 'chatId' in r) nav.navigate('ChatRoom', { chatId: r.chatId });
      return;
    }
    const r = createOrder(product, plan, method);
    if (r && 'error' in r) { pushBanner({ title: 'Pembelian dibatasi', body: r.error, icon: 'alert' }); return; }
    if (r && 'chatId' in r) nav.navigate('ChatRoom', { chatId: r.chatId });
  };

  // ================= ALUR PEMBAYARAN BARU (QRIS + DANA + BUKTI) =================
  const openBuy = (product: ProductKey, plan: number, meta?: Record<string, string> | null) => {
    // DEVELOPER/ADMIN: fitur API berbayar diproses tanpa pembayaran — TANPA teks
    // publik (v23: teks "gratis untuk admin" dihapus dari layar, tak layak dilihat
    // pengguna biasa; perilakunya tetap jalan).
    const staffFree = !!apiProductOf(product) && (me.role === 'admin' || !!me.developer);
    if (staffFree) {
      const r = createOrder(product, plan, 'qris', undefined, 0, undefined, meta as any ?? undefined);
      if (r && 'error' in r) { pushBanner({ title: 'Gagal', body: r.error, icon: 'alert' }); return; }
      if (r && 'orderId' in r) {
        adminUpdateOrder(r.orderId, { status: 'paid', price: 0, adminNote: 'Diproses staf tanpa pembayaran' });
        pushBanner({ title: 'Diproses', body: 'Hasil muncul otomatis di riwayat pesanan.', icon: 'flash' });
      }
      return;
    }
    setBuy({ product, plan, meta: meta ?? null });
    setPayStep('method');
    setActiveOrder(null);
    setQrisImg(null);
  };

  /** Pilih metode → buat order → tampilkan detail bayar. */
  const chooseMethod = async (m: 'qris' | 'dana' | 'koin') => {
    if (!buy) return;
    setPayMethod(m);
    const planIdx = buy.plan;
    if (m === 'koin') {
      // BAYAR DENGAN KOIN — alur lama (saldo koin = Rp)
      const original = basePrice(buy.product, planIdx, buy.meta ?? undefined);
      let need = Math.ceil(original);
      if (voucher) {
        const rd = await redeemVoucher(voucher.code, me);
        if (!rd.ok || !rd.voucher) { pushBanner({ title: 'Voucher gagal dipakai', body: rd.error ?? 'Coba lagi.', icon: 'alert' }); return; }
        need = priceWithDiscount(original, rd.voucher.percent);
      }
      const spent = await spendKoin(me, need, `beli ${buy.product}`);
      if (!spent.ok) { pushBanner({ title: 'Koin belum cukup', body: spent.error ?? `Butuh ${need.toLocaleString('id-ID')} koin.`, icon: 'alert' }); return; }
      const r = createOrder(buy.product, planIdx, 'koin', undefined, voucher ? need : undefined, voucher?.code, buy.meta as any ?? undefined);
      if (r && 'error' in r) {
        await spendKoin(me, -need, `refund gagal order ${buy.product}`).catch(() => {});
        pushBanner({ title: 'Pembelian dibatasi — koin dikembalikan', body: r.error, icon: 'alert' });
        return;
      }
      pushBanner({ title: 'Dibayar dengan koin', body: `${need.toLocaleString('id-ID')} koin terpakai — menunggu konfirmasi admin.`, icon: 'checkmark-circle' });
      setVoucher(null); setVCode(''); setVMsg(null);
      setBuy(null);
      if (r && 'chatId' in r) nav.navigate('ChatRoom', { chatId: r.chatId });
      return;
    }
    // QRIS / DANA → order dibuat dulu (pending), lalu unggah bukti
    const original = basePrice(buy.product, planIdx, buy.meta ?? undefined);
    const paid = voucher ? priceWithDiscount(original, voucher.percent) : original;
    const r = createOrder(buy.product, planIdx, m, undefined, voucher ? paid : undefined, voucher?.code, buy.meta as any ?? undefined);
    if (r && 'error' in r) { pushBanner({ title: 'Pembelian dibatasi', body: r.error, icon: 'alert' }); return; }
    if (r && 'orderId' in r) {
      setActiveOrder({ orderId: r.orderId, chatId: r.chatId });
      setPayStep('pay');
      if (m === 'qris') {
        setQrisBusy(true); setQrisImg(null);
        const qr = await vanzzQris(paid);
        setQrisBusy(false);
        setQrisImg(qr.image ?? pay?.qrisImage ?? null);
      }
    }
  };

  /** LANGKAH 2 ALIGHTMOTION — tempel URL verifikasi dari email (SPAM) → unlock. */
  const submitAmVerify = async (orderId: string) => {
    const url = (amVerify[orderId] ?? '').trim();
    if (!url) { pushBanner({ title: 'URL belum diisi', body: 'Buka email kamu (cek folder SPAM), salin URL verifikasinya, lalu tempel di sini.', icon: 'mail' }); return; }
    if (amBusy) return;
    setAmBusy(orderId);
    const r = await vanzzAmVerify(orderId, url);
    setAmBusy(null);
    if (!r.ok) { pushBanner({ title: 'Verifikasi gagal', body: r.error ?? 'Coba lagi.', icon: 'alert' }); return; }
    pushBanner({ title: 'Yeay! Akun kamu udah premium', body: 'AlightMotion Premium aktif — cek detail di pesanan.', icon: 'checkmark-circle' });
    setAmVerify((x) => ({ ...x, [orderId]: '' }));
  };

  /** Realisasi ulang pesanan (tombol manual kalau otomatis gagal). */
  const retryDeliver = async (orderId: string) => {
    if (amBusy) return;
    setAmBusy(orderId);
    const r = await vanzzDeliver(orderId);
    setAmBusy(null);
    if (!r.ok) pushBanner({ title: 'Belum bisa diproses', body: r.error ?? 'Coba lagi nanti.', icon: 'alert' });
    else pushBanner({ title: 'Berhasil diproses', body: 'Hasil tampil di pesanan.', icon: 'checkmark-circle' });
  };

  /** Unggah foto bukti transfer ke pesanan aktif. */
  const uploadProof = async (orderId?: string) => {
    const oid = orderId ?? activeOrder?.orderId;
    if (!oid || proofBusy) return;
    setProofBusy(true);
    try {
      const picked = await pickGallery('images');
      if (!picked) return;
      const up = await uploadMedia(picked.uri, `bukti/${oid}/${Date.now()}_${picked.name ?? 'bukti.jpg'}`, picked.mime || 'image/jpeg');
      if (!up?.url) throw new Error('Upload bukti gagal — coba lagi.');
      const r = await attachOrderProof(oid, up.url);
      if (!r.ok) pushBanner({ title: 'Bukti gagal dikirim', body: r.error ?? 'Coba lagi.', icon: 'alert' });
    } catch (e: any) {
      pushBanner({ title: 'Bukti gagal', body: String(e?.message ?? 'Coba lagi.').slice(0, 140), icon: 'alert' });
    } finally {
      setProofBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="Zeroid Premium" subtitle="VIP · Member · Centang biru · Keamanan" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 18 }}>
        {/* VOUCHER DISKON — dari admin panel */}
        <Neu radius={R.xl} style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: t.success + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="ticket" size={22} color={t.success} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="h3" style={{ fontSize: 16 }}>Punya kode voucher?</T>
              <T v="caption" color={t.sub}>Tukarkan untuk potongan harga semua paket di bawah.</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <NeuInput
                icon="ticket"
                placeholder="Tulis kode voucher (mis. ZERoid10)"
                value={vCode}
                onChangeText={(x: string) => { setVCode(x.toUpperCase()); setVMsg(null); }}
                autoCapitalize="characters"
                right={voucher ? <Ionicons name="checkmark-circle" size={20} color={t.success} onPress={() => { setVoucher(null); setVMsg(null); }} /> : undefined}
              />
            </View>
            <Btn small title="Tukar" icon="gift" loading={vBusy} onPress={applyVoucher} />
          </View>
          {!!vMsg && <T v="caption" color={vMsg.ok ? t.success : t.danger} style={{ fontWeight: '700' }}>{vMsg.text}</T>}
          {!!voucher && <T v="caption" color={t.sub}>Harga di bawah sudah termasuk diskon {voucher.percent}%. Diskon dipakai otomatis saat checkout.</T>}
        </Neu>
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
                    onPress={() => openBuy(p.key, i)}
                    style={({ pressed }) => ({ flexGrow: 1, flexBasis: '30%', padding: 12, borderRadius: R.md, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm, alignItems: 'center', opacity: isActive ? 0.5 : 1 } as any)}
                  >
                    <T v="caption">{pl.label}</T>
                    {voucher ? (
                      <>
                        <T v="caption" color={t.faint} style={{ textDecorationLine: 'line-through' }}>{rupiah(pl.price)}</T>
                        <T v="h3" color={p.color}>{rupiah(priceOf(p.key, i))}</T>
                      </>
                    ) : (
                      <T v="h3" color={p.color}>{rupiah(pl.price)}</T>
                    )}
                    {isActive && <T v="caption" color={t.success} style={{ fontSize: 10, fontWeight: '700' }}>TIDAK BISA BELI LAGI</T>}
                  </Pressable>
                );
              })}
            </View>
          </Neu>
        ))}
        {/* ===== FITUR API BERBAYAR — Cek Nomor / Resi / Netflix / AM / Followers / Reaksi ===== */}
        <Card title="Fitur berbayar (hasil otomatis)">
          {API_PRODUCTS.map((ap) => {
            const amountStr = apiMeta[`${ap.key}.amount`] ?? '';
            const shownPrice = ap.unit ? unitPriceOf(ap.key, Number((amountStr.replace(/[^0-9]/g, '')) || ap.minAmount || ap.unit)) : ap.price;
            return (
            <Neu key={ap.key} inset radius={R.lg} style={{ padding: 14, marginTop: 10, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: ap.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ap.icon as any} size={22} color={ap.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="h3" style={{ fontSize: 15 }}>{ap.title}</T>
                  <T v="caption" color={t.sub}>{ap.desc}</T>
                </View>
                <T v="h3" color={ap.color}>{ap.unit ? `${rupiah(ap.price)} / ${ap.unit} ${ap.unitLabel}` : rupiah(ap.price)}</T>
              </View>
              {ap.fields.map((f) => (
                <NeuInput
                  key={f.key}
                  icon={f.key === 'nomor' ? 'call' : f.key === 'email' ? 'mail' : f.key === 'resi' ? 'cube' : f.key === 'ekspedisi' ? 'car' : f.key === 'channel' ? 'megaphone' : 'heart'}
                  placeholder={f.placeholder}
                  value={apiMeta[`${ap.key}.${f.key}`] ?? ''}
                  onChangeText={(v: string) => setApiMeta((x) => ({ ...x, [`${ap.key}.${f.key}`]: f.key === 'nomor' ? v.replace(/[^0-9+]/g, '').slice(0, 16) : f.key === 'amount' ? v.replace(/[^0-9]/g, '').slice(0, 8) : f.key === 'resi' ? v.trim().slice(0, 60) : f.key === 'ekspedisi' ? v.slice(0, 40) : v.slice(0, 120) }))}
                  keyboardType={f.key === 'nomor' || f.key === 'amount' ? 'number-pad' : 'default'}
                  autoCapitalize="none"
                />
              ))}
              {!!ap.unit && !!amountStr && (
                <T v="caption" color={ap.color} style={{ fontWeight: '800' }}>
                  Total: {Number(amountStr || 0).toLocaleString('id-ID')} {ap.unitLabel} = {rupiah(shownPrice)}
                </T>
              )}
              <T v="caption" color={t.faint}>{ap.note}</T>
              <Btn
                small
                variant="primary"
                icon="flash"
                title={`Beli ${ap.title} · ${rupiah(shownPrice)}`}
                onPress={() => {
                  const meta: Record<string, string> = {};
                  for (const f of ap.fields) meta[f.key] = (apiMeta[`${ap.key}.${f.key}`] ?? '').trim();
                  if (ap.unit) meta.amount = String(Number((meta.amount || '').replace(/[^0-9]/g, '') || 0));
                  openBuy(ap.key, 0, meta);
                }}
              />
            </Neu>
            );
          })}
        </Card>
        {myOrders.length > 0 && (
          <Card title="Riwayat pesanan">
            {myOrders.filter((o) => o.id !== '_schema').map((o) => {
            const po = apiProductOf(o.product) ? ({ ...apiProductOf(o.product)!, icon: o.product === 'cekresi' ? 'cube' : o.product === 'followers' ? 'people' : o.product === 'reaction' ? 'heart' : 'receipt' } as any) : productSafe(o.product);
            const ro = resultObj(o);
            const ampWaitVerify = (o.product === 'amp' || o.product === 'amunlock') && o.status === 'paid' && o.delivered && !(ro?.verifyDone === true || String(ro?.status ?? '') === 'success' || !!ro?.premium);
            return (
              <View key={o.id} style={{ marginTop: 10 }}>
                <Row
                  icon={po.icon as any}
                  iconColor={po.color}
                  title={`${po.title} · ${o.plan ?? '-'}`}
                  subtitle={`${rupiah(o.price)} · ${o.method} · ${chatTime(o.createdAt)} · ${o.status === 'pending' ? 'menunggu konfirmasi' : o.status === 'paid' ? 'lunas' : 'ditolak'}${o.proofUrl ? ' · bukti ✓' : ''}`}
                  onPress={() => o.chatId && o.chatId !== '_schema' ? nav.navigate('ChatRoom', { chatId: o.chatId }) : undefined}
                />
                {/* HASIL CANTIK (bukan JSON) — kartu khusus per jenis produk */}
                {o.status === 'paid' && !!o.result && <ResultCard order={o} title={po.title} color={po.color} icon={po.icon} />}
                {/* LANGKAH 2 ALIGHTMOTION — bar loading + input URL verifikasi */}
                {ampWaitVerify && (
                  <Neu inset radius={R.lg} style={{ padding: 14, marginTop: 6, gap: 10, borderWidth: 1, borderColor: '#7B61FF55' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: '#7B61FF22', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="mail-open" size={20} color="#7B61FF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <T v="h3" style={{ fontSize: 14, fontWeight: '900' }}>Langkah terakhir — verifikasi email</T>
                        <T v="caption" color={t.sub}>Buka Gmail dari {o.meta?.email ?? 'emailmu'} — cek juga folder <T v="caption" style={{ fontWeight: '900' }}>SPAM</T> — salin URL verifikasinya.</T>
                      </View>
                    </View>
                    {/* BAR LOADING animasi (indikator menyambung ke proses unlock) */}
                    <View style={{ height: 8, borderRadius: 4, backgroundColor: t.bg2, overflow: 'hidden' } as any}>
                      <View style={{ width: amBusy === o.id ? '100%' : '42%', height: 8, borderRadius: 4, backgroundColor: '#7B61FF', opacity: amBusy === o.id ? 1 : 0.55 } as any} />
                    </View>
                    <NeuInput
                      icon="link"
                      placeholder="Tempel URL verifikasi dari email (https://…)"
                      value={amVerify[o.id] ?? ''}
                      onChangeText={(v: string) => setAmVerify((x) => ({ ...x, [o.id]: v.slice(0, 500) }))}
                      autoCapitalize="none"
                    />
                    <Btn small variant="primary" icon="checkmark-circle" title={amBusy === o.id ? 'Memproses verifikasi…' : 'Konfirmasi — jadikan premium'} loading={amBusy === o.id} onPress={() => void submitAmVerify(o.id)} />
                    {!!o.meta?.urlVerify && <T v="caption" color={t.faint} numberOfLines={1}>URL terakhir: {o.meta.urlVerify}</T>}
                  </Neu>
                )}
                {!!o.deliveryError && o.status === 'paid' && (
                  <View style={{ marginTop: 4, gap: 6 }}>
                    <T v="caption" color={t.warning}>Pemrosesan otomatis gagal ({o.deliveryError}) — coba proses ulang atau hubungi admin.</T>
                    <Btn small icon="refresh" title="Proses ulang" loading={amBusy === o.id} onPress={() => void retryDeliver(o.id)} />
                  </View>
                )}
                {o.status === 'pending' && !o.proofUrl && (
                  <Btn small icon="cloud-upload" title="Kirim bukti pembayaran" loading={proofBusy} onPress={() => uploadProof(o.id)} style={{ marginTop: 4 }} />
                )}
              </View>
            );
            })}
          </Card>
        )}
      </ScrollView>
      {/* ====== BUY SHEET: metode → detail bayar + bukti ====== */}
      <Sheet visible={!!buy} onClose={() => setBuy(null)}>
        {buy && payStep === 'method' && (
          <View style={{ gap: 12, paddingBottom: 16 }}>
            <T v="h3">Bayar {apiProductOf(buy.product)?.title ?? productOf(buy.product).title} · {rupiah(priceOf(buy.product, buy.plan, buy.meta ?? undefined))}</T>
            <T v="caption" color={t.sub}>Pilih metode pembayaran. Pembayaran hanya lewat QRIS atau DANA — WAJIB kirim bukti transfer.</T>
            {PAYMENT_METHODS.map((m) => (
              <Btn key={m.key} icon="wallet" title={m.key === 'qris' ? 'QRIS (semua e-wallet / m-banking)' : 'DANA'} onPress={() => void chooseMethod(m.key as 'qris' | 'dana')} />
            ))}
            <Btn variant="neu" icon="sparkles" title={`Bayar dengan koin (butuh ${Math.ceil(priceOf(buy.product, buy.plan, buy.meta ?? undefined)).toLocaleString('id-ID')})`} onPress={() => void chooseMethod('koin')} />
          </View>
        )}
        {buy && payStep === 'pay' && (
          <View style={{ gap: 12, paddingBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name={payMethod === 'qris' ? 'qr-code' : 'wallet'} size={20} color={t.accent} />
              <T v="h3">{payMethod === 'qris' ? 'Scan QRIS' : 'Transfer DANA'}</T>
              <View style={{ flex: 1 }} />
              <T v="h3" color={t.accent}>{rupiah(priceOf(buy.product, buy.plan, buy.meta ?? undefined))}</T>
            </View>
            {payMethod === 'qris' ? (
              <View style={{ alignItems: 'center', gap: 8 }}>
                {qrisBusy && <ActivityIndicator />}
                {qrisImg ? <Image source={{ uri: qrisImg }} style={{ width: 240, height: 240, borderRadius: 14, backgroundColor: '#fff' }} contentFit="contain" /> : !qrisBusy && <T v="sub" color={t.warning}>QRIS belum diatur admin — hubungi admin.</T>}
                <T v="caption" color={t.faint}>QRIS dinamis nominal tepat — berlaku semua e-wallet & m-banking.</T>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                <Neu inset radius={R.md} style={{ padding: 14, gap: 6 }}>
                  <T v="caption" color={t.faint}>Nomor DANA tujuan</T>
                  <T v="h3" style={{ fontSize: 22, letterSpacing: 1 }}>{pay?.danaNumber || 'Belum diatur admin'}</T>
                  {!!pay?.danaName && <T v="caption">a.n. {pay.danaName}</T>}
                </Neu>
                <Btn small icon="copy" title="Salin nomor DANA" disabled={!pay?.danaNumber} onPress={async () => { try { await (await import('expo-clipboard')).setStringAsync(pay?.danaNumber ?? ''); pushBanner({ title: 'Nomor disalin', body: 'Tempel di aplikasi DANA.', icon: 'copy' }); } catch {} }} />
              </View>
            )}
            <View style={{ height: 1, backgroundColor: t.border }} />
            <T v="sub" style={{ fontWeight: '800' }}>Wajib: kirim bukti pembayaran</T>
            <T v="caption" color={t.sub}>Foto/screenshot bukti transfer dikirim ke admin. Fitur diaktifkan setelah admin memverifikasi.</T>
            {activeProof?.proofUrl ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Image source={{ uri: activeProof.proofUrl }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <T v="caption" style={{ fontWeight: '800' }} color={t.success}>Bukti terkirim ✓</T>
                  <T v="caption" color={t.faint}>Menunggu konfirmasi admin…</T>
                </View>
              </View>
            ) : (
              <Btn icon="cloud-upload" variant="primary" title="Unggah bukti transfer" loading={proofBusy} onPress={() => void uploadProof()} />
            )}
            {!!activeOrder && (
              <Btn variant="neu" icon="chatbubbles" title="Buka chat admin" onPress={() => { setBuy(null); nav.navigate('ChatRoom', { chatId: activeOrder.chatId }); }} />
            )}
            <Btn variant="ghost" title="Tutup" onPress={() => setBuy(null)} />
          </View>
        )}
      </Sheet>
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
  // STIKER VANZZ — Brat 3 varian + Random/Custom Sticker Meme v1/v2
  const [genStyle, setGenStyle] = useState<'brat' | 'bratvideo' | 'bratanime' | 'random' | 'smemev1' | 'smemev2'>('brat');
  const [genText, setGenText] = useState('');
  const [memeTop, setMemeTop] = useState('');
  const [memeBottom, setMemeBottom] = useState('');
  const [memeImg, setMemeImg] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);
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
  /** Buat stiker via API developer (proxy server) → otomatis tersimpan ke koleksi user. */
  const generate = async () => {
    if (genBusy) return;
    setGenBusy(true);
    try {
      const params: Record<string, string> = { text: genText.trim(), top: memeTop.trim(), bottom: memeBottom.trim(), link: memeImg ?? '' };
      const r = await vanzzCall(genStyle, params, 55000);
      const uri = r.image ?? (r.ok && typeof r.data === 'string' ? r.data : null);
      if (!r.ok || !uri) throw new Error(r.error ?? 'Stiker tidak berhasil dibuat.');
      createSticker(uri, global);
      pushBanner({ title: 'Stiker jadi ✓', body: 'Otomatis tersimpan di koleksimu.', icon: 'happy' });
    } catch (e: any) {
      pushBanner({ title: 'Gagal membuat stiker', body: String(e?.message ?? '').slice(0, 140), icon: 'alert' });
    } finally {
      setGenBusy(false);
    }
  };
  return (
    <Screen>
      <Header title="Stiker" subtitle={`${mine.length} stiker kustom`} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 16 }}>
        <Card title="Buat stiker (otomatis tersimpan)">
          <View style={{ padding: 8, gap: 10 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {([
                ['brat', 'Brat Teks'], ['bratvideo', 'Brat Video'], ['bratanime', 'Brat Anime'],
                ['random', 'Meme Acak'], ['smemev1', 'Meme Custom V1'], ['smemev2', 'Meme Custom V2'],
              ] as const).map(([k, lbl]) => (
                <Btn key={k} small variant={genStyle === k ? 'primary' : 'ghost'} title={lbl} onPress={() => setGenStyle(k)} />
              ))}
            </View>
            {genStyle !== 'random' && (
              <NeuInput placeholder={genStyle === 'brat' || genStyle === 'bratvideo' || genStyle === 'bratanime' ? 'Teks stiker…' : 'Teks atas meme…'} value={genStyle === 'brat' || genStyle === 'bratvideo' || genStyle === 'bratanime' ? genText : memeTop} onChangeText={(v: string) => (genStyle === 'brat' || genStyle === 'bratvideo' || genStyle === 'bratanime' ? setGenText(v) : setMemeTop(v))} maxLength={90} />
            )}
            {(genStyle === 'smemev1' || genStyle === 'smemev2') && (
              <NeuInput placeholder="Teks bawah meme…" value={memeBottom} onChangeText={(v: string) => setMemeBottom(v)} maxLength={60} />
            )}
            {(genStyle === 'smemev1' || genStyle === 'smemev2') && (
              <Btn small variant="ghost" icon="image" title={memeImg ? 'Gambar latar ✓ ganti' : 'Pilih gambar latar (opsional)'} onPress={async () => { const p = await pickGallery('images'); if (!p) return; const up = await uploadMedia(p.uri, `meme/${Date.now()}.jpg`, p.mime || 'image/jpeg'); setMemeImg(up?.url ?? null); }} />
            )}
            {canGlobal && (
              <Pressable onPress={() => setGlobal(!global)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={global ? 'checkbox' : 'square-outline'} size={20} color={t.accent} />
                <T v="caption" style={{ flex: 1 }}>Admin/developer: publikasikan hasil ke SEMUA pengguna</T>
              </Pressable>
            )}
            <Btn small variant="primary" icon="flash" title="Buat stiker" loading={genBusy} onPress={generate} />
          </View>
        </Card>
        <Btn title="Buat stiker dari foto" icon="add-circle" variant="neu" onPress={make} />
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
