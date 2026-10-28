/**
 * ChatBannedScreen — layar penuh saat GRUP/SALURAN dibanned admin:
 * menampilkan alasan dari admin + sisa durasi + form banding (ala WhatsApp:
 * "grup ini di ban tolong tinjauan karena masalah kamu ..."). Admin tetap bisa
 * membuka chat dan mengirim pesan sistem; anggota melihat layar ini.
 */
import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar, T, Btn } from '../components/ui';
import { useTheme, R } from '../lib/theme';
import { Chat } from '../lib/types';
import { chatBanRemaining, submitChatAppeal } from '../lib/store';

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

export default function ChatBannedScreen({ chat, onBack }: { chat: Chat; onBack?: () => void }) {
  const t = useTheme();
  const temporary = !chat.banned; // banned=false + banUntil di masa depan = berjangka
  const remain = chatBanRemaining(chat);
  const appeal = chat.banAppeal;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(appeal && appeal.status !== 'pending' ? appeal.status : null);
  const [err, setErr] = useState('');
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

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 26, paddingTop: Platform.OS === 'web' ? 40 : 70, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 520, gap: 16, alignItems: 'center', flexShrink: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' }}>
          <Avatar uri={chat.avatar ?? null} name={chat.name ?? 'Grup'} size={52} color={chat.color} />
          <View style={{ flex: 1 }}>
            <T v="h2" numberOfLines={1}>{chat.name ?? 'Grup'}</T>
            <T v="caption" color={t.sub}>{chat.type === 'channel' ? 'Saluran' : 'Grup'} · ditinjau admin</T>
          </View>
        </View>

        <View style={{ width: 92, height: 92, borderRadius: 30, backgroundColor: t.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ban" size={44} color={t.danger} />
        </View>
        <T v="h1" style={{ textAlign: 'center' }}>{chat.type === 'channel' ? 'Saluran' : 'Grup'} ini dibanned</T>
        <T v="sub" color={t.sub} style={{ textAlign: 'center' }}>
          Grup (nama: {chat.name ?? '—'}) ini di ban oleh admin. Anggota tidak bisa mengirim pesan selama peninjauan.
        </T>

        <View style={{ width: '100%', borderRadius: R.lg, padding: 18, gap: 10, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Ionicons name="alert-circle" size={18} color={t.warning} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T v="label" style={{ fontWeight: '800' }}>Alasan dari admin</T>
              <T v="sub" style={{ marginTop: 2 }}>{chat.banReason || 'Melanggar aturan komunitas.'}</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Ionicons name={temporary ? 'time' : 'lock-closed'} size={18} color={temporary ? t.accent : t.danger} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T v="label" style={{ fontWeight: '800' }}>Durasi</T>
              <T v="sub" style={{ marginTop: 2 }}>
                {temporary ? `Aktif selama ${dur(remain)} — ban terbuka otomatis setelah waktu habis.` : 'Blokir permanen dari admin.'}
              </T>
            </View>
          </View>
        </View>

        {/* banding — tulis masalahnya, admin akan meninjaunya */}
        {!sent && (
          <View style={{ width: '100%', gap: 10 }}>
            <T v="sub" style={{ textAlign: 'center', fontWeight: '600' }}>
              Setuju tidak? Tulis masalah grup/saluran ini — admin akan meninjaunya dan membuka ban bila keliru.
            </T>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Jelaskan masalahnya di sini (mis. grup ini dipakai untuk koordinasi kerja, bukan spam…)"
              placeholderTextColor={t.faint}
              multiline
              maxLength={600}
              style={[{ width: '100%', minHeight: 110, borderRadius: R.md, padding: 14, textAlignVertical: 'top', color: t.text, backgroundColor: t.bg2, fontSize: 14.5, lineHeight: 21 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            />
            {!!err && <T v="caption" color={t.danger}>{err}</T>}
            <Btn title="Kirim banding ke admin" icon="send" loading={sending} disabled={text.trim().length < 10} onPress={send} />
          </View>
        )}

        {sent === 'pending' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: t.accentSoft }} pointerEvents="none">
            <Ionicons name="hourglass" size={22} color={t.accent} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700' }}>Banding terkirim</T>
            <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>
              Admin sedang meninjaunya. Kamu akan diberi tahu lewat notifikasi setelah ada keputusan.
            </T>
          </View>
        )}
        {sent === 'approved' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: 'rgba(20,196,122,0.12)' }} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={22} color={t.success} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700', color: t.success }}>Banding diterima — grup dibuka</T>
            {!!appeal?.adminNote && <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>{appeal.adminNote}</T>}
            <T v="caption" color={t.faint}>Buka ulang chat ini bila tampilan belum berubah.</T>
          </View>
        )}
        {sent === 'rejected' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: t.dangerSoft }} pointerEvents="none">
            <Ionicons name="close-circle" size={22} color={t.danger} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700', color: t.danger }}>Banding ditolak</T>
            {!!appeal?.adminNote && <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>{appeal.adminNote}</T>}
          </View>
        )}

        {!!onBack && <Btn small variant="ghost" title="Kembali ke daftar chat" icon="chevron-back" onPress={onBack} />}
        <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
          Zeroid WhatsApp · moderasi oleh tim admin
        </T>
      </View>
    </View>
  );
}
