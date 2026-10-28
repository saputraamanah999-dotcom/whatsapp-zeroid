import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable, Share } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Header, Screen, Avatar, T, Neu, Row, Card, Toggle, IconBtn, NeuInput, Btn, Empty } from '../components/ui';
import { Sheet, Confirm } from '../components/Sheet';
import { useTheme, R } from '../lib/theme';
import {
  useStore,
  chatTitle,
  chatPeer,
  canSee,
  isOnline,
  toggleChatFlag,
  toggleBlock,
  clearChat,
  removeMember,
  toggleAdmin,
  addMembers,
  updateChat,
  toggleFollow,
  openDirect,
  setDisappearing,
  setPostPolicy,
  regenerateInvite,
  chatVerified,
  chatBadge,
  createOrder,
  contributeBlueCheckPot,
  BLUECHECK_POT_TARGET,
  isFullAdmin,
} from '../lib/store';
import { productOf, rupiah } from '../lib/products';
import { ago } from '../lib/format';
import { placeCall } from './tabs/CallsTab';
import { pickGallery, uploadMedia } from '../lib/media';
import { pushBanner } from '../lib/bus';
import { VerifiedBadge } from '../lib/icons';

export default function ChatInfo() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const { db, me } = useStore();
  const chat = db.chats[params?.chatId];
  const [memberSel, setMemberSel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addSel, setAddSel] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(chat?.name ?? '');
  const [desc, setDesc] = useState(chat?.description ?? '');
  const [confirm, setConfirm] = useState<null | 'clear' | 'leave' | 'block'>(null);
  const [disTimer, setDisTimer] = useState(false);

  const media = useMemo(() => (db.messages[chat?.id ?? ''] ?? []).filter((m) => (m.type === 'image' || m.type === 'video') && m.uri && !m.deletedForAll && !m.deletedFor.includes(me?.id ?? '')).slice(-12).reverse(), [db, chat?.id, me?.id]);
  const docs = useMemo(() => (db.messages[chat?.id ?? ''] ?? []).filter((m) => (m.type === 'document' || m.type === 'audio') && !m.deletedForAll).length, [db, chat?.id]);

  if (!me) return null;
  if (!chat)
    return (
      <Screen>
        <Header title="Info" />
        <Empty icon="alert-circle-outline" title="Chat tidak ditemukan" />
      </Screen>
    );

  const peer = chatPeer(chat, me.id, db);
  const title = chatTitle(chat, me.id, db);
  // developer/admin global boleh mengatur SEMUA chat (termasuk global & saluran Zeroid AI)
  const isAdmin = chat.admins.includes(me.id) || isFullAdmin(me);
  const badge = chat.type === 'direct' ? !!(peer && (peer.blueCheck || peer.developer || peer.role === 'admin' || peer.role === 'developer')) : chatBadge(chat, db);
  const autoVerified = !chatVerified(chat) && badge && chat.type !== 'direct' && chat.type !== 'ai'; // ikut dari pemilik
  const muted = chat.mutedBy.includes(me.id);
  const blocked = peer ? me.blocked.includes(peer.id) : false;
  const avatarUri = chat.type === 'direct' || chat.type === 'ai' ? (canSee(me, peer, peer?.privacy.profilePhoto ?? 'everyone') ? peer?.avatar : null) : chat.avatar;
  let sub = '';
  if (chat.type === 'direct' && peer) sub = canSee(me, peer, peer.privacy.lastSeen) ? (isOnline(peer) ? 'online' : `terakhir dilihat ${ago(peer.lastSeen)}`) : peer.email;
  else if (chat.type === 'group') sub = `Grup · ${chat.members.length} anggota`;
  else if (chat.type === 'channel') sub = `Channel · ${chat.members.length} pengikut`;
  else if (chat.type === 'global') sub = 'Chat publik untuk semua pengguna';
  else sub = 'Asisten AI · selalu online';

  const changePhoto = async () => {
    const p = await pickGallery('images');
    if (p) { const r = await uploadMedia(p.uri, `groups/${chat.id}_${Date.now()}.jpg`, 'image/jpeg'); updateChat(chat.id, { avatar: r.url }); }
  };

  const candidates = Object.values(db.users).filter((u) => !chat.members.includes(u.id) && !u.banned);

  return (
    <Screen>
      <Header title="Info" right={chat.type === 'group' || chat.type === 'channel' || (chat.type === 'global' && isFullAdmin(me)) ? isAdmin ? <IconBtn icon="pencil" size={40} onPress={() => (setName(chat.name ?? ''), setDesc(chat.description ?? ''), setEditing(true))} /> : undefined : undefined} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 22 }}>
          <Pressable disabled={!isAdmin || (chat.type !== 'group' && chat.type !== 'channel' && !(chat.type === 'global' && isFullAdmin(me)))} onPress={changePhoto} accessibilityLabel="Ganti foto chat">
            <Avatar uri={avatarUri} name={title} color={peer?.color ?? chat.color} size={120} icon={chat.type === 'ai' ? 'sparkles' : chat.type === 'global' ? 'globe' : chat.type === 'channel' && !chat.avatar ? 'megaphone' : chat.type === 'group' && !chat.avatar ? 'people' : undefined} />
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 }}>
            <T v="h2">{title}</T>
            {badge && <VerifiedBadge size={20} animate={false} />}
          </View>
          <T v="sub" style={{ marginTop: 4 }}>
            {sub}
          </T>
          {(chat.type === 'direct' || chat.type === 'group') && (
            <View style={{ flexDirection: 'row', gap: 18, marginTop: 20 }}>
              {[
                { icon: 'chatbubble' as const, label: 'Chat', on: () => nav.navigate('ChatRoom', { chatId: chat.id }) },
                { icon: 'call' as const, label: 'Suara', on: () => placeCall(nav, chat.id, false) },
                { icon: 'videocam' as const, label: 'Video', on: () => placeCall(nav, chat.id, true) },
                { icon: muted ? ('volume-high' as const) : ('volume-mute' as const), label: muted ? 'Bunyikan' : 'Bisukan', on: () => toggleChatFlag(chat.id, 'mutedBy') },
              ].map((a) => (
                <View key={a.label} style={{ alignItems: 'center', gap: 6 }}>
                  <IconBtn icon={a.icon} size={54} color={t.accent} onPress={a.on} label={a.label} />
                  <T v="caption">{a.label}</T>
                </View>
              ))}
            </View>
          )}
          {chat.type === 'channel' && <Btn small style={{ marginTop: 18 }} variant={chat.members.includes(me.id) ? 'neu' : 'primary'} icon={chat.members.includes(me.id) ? 'checkmark' : 'add'} title={chat.members.includes(me.id) ? 'Mengikuti' : 'Ikuti'} onPress={() => toggleFollow(chat.id)} />}
        </View>

        {(chat.description || (chat.type === 'direct' && peer) || chat.type === 'ai') && (
          <Card title={chat.type === 'direct' ? 'Info' : 'Deskripsi'}>
            <View style={{ padding: 12, gap: 6 }}>
              <T v="body">{chat.type === 'direct' && peer ? (canSee(me, peer, peer.privacy.about) ? peer.about : 'Disembunyikan') : chat.type === 'ai' ? 'Asisten AI Zeroid menjawab pertanyaanmu melalui proxy server yang aman. Percakapan dengan AI tidak dibagikan ke pengguna lain.' : chat.description}</T>
              {chat.type === 'direct' && peer && (
                <T v="caption" color={t.faint}>
                  {peer.email}
                </T>
              )}
            </View>
          </Card>
        )}

        {/* centang biru grup/saluran — status + patungan + pembelian */}
        {(chat.type === 'group' || chat.type === 'channel') && (
          <Card title="Centang biru">
            <View style={{ padding: 12, gap: 10 }}>
              {badge ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <VerifiedBadge size={18} animate={false} />
                  <T v="sub" style={{ flex: 1, fontWeight: '700', color: t.accent }}>
                    {chat.type === 'channel' ? 'Saluran' : 'Grup'} ini terverifikasi
                    {chatVerified(chat)
                      ? (chat.verifiedUntil ?? 0) > Date.now()
                        ? ` — masa aktif ${Math.ceil(((chat.verifiedUntil ?? 0) - Date.now()) / 86400000)} hari lagi`
                        : ' — permanen'
                      : ' — otomatis ikut centang biru pemilik (tanpa beli lagi)'}
                  </T>
                </View>
              ) : (
                <T v="sub">Tandai {chat.type === 'channel' ? 'saluran' : 'grup'} ini sebagai resmi dengan centang biru — muncul di nama, daftar chat, dan info.</T>
              )}
              {/* PATUNGAN: anggota menyetor bersama sampai target tercapai */}
              {!badge && (
                <View style={{ gap: 8, borderRadius: R.md, padding: 12, backgroundColor: t.bg2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="people-circle" size={18} color={t.accent} />
                    <T v="caption" style={{ flex: 1, fontWeight: '800' }}>PATUNGAN BERSAMA — target {rupiah(BLUECHECK_POT_TARGET)} (permanen)</T>
                  </View>
                  {(() => {
                    const pot = chat.blueCheckPot ?? {};
                    const total = Object.values(pot).reduce((a: number, b: any) => a + Number(b ?? 0), 0) as number;
                    const pct = Math.min(100, Math.round((total / BLUECHECK_POT_TARGET) * 100));
                    return (
                      <>
                        <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border, overflow: 'hidden' }}>
                          <View style={{ width: `${pct}%`, height: '100%', borderRadius: 4, backgroundColor: t.accent }} />
                        </View>
                        <T v="caption" color={t.sub}>Terkumpul {rupiah(total)} dari {rupiah(BLUECHECK_POT_TARGET)} · {Object.keys(pot).length} anggota ikut</T>
                        {!!Object.keys(pot).length && (
                          <T v="caption" color={t.faint} numberOfLines={2}>
                            {Object.entries(pot).map(([uid, v]: any) => `${db.users[uid]?.name?.split(' ')[0] ?? 'Anggota'}: ${rupiah(Number(v))}`).join(' · ')}
                          </T>
                        )}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {[10000, 25000, 49000].map((amt) => (
                            <Btn
                              key={amt}
                              small
                              variant="primary"
                              icon="wallet"
                              title={`Ikut ${rupiah(amt)}`}
                              onPress={async () => {
                                const r = await contributeBlueCheckPot(chat.id, amt);
                                if (r.ok) pushBanner({ title: r.reached ? 'Target tercapai!' : 'Kontribusi masuk', body: r.reached ? 'Pesanan centang biru dikirim ke admin untuk konfirmasi pembayaran.' : `Total patungan sekarang dilihat di info ${chat.name}.`, icon: 'wallet' });
                                else pushBanner({ title: 'Patungan gagal', body: r.error ?? 'Coba lagi.', icon: 'alert' });
                              }}
                            />
                          ))}
                        </View>
                        <T v="caption" color={t.faint}>Kalau target tercapai, pesanan otomatis dikirim ke admin — pembayaran dikonfirmasi lewat chat transaksi patungan.</T>
                      </>
                    );
                  })()}
                </View>
              )}
              {isAdmin && !autoVerified && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {productOf('bluecheck').plans.map((pl, i) => (
                    <Btn
                      key={pl.label}
                      small
                      variant="primary"
                      icon="checkmark-circle"
                      title={`${pl.label} · ${rupiah(pl.price)}`}
                      onPress={() => {
                        const r = createOrder('bluecheck', i, 'qris', { id: chat.id, name: chat.name });
                        if (r && 'error' in r) pushBanner({ title: 'Tidak bisa memesan', body: r.error, icon: 'alert' });
                        else if (r) pushBanner({ title: 'Pesanan dikirim', body: `Centang biru untuk "${chat.name}" menunggu konfirmasi admin.`, icon: 'checkmark-circle' });
                      }}
                    />
                  ))}
                </View>
              )}
              {!badge && <T v="caption" color={t.faint}>Centang aktif setelah admin mengonfirmasi pembayaran. Kalau pemilik sudah punya centang biru, grup/saluran otomatis ikut — tanpa beli lagi.</T>}
            </View>
          </Card>
        )}

        {(media.length > 0 || docs > 0) && (
          <Card title={`Media, dokumen · ${media.length + docs}`}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, padding: 8 }}>
              {media.map((m) => (
                <Pressable key={m.id} onPress={() => nav.navigate('MediaViewer', { uri: m.uri, type: m.type, caption: m.text })} style={{ width: 86, height: 86, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' }}>
                  {m.type === 'image' ? <Image source={{ uri: m.uri }} style={{ width: 86, height: 86 }} contentFit="cover" /> : <Ionicons name="play" size={28} color="#fff" />}
                </Pressable>
              ))}
              {docs > 0 && (
                <View style={{ width: 86, height: 86, borderRadius: 14, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="document-text" size={26} color={t.accent} />
                  <T v="caption" color={t.accent}>
                    {docs} file
                  </T>
                </View>
              )}
            </ScrollView>
          </Card>
        )}

        {(chat.type === 'group' || chat.type === 'channel') && (
          <Card title="Pengaturan grup">
            {chat.inviteCode && (
              <Row
                icon="link"
                title="Tautan undangan"
                subtitle={`Kode: ${chat.inviteCode} — ketuk untuk salin / bagikan`}
                right={isAdmin ? <IconBtn icon="refresh" size={38} onPress={() => { regenerateInvite(chat.id); pushBanner({ title: 'Kode baru dibuat', body: 'Kode lama tidak berlaku lagi.', icon: 'link' }); }} label="Perbarui kode" /> : undefined}
                onPress={() => {
                  Clipboard.setStringAsync(chat.inviteCode!).catch(() => {});
                  Share.share({ message: `Gabung grup "${title}" di Zeroid-whatsapp! Kode undangan: ${chat.inviteCode}` }).catch(() => {});
                }}
              />
            )}
            {chat.type === 'group' && isAdmin && (
              <Row
                icon="timer"
                title="Pesan hilang"
                subtitle={chat.disappearing && chat.disappearing !== 'off' ? `Pesan baru hilang otomatis setelah ${chat.disappearing === '24h' ? '24 jam' : chat.disappearing === '7d' ? '7 hari' : '90 hari'}` : 'Nonaktif — ketuk untuk mengatur'}
                onPress={() => setDisTimer(true)}
              />
            )}
            {chat.type === 'channel' && isAdmin && (
              <Row
                icon="megaphone"
                title="Siapa boleh mengirim"
                subtitle={chat.postPolicy === 'admins' ? 'Hanya admin' : 'Semua pengikut'}
                onPress={() => setPostPolicy(chat.id, chat.postPolicy === 'admins' ? 'everyone' : 'admins')}
              />
            )}
          </Card>
        )}

        {chat.type === 'group' && (
          <Card title={`${chat.members.length} anggota`}>
            {isAdmin && <Row icon="person-add" title="Tambah anggota" onPress={() => (setAddSel([]), setAdding(true))} />}
            {chat.members.map((id) => {
              const u = db.users[id];
              if (!u) return null;
              return (
                <Pressable key={id} onPress={() => id !== me.id && setMemberSel(id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: R.md, backgroundColor: pressed ? t.accentSoft : 'transparent' })}>
                  <Avatar uri={canSee(me, u, u.privacy.profilePhoto) ? u.avatar : null} name={u.name} color={u.color} size={42} online={isOnline(u)} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <T v="body" style={{ fontWeight: '500' }} numberOfLines={1}>
                        {id === me.id ? 'Kamu' : u.name}
                      </T>
                      {/* centang biru SVG resmi di nama anggota */}
                      {(u.blueCheck || u.developer || u.role === 'admin' || u.role === 'developer') && <VerifiedBadge size={13} animate={false} />}
                    </View>
                    <T v="caption" numberOfLines={1}>
                      {u.about}
                    </T>
                  </View>
                  {chat.admins.includes(id) && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: t.accentSoft }}>
                      <T v="caption" color={t.accent} style={{ fontWeight: '700' }}>
                        Admin
                      </T>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </Card>
        )}

        {chat.type === 'direct' && peer && (
          <Card>
            <Row icon="person-circle" title="Lihat profil kontak" subtitle="Lencana, @username, lagu Spotify" onPress={() => nav.navigate('UserProfile', { userId: peer.id })} />
          </Card>
        )}
        <Card>
          {chat.type !== 'global' && chat.type !== 'direct' && chat.type !== 'group' ? null : <Row icon="notifications" title="Bisukan notifikasi" right={<Toggle value={muted} onChange={() => toggleChatFlag(chat.id, 'mutedBy')} />} />}
          <Row icon="star" title="Pesan berbintang" onPress={() => nav.navigate('Starred', { chatId: chat.id })} />
          <Row icon="trash" title="Bersihkan chat" danger onPress={() => setConfirm('clear')} />
          {chat.type === 'direct' && peer && <Row icon={blocked ? 'lock-open' : 'ban'} title={blocked ? `Buka blokir ${peer.name}` : `Blokir ${peer.name}`} danger onPress={() => (blocked ? toggleBlock(peer.id) : setConfirm('block'))} />}
          {chat.type === 'group' && <Row icon="exit" title="Keluar dari grup" danger onPress={() => setConfirm('leave')} />}
        </Card>
      </ScrollView>

      <Sheet
        visible={!!memberSel}
        onClose={() => setMemberSel(null)}
        title={memberSel ? db.users[memberSel]?.name : ''}
        options={
          memberSel
            ? [
                { icon: 'chatbubble', label: 'Kirim pesan', onPress: () => nav.navigate('ChatRoom', { chatId: openDirect(memberSel) }) },
                { icon: 'call', label: 'Telepon', onPress: () => placeCall(nav, openDirect(memberSel), false) },
                ...(isAdmin ? [{ icon: 'shield' as const, label: chat.admins.includes(memberSel) ? 'Hapus sebagai admin' : 'Jadikan admin', onPress: () => toggleAdmin(chat.id, memberSel) }] : []),
                ...(isAdmin ? [{ icon: 'person-remove' as const, label: 'Keluarkan dari grup', danger: true, onPress: () => removeMember(chat.id, memberSel) }] : []),
              ]
            : []
        }
      />

      <Sheet visible={adding} onClose={() => setAdding(false)} title="Tambah anggota">
        {candidates.length === 0 && <T v="sub">Semua pengguna sudah menjadi anggota.</T>}
        {candidates.map((u) => {
          const on = addSel.includes(u.id);
          return (
            <Pressable key={u.id} onPress={() => setAddSel(on ? addSel.filter((x) => x !== u.id) : [...addSel, u.id])} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <Avatar uri={u.avatar} name={u.name} color={u.color} size={40} />
              <T v="body" style={{ flex: 1 }}>
                {u.name}
              </T>
              <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? t.accent : t.faint} />
            </Pressable>
          );
        })}
        <Btn title="Tambahkan" disabled={!addSel.length} style={{ marginTop: 12 }} onPress={() => (addMembers(chat.id, addSel), setAdding(false))} />
      </Sheet>

      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit info">
        <View style={{ gap: 14 }}>
          <NeuInput icon="text" placeholder="Nama" value={name} onChangeText={setName} maxLength={50} />
          <NeuInput icon="document-text" placeholder="Deskripsi" value={desc} onChangeText={setDesc} multiline maxLength={300} />
          <Btn title="Ubah foto" variant="neu" icon="image" onPress={changePhoto} />
          <Btn
            title="Simpan"
            icon="checkmark"
            onPress={() => {
              const patch: { name?: string; description?: string } = {};
              if (name.trim() && name.trim() !== chat.name) patch.name = name.trim();
              if (desc.trim() !== (chat.description ?? '')) patch.description = desc.trim();
              if (Object.keys(patch).length) updateChat(chat.id, patch);
              setEditing(false);
              pushBanner({ title: 'Tersimpan', body: 'Info berhasil diperbarui', icon: 'checkmark-circle' });
            }}
          />
        </View>
      </Sheet>

      <Sheet visible={disTimer} onClose={() => setDisTimer(false)} title="Pesan hilang">
        <T v="caption" color={t.faint} style={{ marginBottom: 10 }}>
          Pesan baru di grup ini akan otomatis terhapus untuk semua anggota setelah jangka waktu yang dipilih.
        </T>
        {([
          { v: 'off', l: 'Nonaktif' },
          { v: '24h', l: '24 jam' },
          { v: '7d', l: '7 hari' },
          { v: '90d', l: '90 hari' },
        ] as const).map((o) => (
          <Pressable
            key={o.v}
            onPress={() => (setDisappearing(chat.id, o.v), setDisTimer(false))}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 6, borderRadius: R.md, backgroundColor: pressed ? t.accentSoft : 'transparent' })}
          >
            <Ionicons name={(chat.disappearing ?? 'off') === o.v ? 'radio-button-on' : 'radio-button-off'} size={22} color={t.accent} />
            <T v="body" style={{ fontWeight: (chat.disappearing ?? 'off') === o.v ? '700' : '400' }}>{o.l}</T>
          </Pressable>
        ))}
      </Sheet>

      <Confirm visible={confirm === 'clear'} title="Bersihkan chat?" body="Semua pesan akan dihapus dari perangkatmu." confirm="Bersihkan" danger onConfirm={() => clearChat(chat.id)} onClose={() => setConfirm(null)} />
      <Confirm visible={confirm === 'block'} title={`Blokir ${peer?.name}?`} body="Kontak yang diblokir tidak dapat menelepon atau mengirim pesan kepadamu." confirm="Blokir" danger onConfirm={() => peer && toggleBlock(peer.id)} onClose={() => setConfirm(null)} />
      <Confirm
        visible={confirm === 'leave'}
        title="Keluar dari grup?"
        confirm="Keluar"
        danger
        onConfirm={() => {
          removeMember(chat.id, me.id);
          nav.navigate('Main');
        }}
        onClose={() => setConfirm(null)}
      />
    </Screen>
  );
}
