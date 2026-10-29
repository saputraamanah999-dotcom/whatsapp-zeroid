import React, { useEffect, useState } from 'react';
import { View, ScrollView, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Header, Screen, T, Neu, Card, Btn, Row, Empty } from '../components/ui';
import { useStore } from '../lib/store';
import { useTheme, R } from '../lib/theme';
import { askAI } from '../lib/ai';
import { proxyGet, API_BASE } from '../lib/proxy';
import { firebaseConfig, isFirebaseConfigured, googleAuthConfigured, phoneAuthConfigured } from '../lib/firebase';
import { webrtcAvailable, signalingMode, ICE_SERVERS } from '../lib/webrtc';
import { getPermission } from '../lib/permissions';

type Probe = { name: string; ok: boolean | null; detail: string; ms?: number };

export default function ApiStatus() {
  const t = useTheme();
  const { me } = useStore();
  const [probes, setProbes] = useState<Probe[]>([]);
  const [running, setRunning] = useState(false);
  const [aiQ, setAiQ] = useState('Halo, kamu siapa?');
  const [aiA, setAiA] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [perm, setPerm] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => setPerm({ mic: await getPermission('microphone'), cam: await getPermission('camera'), notif: await getPermission('notifications') }))();
  }, []);

  const runAll = async () => {
    setRunning(true);
    const out: Probe[] = [];
    // 1) AI proxy health (GET /api/ai)
    {
      const t0 = Date.now();
      try {
        const r = await proxyGet('/api/ai');
        out.push({ name: 'Proxy AI (/api/ai)', ok: r.ok, detail: r.data?.configured ? 'Kunci JEREXD terpasang di server' : 'Server berjalan, kunci JEREXD belum diset (env JEREXD_APIKEY)', ms: Date.now() - t0 });
      } catch (e: any) {
        out.push({ name: 'Proxy AI (/api/ai)', ok: false, detail: e?.message ?? 'Tidak terjangkau' });
      }
    }
    // 1b) content proxy health (GET /api/jere)
    {
      const t0 = Date.now();
      try {
        const r = await proxyGet('/api/jere');
        out.push({ name: 'Proxy Musik/Anime (/api/jere)', ok: r.ok, detail: r.data?.configured ? 'Kunci JEREXD terpasang di server' : 'Server berjalan, kunci JEREXD belum diset (env JEREXD_APIKEY)', ms: Date.now() - t0 });
      } catch (e: any) {
        out.push({ name: 'Proxy Musik/Anime (/api/jere)', ok: false, detail: e?.message ?? 'Tidak terjangkau' });
      }
    }
    out.push({ name: 'Target proxy', ok: true, detail: API_BASE ? API_BASE : 'same-origin (relatif /api — deploy lewat Vercel)' });
    // 2) Firestore read smoke test
    {
      const t0 = Date.now();
      try {
        const fb = await import('../lib/firebase').then((m) => m.firebase());
        if (!fb) out.push({ name: 'Firestore', ok: false, detail: 'Firebase belum dikonfigurasi' });
        else {
          const { doc, getDoc } = await import('firebase/firestore');
          await getDoc(doc(fb.db, 'config', 'platform'));
          out.push({ name: 'Firestore read', ok: true, detail: `project ${firebaseConfig.projectId}`, ms: Date.now() - t0 });
        }
      } catch (e: any) {
        out.push({ name: 'Firestore read', ok: false, detail: String(e?.code ?? e?.message ?? e) });
      }
    }
    // 3) WebRTC
    out.push({ name: 'WebRTC', ok: webrtcAvailable, detail: webrtcAvailable ? `STUN/TURN: ${ICE_SERVERS.length} server` : 'Tidak tersedia (Expo Go) — gunakan dev build' });
    out.push({ name: 'Signaling', ok: signalingMode.includes('Firestore'), detail: signalingMode });
    setProbes(out);
    setRunning(false);
  };

  const Status = ({ ok, label }: { ok: boolean | null; label: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ok === null ? t.warning : ok ? t.success : t.warning }} />
      <T v="caption" color={ok ? t.success : t.warning} style={{ fontWeight: '600' }}>{label}</T>
    </View>
  );

  if (!me?.developer && me?.role !== 'developer' && me?.role !== 'admin')
    return (
      <Screen>
        <Header title="Status layanan" />
        <Empty icon="code-slash" title="Khusus admin/developer" body="Halaman ini hanya tersedia untuk akun developer atau admin." />
      </Screen>
    );

  return (
    <Screen>
      <Header title="Status layanan" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Card title={`Firebase · ${firebaseConfig.projectId}`}>
          <Row icon="flame" iconColor="#FF9F0A" title="Konfigurasi web app" subtitle={isFirebaseConfigured ? 'EXPO_PUBLIC_FIREBASE_* lengkap' : 'API key/appId belum diset (.env)'} chevron={false} right={<Status ok={isFirebaseConfigured} label={isFirebaseConfigured ? 'Terhubung' : 'Perlu konfigurasi'} />} />
          <Row icon="person" title="Authentication" subtitle={`Email/password${googleAuthConfigured ? ' + Google' : ''}${phoneAuthConfigured ? ' + Phone OTP' : ''} · reset & verifikasi email`} chevron={false} />
          <Row icon="server" title="Database & Penyimpanan" subtitle={`Proyek: ${firebaseConfig.projectId}`} chevron={false} />
          <Row icon="notifications" title="Cloud Messaging" subtitle="Token tersimpan di fcm_tokens/{uid}; FCM dikirim oleh Cloud Functions" chevron={false} />
        </Card>

        <Card title="Diagnostik runtime">
          <View style={{ padding: 10, gap: 10 }}>
            {probes.map((p) => (
              <Neu key={p.name} inset radius={R.md} style={{ padding: 12, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: p.ok ? t.success : t.danger }}>
                    <T v="caption" color="#fff" style={{ fontWeight: '800' }}>{p.ok === null ? '…' : p.ok ? 'OK' : 'GAGAL'}</T>
                  </View>
                  <T v="sub" style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{p.name}</T>
                  {p.ms != null && <T v="caption">{p.ms} ms</T>}
                </View>
                <T v="caption" selectable>{p.detail}</T>
              </Neu>
            ))}
            <Btn small title={running ? 'Menguji…' : 'Jalankan diagnostik'} icon="refresh" loading={running} onPress={runAll} />
          </View>
        </Card>

        <Card title="WebRTC & perangkat">
          <Row icon="videocam" title="RTCPeerConnection" subtitle={webrtcAvailable ? 'Tersedia' : 'Tidak tersedia (Expo Go) — gunakan dev build'} chevron={false} right={<Status ok={webrtcAvailable} label={webrtcAvailable ? 'OK' : 'N/A'} />} />
          <Row icon="git-network" title="Signaling" subtitle={signalingMode} chevron={false} />
          <Row icon="mic" title="Izin mikrofon / kamera / notifikasi" subtitle={`${perm.mic ?? '…'} / ${perm.cam ?? '…'} / ${perm.notif ?? '…'}`} chevron={false} />
        </Card>

        <Card title="Uji asisten AI (via proxy server)">
          <View style={{ padding: 12, gap: 12 }}>
            <T v="caption" color={t.faint}>Permintaan dikirim ke /api/ai (server-side). Kunci JEREXD tidak pernah berada di aplikasi.</T>
            <Btn small title="Tanya" icon="send" loading={aiBusy} onPress={async () => {
              setAiBusy(true);
              setAiA('…');
              try {
                const r = await askAI(aiQ);
                setAiA(r.text);
              } catch (e: any) {
                setAiA(`Gagal: ${e?.message ?? e}`);
              } finally {
                setAiBusy(false);
              }
            }} />
            {!!aiA && (
              <Neu inset radius={R.md} style={{ padding: 12 }}>
                <T v="caption" selectable>{aiA}</T>
              </Neu>
            )}
          </View>
        </Card>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 6 }}>
          <Ionicons name="information-circle" size={16} color={t.faint} />
          <T v="caption" color={t.faint} style={{ flex: 1 }}>
            Catatan: hasil diagnostik hanya berlaku untuk lingkungan tempat aplikasi berjalan. Pengujian menyeluruh tercantum di docs/TESTING.md.
          </T>
        </View>
      </ScrollView>
    </Screen>
  );
}
