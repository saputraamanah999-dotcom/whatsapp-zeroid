import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, Avatar, Neu, Row, Card, Segmented, UserBadges } from '../../components/ui';
import MediaPlayer from '../../components/MediaPlayer';
import { Confirm } from '../../components/Sheet';
import { useTheme, useThemeMode, R, ThemeMode } from '../../lib/theme';
import { useStore, logout, setTheme, backendMode, updateMe } from '../../lib/store';

export default function MeTab() {
  const t = useTheme();
  const mode = useThemeMode();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { db, me } = useStore();
  const [askLogout, setAskLogout] = useState(false);
  const [askAdmin, setAskAdmin] = useState(false);
  if (!me) return null;
  const isStaff = ['admin', 'developer'].includes(me.role);
  const starred = Object.values(db.messages).reduce((n, arr) => n + arr.filter((m) => m.starredBy.includes(me.id)).length, 0);

  return (
    <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 18, paddingBottom: 30, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
      <T v="h1" style={{ marginBottom: 18, marginLeft: 2 }}>
        Saya
      </T>
      <Pressable onPress={() => nav.navigate('EditProfile')}>
        <Neu radius={R.xl} style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <Avatar uri={me.avatar} name={me.name} color={me.color} size={70} />
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T v="h2" numberOfLines={1} style={{ flexShrink: 1, fontSize: 21 }}>
                {me.name}
              </T>
              <UserBadges user={me} size={17} />
            </View>
            {!!me.username && (
              <T v="sub" color={t.accent} numberOfLines={1} style={{ fontWeight: '600' }}>
                @{me.username}
              </T>
            )}
            <T v="sub" numberOfLines={1}>
              {me.about}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name={me.verified ? 'checkmark-circle' : 'alert-circle'} size={14} color={me.verified ? t.success : t.warning} />
              <T v="caption" color={me.verified ? t.success : t.warning}>
                {me.email} · {me.verified ? 'terverifikasi' : 'belum verifikasi'}
              </T>
            </View>
          </View>
          <Ionicons name="qr-code" size={22} color={t.accent} />
        </Neu>
      </Pressable>

      {me.spotify && (
        <Card title="Lagu profil">
          <View style={{ padding: 6 }}>
            {/* MediaPlayer: YouTube & Spotify embed — kind:'youtube' dari katalog ZEROID MUSIC */}
            <MediaPlayer track={me.spotify} />
            <Pressable
              onPress={() => (updateMe({ spotify: null }), undefined)}
              style={{ alignSelf: 'flex-end', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: t.bg2 }}
            >
              <T v="caption" color={t.danger} style={{ fontWeight: '700' }}>Hapus lagu profil</T>
            </Pressable>
          </View>
        </Card>
      )}

      {me.role !== 'admin' && (
        <Pressable onPress={() => nav.navigate('Premium')} style={({ pressed }) => ({ marginBottom: 22, borderRadius: R.xl, padding: 18, backgroundColor: t.accent, transform: [{ scale: pressed ? 0.98 : 1 }], boxShadow: '0px 12px 26px rgba(30,107,255,0.35)' } as any)}>
          <T v="h3" color="#fff" style={{ fontSize: 18 }}>
            Zeroid Premium
          </T>
          <T v="sub" color="rgba(255,255,255,0.9)" style={{ marginTop: 4 }}>
            VIP · Member · Centang biru · Keamanan — mulai Rp10.000
          </T>
        </Pressable>
      )}

      <Card title="Akun">
        <Row icon="person-circle" title="Lihat profil saya" subtitle="Lencana, username, lagu Spotify" onPress={() => nav.navigate('UserProfile', { userId: me.id })} />
        <Row icon="person" title="Edit profil" subtitle="Foto, nama tampilan, info" onPress={() => nav.navigate('EditProfile')} />
        <Row icon="lock-closed" title="Privasi" subtitle="Terakhir dilihat, foto profil, tanda dibaca, blokir" onPress={() => nav.navigate('Privacy')} />
        <Row icon="shield-checkmark" title="Keamanan" subtitle={`${me.otpVerified ? 'OTP Gmail terverifikasi' : 'Verifikasi OTP Gmail'}${me.security ? ' · PIN' : ''}`} onPress={() => nav.navigate('Security')} />
        <Row icon="star" title="Pesan berbintang" subtitle={`${starred} pesan`} onPress={() => nav.navigate('Starred')} />
        <Row icon="musical-notes" iconColor="#1DB954" title="Musik" subtitle={me.spotify ? me.spotify.title : 'Spotify & YouTube — pasang di profil'} onPress={() => nav.navigate('Music')} />
        <Row icon="tv" iconColor="#FF7A9C" title="Anime" subtitle="Cari, tonton, favorit & unduh anime" onPress={() => nav.navigate('Anime')} />
        <Row icon="happy" title="Stiker" subtitle="Buat & kelola stiker" onPress={() => nav.navigate('Stickers')} />
      </Card>

      <Card title="Aplikasi">
        <Row icon="notifications" title="Notifikasi" subtitle="Pesan, grup, Story, panggilan" onPress={() => nav.navigate('NotifSettings')} />
        <Row icon="key" title="Izin aplikasi" subtitle="Kamera, mikrofon, notifikasi, media" onPress={() => nav.navigate('Permissions')} />
        <View style={{ padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 4 }}>
            <Ionicons name="color-palette" size={18} color={t.accent} />
            <T v="body" style={{ fontWeight: '500' }}>
              Tema
            </T>
          </View>
          <Segmented<ThemeMode>
            value={mode}
            onChange={setTheme}
            options={[
              { value: 'light', label: 'Terang' },
              { value: 'dark', label: 'Gelap' },
              { value: 'system', label: 'Sistem' },
            ]}
          />
        </View>
      </Card>

      {isStaff && (
        <Card title={me.role === 'developer' ? 'Developer' : 'Administrator'}>
          <Row icon="shield-checkmark" iconColor="#1E9BFF" title="Admin panel" subtitle="Centang biru, pengguna, transaksi, laporan, sistem" onPress={() => setAskAdmin(true)} right={<Ionicons name="chevron-forward" size={18} color={t.faint} />} />
          <Row icon="pulse" title="Status layanan & API" subtitle={`Backend: ${backendMode}`} onPress={() => nav.navigate('ApiStatus')} />
          <View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
            <T v="caption" color={t.faint}>
              {me.role === 'developer'
                ? 'Kamu masuk sebagai akun developer — panel admin aktif untuk akun ini.'
                : 'Akun admin terdeteksi — akses panel terbuka.'}
            </T>
          </View>
        </Card>
      )}

      <Card>
        <Row icon="log-out" title="Keluar" danger onPress={() => setAskLogout(true)} />
      </Card>
      <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
        Zeroid-whatsapp v1.0.0 · com.zeroid.whatsapp
      </T>
      <Confirm visible={askAdmin} title="Masuk ke Admin Panel?" body="Kamu akan masuk ke area administrator. Semua tindakan tercatat." confirm="Masuk" onConfirm={() => nav.navigate('Admin')} onClose={() => setAskAdmin(false)} />
      <Confirm visible={askLogout} title="Keluar dari akun?" body="Kamu bisa masuk lagi kapan saja." confirm="Keluar" danger onConfirm={logout} onClose={() => setAskLogout(false)} />
    </ScrollView>
  );
}
