/**
 * BannedScreen — layar penuh saat akun diblokir admin (seperti WhatsApp):
 * alasan ban, sisa durasi (hitung mundur untuk ban berwaktu), dan form
 * keterangan banding yang dikirim ke admin. Pengguna tetap bisa logout.
 */
import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ZeroidLogo } from '../lib/icons';
import { T, Btn } from '../components/ui';
import { useTheme, R } from '../lib/theme';
import { User, Appeal } from '../lib/types';
import { banRemaining, submitAppeal, logout } from '../lib/store';

function dur(ms: number): string {
  if (ms <= 0) return 'permanen';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d} hari ${h} jam`;
  if (h > 0) return `${h} jam ${m} menit`;
  if (m > 0) return `${m} menit ${sec} detik`;
  return `${sec} detik`;
}

export default function BannedScreen({ me, appeal }: { me: User; appeal?: Appeal }) {
  const t = useTheme();
  const remain = banRemaining(me);
  const temporary = remain > 0;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(appeal && appeal.status !== 'pending' ? appeal.status : null);
  const [note, setNote] = useState<string | null>(appeal?.adminNote ?? null);
  const [err, setErr] = useState('');
  // countdown lokal — re-render tiap detik hanya saat ban berwaktu
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!temporary) return;
    const iv = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(iv);
  }, [temporary]);

  const send = async () => {
    setSending(true);
    setErr('');
    const r = await submitAppeal(text);
    setSending(false);
    if (r.ok) {
      setSent('pending');
      setNote(null);
    } else setErr(r.error ?? 'Gagal mengirim.');
  };

  const isPermanent = !!me.banned && !temporary;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 26, paddingTop: Platform.OS === 'web' ? 40 : 70, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 520, gap: 16, alignItems: 'center', flexShrink: 1 }}>
        <View style={{ width: 92, height: 92, borderRadius: 30, backgroundColor: t.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ban" size={44} color={t.danger} />
        </View>
        <T v="h1" style={{ textAlign: 'center' }}>Akun kamu diblokir</T>

        <View style={{ width: '100%', borderRadius: R.lg, padding: 18, gap: 10, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Ionicons name="alert-circle" size={18} color={t.warning} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T v="label" style={{ fontWeight: '800' }}>Alasan</T>
              <T v="sub" style={{ marginTop: 2 }}>{me.banReason || 'Pelanggaran aturan komunitas.'}</T>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Ionicons name={temporary ? 'time' : 'lock-closed'} size={18} color={temporary ? t.accent : t.danger} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <T v="label" style={{ fontWeight: '800' }}>Durasi</T>
              <T v="sub" style={{ marginTop: 2 }}>
                {temporary ? `Aktif selama ${dur(banRemaining(me))} — akses otomatis kembali setelah waktu habis.` : 'Blokir permanen dari admin.'}
              </T>
            </View>
          </View>
        </View>

        {temporary && (
          <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
            {(banRemaining(me) / 1000) | 0}s tersisa
          </T>
        )}

        {/* form banding — seperti WhatsApp: tulis masalahmu */}
        {!sent && (
          <View style={{ width: '100%', gap: 10 }}>
            <T v="sub" style={{ textAlign: 'center', fontWeight: '600' }}>
              Merasa ini keliru? Tulis masalahmu — admin akan meninjaunya.
            </T>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Jelaskan masalahnya di sini (mis. aku salah sanksi karena…)"
              placeholderTextColor={t.faint}
              multiline
              maxLength={600}
              style={[{ width: '100%', minHeight: 110, borderRadius: R.md, padding: 14, textAlignVertical: 'top', color: t.text, backgroundColor: t.bg2, fontSize: 14.5, lineHeight: 21 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            />
            {!!err && <T v="caption" color={t.danger}>{err}</T>}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn title="Kirim ke admin" icon="send" loading={sending} disabled={text.trim().length < 10} onPress={send} style={{ flex: 1 }} />
              <Btn title="Keluar" variant="neu" icon="log-out" onPress={() => void logout()} style={{ flex: 1 }} />
            </View>
          </View>
        )}

        {sent === 'pending' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: t.accentSoft }} pointerEvents="none">
            <Ionicons name="hourglass" size={22} color={t.accent} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700' }}>Keterangan terkirim</T>
            <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>
              Admin sedang meninjaunya. Kamu akan diberi tahu lewat notifikasi setelah ada keputusan.
            </T>
          </View>
        )}
        {sent === 'approved' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: 'rgba(20,196,122,0.12)' }} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={22} color={t.success} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700', color: t.success }}>Banding diterima</T>
            {!!note && <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>{note}</T>}
            <T v="caption" color={t.faint}>Keluar lalu masuk lagi jika layar ini belum hilang.</T>
          </View>
        )}
        {sent === 'rejected' && (
          <View style={{ width: '100%', gap: 10 }}>
            <View style={{ borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: t.dangerSoft }} pointerEvents="none">
              <Ionicons name="close-circle" size={22} color={t.danger} />
              <T v="sub" style={{ textAlign: 'center', fontWeight: '700', color: t.danger }}>Banding ditolak</T>
              {!!note && <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>{note}</T>}
            </View>
            <Btn small title="Kirim keterangan ulang" icon="create" onPress={() => (setSent(null), setText(''))} />
          </View>
        )}

        <Btn small variant="ghost" title="Keluar dari akun" icon="log-out" onPress={() => void logout()} />
        <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
          Zeroid WhatsApp · moderasi oleh tim admin
        </T>
      </View>
    </View>
  );
}
