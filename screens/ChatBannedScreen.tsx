/**
 * ChatBannedScreen — "Grup ini ditangguhkan" ala WhatsApp.
 *
 * Saat grup/saluran dibanned admin ATAU ditangguhkan otomatis oleh AI Guard
 * (konten 18+/spam), SELURUH anggota (termasuk developer) melihat layar ini:
 *  1. Dialog pembuka gaya WA: "Grup ini ditangguhkan — tidak ada anggota yang
 *     bisa mengirim pesan, menambah anggota, mengunduh, atau meneruskan media.
 *     Hanya admin grup yang bisa meminta peninjauan." + OKE + "Hapus grup untuk saya".
 *  2. Layar detail: alasan + sisa durasi (realtime) + PELANGGAR (siapa yang
 *     mengirim — supaya developer bisa langsung mengeksekusi ban) + banding
 *     KHUSUS admin grup + tombol eksekusi untuk developer/admin.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, TextInput, Pressable, Platform, Linking, Modal } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar, T, Btn } from '../components/ui';
import { useTheme, R } from '../lib/theme';
import { Chat, ModOffense } from '../lib/types';
import { chatBanRemaining, submitChatAppeal, adminUnbanChat, adminBan, leaveSuspendedChat, useStore } from '../lib/store';
import { pushBanner } from '../lib/bus';

function dur(ms: number): string {
  if (ms <= 0) return 'permanen';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 86400) % 3600 / 60);
  if (d > 0) return `${d} hari ${h} jam`;
  if (h > 0) return `${h} jam ${m} menit`;
  return `${m} menit`;
}

const RULES_URL = 'https://whatsapp-zeroid.vercel.app/aturan-komunitas';

export default function ChatBannedScreen({ chat, onBack }: { chat: Chat; onBack?: () => void }) {
  const t = useTheme();
  const { me, db } = useStore();
  const isStaff = !!me && ['admin', 'developer'].includes(me.role);
  const isGroupAdmin = !!me && (chat.admins?.includes(me.id) || chat.createdBy === me.id);
  const label = chat.type === 'channel' ? 'Saluran' : chat.type === 'global' ? 'Obrolan global' : 'Grup';
  const temporary = !chat.banned; // banned=false + banUntil di masa depan = berjangka
  const remain = chatBanRemaining(chat);
  const appeal = chat.banAppeal;
  const offense: ModOffense | undefined = chat.modOffense;
  const offender = offense ? db.users[offense.senderId] : undefined;

  const [stage, setStage] = useState<'dialog' | 'detail'>('dialog');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(appeal ? appeal.status : null);
  const [err, setErr] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!temporary) return;
    const iv = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, [temporary]);

  const send = async () => {
    setSending(true);
    setErr('');
    const r = await submitChatAppeal(chat.id, text);
    setSending(false);
    if (r.ok) setSent('pending');
    else setErr(r.error ?? 'Gagal mengirim.');
  };

  const leave = async () => {
    const r = await leaveSuspendedChat(chat.id);
    if (r.ok) {
      pushBanner({ title: `${label} dihapus`, body: `${chat.name ?? label} dihapus untuk kamu — kamu tidak lagi menjadi anggotanya.`, icon: 'checkmark-circle' });
      onBack?.();
    } else pushBanner({ title: 'Gagal', body: r.error ?? 'Coba lagi.', icon: 'alert' });
  };

  const banOffender = () => {
    if (!offense) return;
    adminBan(offense.senderId, `Konten melanggar di ${chat.name ?? label}: ${offense.reason}`, 30 * 86400000);
    pushBanner({ title: 'Pengirim dibanned 30 hari', body: `${offense.senderName} diblokir dari Zeroid — IP & perangkatnya ikut dikunci.`, icon: 'ban' });
  };

  const dialogBody = useMemo(() => (
    <View style={{ width: '100%', maxWidth: 460, borderRadius: 22, padding: 22, gap: 14, backgroundColor: t.bg2, alignItems: 'center' } as any}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="pause-circle" size={38} color={t.danger} />
      </View>
      <T v="h2" style={{ textAlign: 'center' }}>{label} ini ditangguhkan</T>
      <T v="sub" color={t.sub} style={{ textAlign: 'center', lineHeight: 20 }}>
        Tidak ada anggota yang bisa mengirim pesan, menambah anggota, mengunduh, atau meneruskan media. Hanya admin {chat.type === 'channel' ? 'saluran' : 'grup'} yang bisa meminta peninjauan.
      </T>
      <T v="caption" color={t.accent} style={{ fontWeight: '700' }} onPress={() => setRulesOpen(true)}>Pelajari selengkapnya</T>
      <View style={{ width: '100%', gap: 10, marginTop: 4 }}>
        <Btn title="OKE" onPress={() => setStage('detail')} />
        {chat.type !== 'global' && (
          <T v="sub" color={t.danger} style={{ textAlign: 'center', fontWeight: '700', padding: 8 }} onPress={leave}>Hapus {chat.type === 'channel' ? 'saluran' : 'grup'} untuk saya</T>
        )}
      </View>
    </View>
  ), [t, label, chat.type]);

  if (stage === 'dialog') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {dialogBody}
        {!!onBack && (
          <Pressable onPress={onBack} style={{ position: 'absolute', top: Platform.OS === 'web' ? 24 : 64, left: 20 }}>
            <Ionicons name="chevron-back" size={26} color={t.sub} />
          </Pressable>
        )}
        <Modal visible={rulesOpen} transparent animationType="fade" onRequestClose={() => setRulesOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={() => setRulesOpen(false)}>
            <Pressable style={{ width: '100%', maxWidth: 460, borderRadius: 20, padding: 20, gap: 10, backgroundColor: t.bg }} onPress={() => {}}>
              <T v="h3">Aturan komunitas Zeroid</T>
              <T v="sub" color={t.sub}>{'\u2022'} Dilarang menyebarkan konten 18+/porno, kekerasan, atau SARA{'\n'}{'\u2022'} Dilarang spam stiker/pesan dan bom media{'\n'}{'\u2022'} Grup yang melanggar ditangguhkan otomatis oleh AI Guard{'\n'}{'\u2022'} Pengirim konten melanggar diblokir beserta IP/perangkatnya{'\n'}{'\u2022'} Salah sasaran? Admin grup bisa meminta peninjauan.</T>
              <T v="caption" color={t.accent} onPress={() => Linking.openURL(RULES_URL).catch(() => {})}>Buka aturan lengkap di web</T>
              <Btn small variant="ghost" title="Tutup" onPress={() => setRulesOpen(false)} />
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  // ---------- DETAIL ----------
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 22, paddingTop: Platform.OS === 'web' ? 36 : 64, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 560, gap: 14, flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' }}>
          <Avatar uri={chat.avatar ?? null} name={chat.name ?? label} size={50} color={chat.color} />
          <View style={{ flex: 1 }}>
            <T v="h3" numberOfLines={1}>{chat.name ?? label}</T>
            <T v="caption" color={t.sub}>{label} · ditangguhkan</T>
          </View>
        </View>

        <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 12, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Ionicons name={chat.suspendedAuto ? 'shield-half' : 'alert-circle'} size={18} color={chat.suspendedAuto ? t.warning : t.danger} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T v="label" style={{ fontWeight: '800' }}>{chat.suspendedAuto ? 'Alasan (otomatis — AI Guard)' : 'Alasan dari admin'}</T>
              <T v="sub" style={{ marginTop: 2 }}>{(chat.banReason ?? 'Melanggar aturan komunitas.').replace(/^\[AUTO\]\s*/, '')}</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Ionicons name={temporary ? 'time' : 'lock-closed'} size={18} color={temporary ? t.accent : t.danger} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T v="label" style={{ fontWeight: '800' }}>Durasi</T>
              <T v="sub" style={{ marginTop: 2 }}>
                {temporary ? `Aktif selama ${dur(remain)} — penangguhan terbuka otomatis setelah waktu habis.` : 'Blokir permanen — hubungi developer lewat banding.'}
              </T>
            </View>
          </View>
        </View>

        {/* PELANGGAR — siapa yang mengirim konten melanggar (kelihatan semua, eksekusi oleh developer) */}
        {offense && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 14, gap: 12, backgroundColor: t.dangerSoft } as any}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="warning" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <T v="label" style={{ fontWeight: '800', color: t.danger }}>Pelanggar terdeteksi</T>
                <T v="caption" color={t.sub}>AI Guard mencatat pengirim konten bermasalah — tidak perlu mencari manual.</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar uri={offender?.avatar ?? null} name={offense.senderName} size={40} color={offender?.color} />
              <View style={{ flex: 1 }}>
                <T v="sub" style={{ fontWeight: '800' }}>{offense.senderName}{offense.senderUsername ? ` (@${offense.senderUsername})` : ''}</T>
                <T v="caption" color={t.sub}>{offense.kind === 'porn' ? 'Konten 18+/porno' : offense.kind === 'sticker_spam' ? 'Spam stiker' : 'Bom media'} · {new Date(offense.at).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}</T>
                {!!offense.excerpt && <T v="caption" color={t.faint} numberOfLines={2}>"{offense.excerpt}"</T>}
              </View>
            </View>
            {isStaff && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Btn small title={`Ban pengirim 30 hari`} icon="ban" variant="danger" onPress={banOffender} />
                </View>
                <View style={{ flex: 1 }}>
                  <Btn small variant="ghost" title="Buka penangguhan" icon="lock-open" onPress={() => { adminUnbanChat(chat.id); pushBanner({ title: 'Penangguhan dibuka', body: `${chat.name ?? label} aktif kembali.`, icon: 'checkmark-circle' }); }} />
                </View>
              </View>
            )}
          </View>
        )}

        {/* BANDING — ala WhatsApp HANYA admin grup yang bisa meminta peninjauan */}
        {isGroupAdmin && !sent && (
          <View style={{ width: '100%', gap: 10 }}>
            <T v="sub" style={{ textAlign: 'center', fontWeight: '600' }}>
              Sebagai admin {chat.type === 'channel' ? 'saluran' : 'grup'}, kamu bisa meminta peninjauan — tulis masalahnya, developer akan meninjaunya.
            </T>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={`Jelaskan masalahnya (mis. ${chat.name ?? 'grup ini'} dipakai untuk koordinasi kerja, bukan spam…)`}
              placeholderTextColor={t.faint}
              multiline
              maxLength={600}
              style={[{ width: '100%', minHeight: 100, borderRadius: R.md, padding: 14, textAlignVertical: 'top', color: t.text, backgroundColor: t.bg2, fontSize: 14.5, lineHeight: 21 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            />
            {!!err && <T v="caption" color={t.danger}>{err}</T>}
            <Btn title="Minta peninjauan ke developer" icon="send" loading={sending} disabled={text.trim().length < 10} onPress={send} />
          </View>
        )}
        {!isGroupAdmin && !sent && (
          <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
            Hanya admin {chat.type === 'channel' ? 'saluran' : 'grup'} yang bisa meminta peninjauan (ala WhatsApp). Selama itu, pesan tidak bisa dikirim di sini.
          </T>
        )}

        {sent === 'pending' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: t.accentSoft }} pointerEvents="none">
            <Ionicons name="hourglass" size={22} color={t.accent} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700' }}>Permintaan peninjauan terkirim</T>
            <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>Developer sedang meninjaunya. Kamu akan diberi tahu lewat notifikasi.</T>
          </View>
        )}
        {sent === 'approved' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: 'rgba(20,196,122,0.12)' }} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={22} color={t.success} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700', color: t.success }}>Ditinjau — {label.toLowerCase()} dibuka</T>
            {!!appeal?.adminNote && <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>{appeal.adminNote}</T>}
            <T v="caption" color={t.faint}>Buka ulang chat ini bila tampilan belum berubah.</T>
          </View>
        )}
        {sent === 'rejected' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: t.dangerSoft }} pointerEvents="none">
            <Ionicons name="close-circle" size={22} color={t.danger} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700', color: t.danger }}>Permintaan peninjauan ditolak</T>
            {!!appeal?.adminNote && <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>{appeal.adminNote}</T>}
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          {!!onBack && <Btn small variant="ghost" title="Kembali ke daftar chat" icon="chevron-back" onPress={onBack} />}
          {chat.type !== 'global' && (
            <View style={{ flex: 1 }}>
              <T v="caption" color={t.danger} style={{ textAlign: 'center', fontWeight: '700', padding: 6 }} onPress={leave}>Hapus {chat.type === 'channel' ? 'saluran' : 'grup'} untuk saya</T>
            </View>
          )}
        </View>
        <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
          Zeroid WhatsApp · moderasi otomatis AI Guard + tim admin
        </T>
      </View>
    </View>
  );
}
