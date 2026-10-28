import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Screen, Avatar, T, Neu, Card, Row, Btn, NeuInput, Empty, UserBadges, IconBtn, Segmented } from '../components/ui';
import { Sheet, Confirm } from '../components/Sheet';
import MediaPlayer from '../components/MediaPlayer';
import AudioBar from '../components/AudioBar';
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
} from '../lib/store';
import { PRODUCTS, PAYMENT_METHODS, rupiah, productOf } from '../lib/products';
import { CURATED, resolveMedia, isYouTube } from '../lib/spotify';
import { songSearch, ytSearch, fetchLyrics, songPlay, ytDownload, SongResult, YtResult, MediaDirect } from '../lib/jere';
import { pickGallery, uploadToStorage } from '../lib/media';
import { pushBanner } from '../lib/bus';
import { ago, chatTime } from '../lib/format';
import { placeCall } from './tabs/CallsTab';
import { ProductKey } from '../lib/types';

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
                <View key={b.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Ionicons name={b.icon} size={22} color={b.color} />
                  <View style={{ flex: 1 }}>
                    <T v="body" style={{ fontWeight: '600' }}>
                      {b.label}
                    </T>
                    {!!b.sub && <T v="caption">{b.sub}</T>}
                  </View>
                </View>
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
  const active = (k: ProductKey) => (k === 'vip' ? isVip(me) : k === 'member' ? isMemberPlan(me) : k === 'bluecheck' ? !!me.blueCheck : !!me.security);
  return (
    <Screen>
      <Header title="Zeroid Premium" subtitle="VIP · Member · Centang biru · Keamanan" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 18 }}>
        <Neu radius={R.lg} style={{ padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <T v="h2">Konfirmasi manual oleh admin</T>
          <T v="sub" style={{ flex: 1, lineHeight: 20 }}>
            Pembayaran dikonfirmasi lewat chat dengan admin. Setelah transfer, kirim bukti di chat — fitur aktif setelah admin memverifikasi.
          </T>
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
              {p.plans.map((pl, i) => (
                <Pressable key={pl.label} onPress={() => setBuy({ product: p.key, plan: i })} style={({ pressed }) => ({ flexGrow: 1, flexBasis: '30%', padding: 12, borderRadius: R.md, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm, alignItems: 'center' } as any)}>
                  <T v="caption">{pl.label}</T>
                  <T v="h3" color={p.color}>
                    {rupiah(pl.price)}
                  </T>
                </Pressable>
              ))}
            </View>
          </Neu>
        ))}
        {myOrders.length > 0 && (
          <Card title="Riwayat pesanan">
            {myOrders.map((o) => (
              <Row
                key={o.id}
                icon={productOf(o.product).icon as any}
                iconColor={productOf(o.product).color}
                title={`${productOf(o.product).title} · ${o.plan}`}
                subtitle={`${rupiah(o.price)} · ${o.method} · ${chatTime(o.createdAt)} · ${o.status === 'pending' ? 'menunggu konfirmasi' : o.status === 'paid' ? 'lunas' : 'ditolak'}`}
                onPress={() => nav.navigate('ChatRoom', { chatId: o.chatId })}
              />
            ))}
          </Card>
        )}
      </ScrollView>
      <Sheet
        visible={!!buy}
        onClose={() => setBuy(null)}
        title={buy ? `Bayar ${productOf(buy.product).title} · ${rupiah(productOf(buy.product).plans[buy.plan].price)}` : ''}
        options={PAYMENT_METHODS.map((m) => ({
          icon: 'wallet' as const,
          label: m.label,
          onPress: () => {
            if (!buy) return;
            const r = createOrder(buy.product, buy.plan, m.key);
            if (r) nav.navigate('ChatRoom', { chatId: r.chatId });
          },
        }))}
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
export function MusicScreen() {
  const t = useTheme();
  const { me } = useStore();
  const [link, setLink] = useState('');
  const [playing, setPlaying] = useState(me?.spotify ?? CURATED[0]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  // Jerexd-powered extras
  const [src, setSrc] = useState<'spotify' | 'youtube'>('spotify');
  const [q, setQ] = useState('');
  const [songs, setSongs] = useState<SongResult[]>([]);
  const [vids, setVids] = useState<YtResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [lyr, setLyr] = useState<{ open: boolean; title: string; text: string }>({ open: false, title: '', text: '' });
  const [audio, setAudio] = useState<MediaDirect | null>(null);
  const [busy, setBusy] = useState('');
  if (!me) return null;

  const runSearch = async (text: string) => {
    setQ(text);
    if (!text.trim()) {
      setSongs([]);
      setVids([]);
      return;
    }
    setSearching(true);
    setErr('');
    try {
      if (src === 'spotify') setSongs(await songSearch(text.trim()));
      else setVids(await ytSearch(text.trim()));
    } catch (e: any) {
      setErr(e?.message ?? 'Pencarian gagal.');
      setSongs([]);
      setVids([]);
    } finally {
      setSearching(false);
    }
  };

  const playSpotifySong = (s: SongResult) => {
    if (s.id) setPlaying({ id: s.id, kind: 'track', title: s.title, thumb: s.thumb } as any);
    else if (s.url) {
      // no spotify id — fall back to direct audio search
      playDirect(`${s.title} ${s.artist ?? ''}`.trim(), s.title);
    }
  };

  const playDirect = async (query: string, title: string) => {
    setBusy(`memutar ${title}`);
    setErr('');
    try {
      const d = await songPlay(query);
      setAudio(d);
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memutar.');
    } finally {
      setBusy('');
    }
  };

  const downloadMp3 = async (title: string, ytUrl?: string) => {
    setBusy(`mengunduh ${title}`);
    setErr('');
    try {
      let d: MediaDirect;
      if (ytUrl) d = await ytDownload(ytUrl, 'mp3');
      else d = await songPlay(title);
      setAudio(d);
      pushBanner({ title: 'MP3 siap diputar', body: title, icon: 'musical-note' });
    } catch (e: any) {
      setErr(e?.message ?? 'Unduhan gagal.');
    } finally {
      setBusy('');
    }
  };

  const openLyrics = async (title: string) => {
    setBusy(`lirik ${title}`);
    setErr('');
    try {
      const text = await fetchLyrics(title);
      setLyr({ open: true, title, text: text || 'Lirik tidak ditemukan.' });
    } catch (e: any) {
      setErr(e?.message ?? 'Lirik gagal dimuat.');
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen>
      <Header title="Musik" subtitle="Spotify & YouTube · cari, lirik, MP3" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 16 }} keyboardShouldPersistTaps="handled">
        <Neu radius={R.lg} style={{ padding: 8 }}>
          <MediaPlayer key={playing.id} track={playing} />
        </Neu>
        <T v="sub" style={{ textAlign: 'center', fontWeight: '600' }}>{playing.title}</T>
        {!isYouTube(playing) && (
          <Btn
            title={me.spotify?.id === playing.id ? 'Lagu profil saat ini' : 'Jadikan lagu profil'}
            icon="person-circle"
            variant={me.spotify?.id === playing.id ? 'neu' : 'primary'}
            onPress={() => (updateMe({ spotify: playing as any }), pushBanner({ title: 'Lagu profil diperbarui', body: playing.title, icon: 'musical-notes' }))}
          />
        )}
        {me.spotify && <Btn small variant="ghost" title="Hapus lagu dari profil" onPress={() => updateMe({ spotify: null })} />}

        {!!audio && <AudioBar uri={audio.url} title={audio.title ?? 'MP3'} subtitle={audio.quality} onClose={() => setAudio(null)} />}
        {!!busy && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={t.accent} />
            <T v="caption" color={t.sub}>{busy}…</T>
          </View>
        )}
        {!!err && <T v="sub" color={t.danger} style={{ textAlign: 'center' }}>{err}</T>}

        <Card title="Cari lagu (Jerexd)">
          <View style={{ padding: 10, gap: 10 }}>
            <Segmented
              value={src}
              onChange={(v) => {
                setSrc(v);
                setSongs([]);
                setVids([]);
              }}
              options={[
                { value: 'spotify', label: 'Spotify' },
                { value: 'youtube', label: 'YouTube' },
              ]}
            />
            <NeuInput
              icon="search"
              placeholder={src === 'spotify' ? 'Judul lagu atau artis…' : 'Cari video YouTube…'}
              value={q}
              onChangeText={runSearch}
              returnKeyType="search"
              autoCapitalize="none"
            />
            {searching && <ActivityIndicator color={t.accent} style={{ padding: 8 }} />}
            {src === 'spotify' && !!songs.length && (
              <View style={{ gap: 2 }}>
                {songs.map((s, i) => (
                  <Row
                    key={`${s.id}-${i}`}
                    icon="musical-note"
                    iconColor="#1DB954"
                    title={s.title}
                    subtitle={[s.artist, s.album].filter(Boolean).join(' · ') || 'Spotify'}
                    onPress={() => playSpotifySong(s)}
                    right={
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        <IconBtn icon="document-text" size={34} iconSize={16} onPress={() => openLyrics(`${s.title} ${s.artist ?? ''}`.trim())} label="Lirik" />
                        <IconBtn icon="download" size={34} iconSize={16} onPress={() => downloadMp3(`${s.title} ${s.artist ?? ''}`.trim())} label="MP3" />
                      </View>
                    }
                  />
                ))}
              </View>
            )}
            {src === 'youtube' && !!vids.length && (
              <View style={{ gap: 2 }}>
                {vids.map((v, i) => (
                  <Row
                    key={`${v.id}-${i}`}
                    icon="logo-youtube"
                    iconColor="#FF0000"
                    title={v.title}
                    subtitle={[v.channel, v.duration].filter(Boolean).join(' · ') || 'YouTube'}
                    onPress={() => setPlaying({ id: v.id, kind: 'youtube', title: v.title, thumb: v.thumb } as any)}
                    right={
                      <View style={{ flexDirection: 'row', gap: 2 }}>
                        <IconBtn icon="document-text" size={34} iconSize={16} onPress={() => openLyrics(v.title)} label="Lirik" />
                        <IconBtn icon="download" size={34} iconSize={16} onPress={() => downloadMp3(v.title, `https://www.youtube.com/watch?v=${v.id}`)} label="MP3" />
                      </View>
                    }
                  />
                ))}
              </View>
            )}
          </View>
        </Card>

        <Card title="Tempel link Spotify atau YouTube">
          <View style={{ padding: 10, gap: 10 }}>
            <NeuInput icon="link" placeholder="https://open.spotify.com/... atau https://youtu.be/..." value={link} onChangeText={setLink} autoCapitalize="none" returnKeyType="go" />
            <Btn
              small
              title="Putar"
              icon="play"
              loading={loading}
              onPress={async () => {
                setErr('');
                setLoading(true);
                const tr = await resolveMedia(link);
                setLoading(false);
                if (!tr) return setErr('Link tidak valid. Gunakan link lagu/album/playlist Spotify atau video YouTube.');
                setPlaying(tr);
                setLink('');
              }}
            />
          </View>
        </Card>
        <Card title="Pilihan">
          {CURATED.map((c) => (
            <Row key={c.id} icon={c.kind === 'youtube' ? 'logo-youtube' : c.kind === 'playlist' ? 'list' : 'musical-note'} iconColor={c.kind === 'youtube' ? '#FF0000' : '#1DB954'} title={c.title} subtitle={c.kind === 'youtube' ? 'YouTube' : c.kind === 'playlist' ? 'Playlist' : 'Lagu'} onPress={() => setPlaying(c)} right={playing.id === c.id ? <Ionicons name="volume-high" size={18} color="#1DB954" /> : undefined} />
          ))}
        </Card>
        <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
          Embed resmi Spotify & YouTube · pencarian/lirik/MP3 via layanan Jerexd di server (kunci API tidak pernah ada di aplikasi). Embed tanpa login memutar preview 30 detik; MP3 diputar langsung di AudioBar.
        </T>
      </ScrollView>

      <Sheet visible={lyr.open} onClose={() => setLyr((x) => ({ ...x, open: false }))} title={`Lirik — ${lyr.title}`}>
        <ScrollView style={{ maxHeight: 430 }} contentContainerStyle={{ paddingBottom: 20 }}>
          <T color={t.sub} style={{ lineHeight: 22 }}>{lyr.text}</T>
        </ScrollView>
      </Sheet>
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
    const res = await uploadToStorage(p.uri, `stickers/${me.id}/${Date.now()}.png`, 'image/png');
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
