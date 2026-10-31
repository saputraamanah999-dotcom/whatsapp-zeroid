/**
 * BannedScreen — layar penuh saat akun diblokir admin (versi SVG Zeroid).
 *
 * Desain mengikuti gaya layar blokir klasik: avatar + ikon LARANGAN merah
 * (lingkaran + garis miring) di atasnya, judul tegas, daftar keterangan dengan
 * ikon SVG, lalu form banding. Semua teks Bahasa Indonesia.
 *
 *  - BAN SEMENTARA: hitung mundur langsung di layar (jam → menit → detik),
 *    akses kembali OTOMATIS saat waktu habis.
 *  - BAN PERMANEN: akun tidak bisa dipakai lagi; membuat akun baru di
 *    perangkat/IP yang sama juga DITOLAK server (anti evasi) — satu-satunya
 *    jalan minta bantuan admin lewat banding.
 *  - Banding 1x per masa ban (dijaga store + status real-time).
 */
import React, { useEffect, useState } from 'react';
import { View, TextInput, Pressable, Platform } from 'react-native';
import Svg, { Circle, Line, Path, G } from 'react-native-svg';
import { Avatar, T, Btn } from '../components/ui';
import BanGlyph from '../components/BanGlyph';
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

/** Ikon LARANGAN merah (SVG v22 — gradasi + glow, gaya layar blokir) di atas avatar. */
function ProhibitionOverlay({ size = 96 }: { size?: number }) {
  return <BanGlyph size={size} />;
}

/** Ikon perisai (keamanan) untuk baris keterangan. */
function ShieldIcon({ size = 20, color = '#1E6BFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2.5 20 6v5.2c0 5-3.4 9-8 10.3-4.6-1.3-8-5.3-8-10.3V6l8-3.5Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <Path d="m8.6 12 2.4 2.4 4.4-4.8" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Ikon jam untuk blokir berwaktu. */
function ClockIcon({ size = 20, color = '#F5A700' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
      <Path d="M12 7v5.2l3.4 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Ikon gembok untuk blokir permanen. */
function LockIcon({ size = 20, color = '#EA4335' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Z" />
        <Path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
        <Path d="M12 14.2v2.6" />
      </G>
    </Svg>
  );
}

/** Ikon obrolan untuk banding. */
function ChatIcon({ size = 20, color = '#14C47A' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 6.8A2.8 2.8 0 0 1 6.8 4h10.4A2.8 2.8 0 0 1 20 6.8v7.4a2.8 2.8 0 0 1-2.8 2.8H9.6L5.4 20v-3.2A2.8 2.8 0 0 1 4 14.2V6.8Z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
      <Path d="M8 9.5h8M8 12.5h5" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}

export default function BannedScreen({ me, appeal }: { me: User; appeal?: Appeal }) {
  const t = useTheme();
  const remain = banRemaining(me);
  const temporary = remain > 0;
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // FIX SPAM PENINJAUAN — status apa pun (pending/approved/rejected) langsung
  // tampil; form hanya untuk kasus BELUM PERNAH mengirim (1x per masa ban).
  const [sent, setSent] = useState<string | null>(appeal?.status ?? null);
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
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: Platform.OS === 'web' ? 44 : 72, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 520, gap: 18, alignItems: 'center', flexShrink: 1 }}>
        {/* AVATAR + LARANGAN MERAH (SVG, gaya layar blokir) */}
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
            <Avatar uri={me.avatar} name={me.name} color={me.color} size={78} />
            <View style={{ position: 'absolute' }} pointerEvents="none">
              <ProhibitionOverlay size={104} />
            </View>
          </View>
          <T v="h1" style={{ textAlign: 'center', fontSize: 24 }}>Akun ini tidak bisa menggunakan Zeroid</T>
          <T v="sub" color={t.sub} style={{ textAlign: 'center', lineHeight: 21 }}>
            {temporary
              ? 'Sebagian aktivitas akunmu tidak sesuai aturan Zeroid. Kamu bisa memakai akun ini lagi setelah masa blokir selesai.'
              : 'Sebagian aktivitas akunmu tidak sesuai aturan Zeroid, dan akun ini sudah diblokir permanen.'}
          </T>
        </View>

        {/* DAFTAR KETERANGAN (ikon SVG) */}
        <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 14, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <ShieldIcon size={21} color={t.accent} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="label" style={{ fontWeight: '800' }}>Alasan pemblokiran</T>
              <T v="sub" color={t.sub}>{me.banReason || 'Pelanggaran aturan komunitas Zeroid.'}</T>
            </View>
          </View>
          {temporary && (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <ClockIcon size={21} color="#F5A700" />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="label" style={{ fontWeight: '800' }}>Blokir sementara</T>
                <T v="sub" color={t.sub}>Sisa waktu {dur(banRemaining(me))}. Akses kembali OTOMATIS begitu waktu habis — tidak perlu buat akun baru.</T>
              </View>
            </View>
          )}
          {isPermanent && (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <LockIcon size={21} color="#EA4335" />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="label" style={{ fontWeight: '800' }}>Blokir permanen</T>
                <T v="sub" color={t.sub}>Akun ini tidak bisa dipakai lagi. Membuat akun baru di perangkat/internet yang sama juga diblokir server — hanya admin yang bisa membukanya.</T>
              </View>
            </View>
          )}
        </View>

        {temporary && (
          <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
            {(banRemaining(me) / 1000) | 0} detik tersisa
          </T>
        )}

        {/* BANDING — tulis keterangan ke admin (SVG ikon obrolan) */}
        {!sent && (
          <View style={{ width: '100%', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center' }}>
              <ChatIcon size={19} color={t.success} />
              <T v="sub" style={{ fontWeight: '700' }}>Merasa ini keliru?</T>
            </View>
            <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>
              Tulis keteranganmu — hanya admin yang membacanya, dan cukup dikirim satu kali.
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
            <ChatIcon size={22} color={t.accent} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700' }}>Keterangan terkirim</T>
            <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>
              Admin sedang meninjaunya. Kamu akan diberi tahu lewat notifikasi setelah ada keputusan.
            </T>
          </View>
        )}
        {sent === 'approved' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: 'rgba(20,196,122,0.12)' }} pointerEvents="none">
            <ShieldIcon size={22} color={t.success} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700', color: t.success }}>Banding diterima</T>
            {!!note && <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>{note}</T>}
            <T v="caption" color={t.faint}>Keluar lalu masuk lagi jika layar ini belum hilang.</T>
          </View>
        )}
        {sent === 'rejected' && (
          <View style={{ width: '100%', borderRadius: R.lg, padding: 16, gap: 8, alignItems: 'center', backgroundColor: t.dangerSoft }} pointerEvents="none">
            <LockIcon size={22} color={t.danger} />
            <T v="sub" style={{ textAlign: 'center', fontWeight: '700', color: t.danger }}>Banding ditolak</T>
            {!!note && <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>{note}</T>}
            <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>Banding cukup 1x per masa blokir — minta bantuan admin lewat banding baru bila keadaan berubah.</T>
          </View>
        )}

        <Btn small variant="ghost" title="Keluar dari akun" icon="log-out" onPress={() => void logout()} />
        <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
          Zeroid WhatsApp · moderasi oleh tim admin & AI Guard
        </T>
      </View>
    </View>
  );
}
