import React, { useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { Header, Screen, Avatar, T, Neu, Card, NeuInput, Btn, Empty, Segmented, Row } from '../components/ui';
import { Confirm, Sheet } from '../components/Sheet';
import { UserBadges } from '../components/ui';
import { ProductIcon } from '../lib/icons';
import { productOf, rupiah } from '../lib/products';
import { useTheme, R } from '../lib/theme';
import {
  useStore, adminBan, adminUnban, adminSetRole, adminVerify, adminBroadcast, adminEndAnnouncement, adminResolveReport,
  adminDeleteStory, adminToggleBlueCheck, adminDecideOrder, adminSetVip, adminToggleMaintenance, sendOtp, confirmOtp,
  isOnline, activeStories, messagePreview, backendMode, adminDecideAppeal, bannedNow, banRemaining, mutedRemaining,
  adminBanChat, adminUnbanChat, adminDecideChatAppeal, adminVerifyChat, adminUnverifyChat,
  adminSetMuteOff, adminMessageAll, adminBotBroadcast, chatBannedNow, chatBanRemaining, chatVerified, chatBadge,
} from '../lib/store';
import { useBackendHealth, healthLabel, supabaseStatus } from '../lib/health';
import { firebase, firebaseConfig } from '../lib/firebase';
import { proxyPost } from '../lib/proxy';
import { ago } from '../lib/format';
import { pushBanner } from '../lib/bus';

type Tab = 'overview' | 'users' | 'chats' | 'orders' | 'reports' | 'appeals' | 'content' | 'system';

/** pilihan durasi ban (jam/hari) — 0 = permanen */
const BAN_DURATIONS: { label: string; ms: number }[] = [
  { label: '1 jam', ms: 3600_000 },
  { label: '6 jam', ms: 6 * 3600_000 },
  { label: '12 jam', ms: 12 * 3600_000 },
  { label: '1 hari', ms: 86400_000 },
  { label: '3 hari', ms: 3 * 86400_000 },
  { label: '7 hari', ms: 7 * 86400_000 },
  { label: '30 hari', ms: 30 * 86400_000 },
  { label: 'Permanen', ms: 0 },
];

/** Monitoring backend: Firebase kesehatan + fallback Supabase + FCM (admin panel). */
function MonitoringCard() {
  const t = useTheme();
  const h = useBackendHealth();
  const st = healthLabel(h);
  const color = st.color === 'ok' ? t.success : st.color === 'warn' ? t.warning : t.danger;
  const fcmConfigured = !!String(process.env.FCM_SERVER_KEY ?? '').length; // server-side key tak terlihat client; tampilkan hint saja
  return (
    <Card title="Monitoring backend">
      <View style={{ padding: 10, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
          <T v="sub" style={{ flex: 1, fontWeight: '700' }}>{st.text}</T>
        </View>
        <T v="caption">Backend utama: {backendMode}</T>
        <T v="caption">Cadangan (Supabase): {supabaseStatus()} — media besar & AI proxy otomatis lewat Supabase saat Firebase limit/berat.</T>
        <T v="caption">Notifikasi FCM: dijalankan server ({fcmConfigured ? 'env server terdeteksi' : 'FCM_SERVER_KEY di Vercel env'}) — push luar aplikasi untuk pesan, panggilan, story developer & broadcast.</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <T v="caption" style={{ backgroundColor: t.bg2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>permission-denied: {h.counts['permission-denied']}</T>
          <T v="caption" style={{ backgroundColor: t.bg2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>kuota/limit: {h.counts.quota}</T>
          <T v="caption" style={{ backgroundColor: t.bg2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>jaringan: {h.counts.unavailable}</T>
          <T v="caption" style={{ backgroundColor: t.bg2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>lainnya: {h.counts.other}</T>
        </View>
        {!!h.lastCode && (
          <T v="caption" color={t.faint} style={{ lineHeight: 16 }}>
            Error terakhir [{h.lastCode}]: {h.lastMessage || '-'}
          </T>
        )}
        <T v="caption" color={t.faint}>Kalau kuota Firebase harian habis (resource-exhausted), aplikasi otomatis menandai mode cadangan: upload media & layanan AI tetap jalan via Supabase/server sendiri.</T>
      </View>
    </Card>
  );
}

export default function AdminScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { db, me, config } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const [q, setQ] = useState('');
  const [vipFor, setVipFor] = useState<string | null>(null);
  const [vipDays, setVipDays] = useState('30');
  const [askBan, setAskBan] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banMs, setBanMs] = useState<number>(0);
  const [otpFor, setOtpFor] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpMsg, setOtpMsg] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annLevel, setAnnLevel] = useState<'info' | 'warning' | 'critical'>('info');
  const [annPopup, setAnnPopup] = useState(true);
  const [annDays, setAnnDays] = useState('3');
  const [maintMsg, setMaintMsg] = useState('');
  const [askBanChat, setAskBanChat] = useState<string | null>(null);
  const [chatBanReason, setChatBanReason] = useState('');
  const [chatBanMs, setChatBanMs] = useState<number>(86400_000);
  const [askVerifyChat, setAskVerifyChat] = useState<string | null>(null);
  const [verifyDays, setVerifyDays] = useState(30);
  const [seedMsg, setSeedMsg] = useState('');
  const [seedBusy, setSeedBusy] = useState(false);
  const [allMsg, setAllMsg] = useState('');
  const [allBusy, setAllBusy] = useState(false);
  const [botMsg, setBotMsg] = useState('');
  const [botBusy, setBotBusy] = useState(false);

  const stats = useMemo(() => {
    const users = Object.values(db.users);
    const allMsgs = Object.values(db.messages).flat();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 7 }, (_, i) => {
      const s = new Date(dayStart.getTime() - (6 - i) * 86400000);
      const e = s.getTime() + 86400000;
      return { label: s.toLocaleDateString('id-ID', { weekday: 'short' }), n: allMsgs.filter((m) => m.createdAt >= s.getTime() && m.createdAt < e).length };
    });
    return {
      users: users.length,
      online: users.filter((u) => isOnline(u)).length,
      banned: users.filter((u) => u.banned).length,
      msgs: allMsgs.length,
      today: allMsgs.filter((m) => m.createdAt >= dayStart.getTime()).length,
      groups: Object.values(db.chats).filter((c) => c.type === 'group').length,
      channels: Object.values(db.chats).filter((c) => c.type === 'channel').length,
      stories: activeStories(db).length,
      calls: db.calls.length,
      days,
    };
  }, [db]);

  if (!me || !['admin', 'developer'].includes(me.role))
    return (
      <Screen>
        <Header title="Admin panel" />
        <Empty icon="lock-closed-outline" title="Akses ditolak" body="Halaman ini hanya untuk administrator." />
      </Screen>
    );

  const users = Object.values(db.users)
    .filter((u) => !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()) || (u.username ?? '').includes(q.toLowerCase()) || u.id.includes(q))
    .sort((a, b) => b.createdAt - a.createdAt);
  const maxDay = Math.max(1, ...stats.days.map((d) => d.n));
  const pendingOrders = db.orders.filter((o) => o.status === 'pending').length;
  const openReports = db.reports.filter((r) => !r.resolved).length;
  const openAppeals = db.appeals.filter((a) => a.status === 'pending').length;
  const chatTargets = Object.values(db.chats).filter((c) => c.type === 'group' || c.type === 'channel' || c.type === 'global');
  const chatBannedCount = chatTargets.filter((c) => chatBannedNow(c)).length;
  const pendingChatAppeals = chatTargets.filter((c) => c.banAppeal?.status === 'pending');

  const runSeedSupabase = async () => {
    setSeedBusy(true);
    setSeedMsg('');
    try {
      const token = await firebase()?.auth.currentUser?.getIdToken();
      if (!token) throw new Error('Belum masuk — login ulang sebagai admin.');
      const r = await proxyPost<{ ok: boolean; message?: string; error?: string }>('/api/supabase-seed', { token }, 60000);
      setSeedMsg(r.ok ? `✅ ${r.message ?? 'Seed selesai.'}` : `❌ ${r.error ?? 'Seed gagal.'}`);
    } catch (e: any) {
      setSeedMsg(`❌ ${String(e?.message ?? 'Gagal menghubungi server.').slice(0, 160)}`);
    } finally {
      setSeedBusy(false);
    }
  };

  const Stat = ({ icon, label, value, color }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: number; color: string }) => (
    <Neu radius={R.lg} style={{ flexBasis: '47%', flexGrow: 1, padding: 16, gap: 10 }}>
      <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <T v="h2">{value}</T>
      <T v="caption">{label}</T>
    </Neu>
  );

  return (
    <Screen>
      <Header title="Admin panel" subtitle={`Backend: ${backendMode}`} />
      {/* tab pill yang bisa digulir — rapi & responsif di HP (tidak numpuk lagi) */}
      <View style={{ paddingBottom: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8, alignItems: 'center' }}>
          {([
            ['overview', 'Info'],
            ['users', 'User'],
            ['chats', `Grup${chatBannedCount ? ` ${chatBannedCount}` : ''}`],
            ['orders', `Order${pendingOrders ? ` ${pendingOrders}` : ''}`],
            ['reports', `Lapor${openReports ? ` ${openReports}` : ''}`],
            ['appeals', `Banding${openAppeals ? ` ${openAppeals}` : ''}`],
            ['content', 'Konten'],
            ['system', 'Sistem'],
          ] as [Tab, string][]).map(([k, l]) => {
            const on = tab === k;
            return (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                style={({ pressed }) => ({ paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? t.accent : t.bg, boxShadow: on ? '0px 6px 14px rgba(30,107,255,0.3)' : pressed ? t.insetSm : t.raisedSm, opacity: pressed ? 0.9 : 1 } as any)}
              >
                <T v="sub" color={on ? '#fff' : t.sub} style={{ fontWeight: '700' }}>{l}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        {tab === 'overview' && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
              <Stat icon="people" label={`Pengguna · ${stats.online} online`} value={stats.users} color={t.accent} />
              <Stat icon="chatbubbles" label={`Pesan · ${stats.today} hari ini`} value={stats.msgs} color="#7B61FF" />
              <Stat icon="people-circle" label={`Grup · ${stats.channels} channel`} value={stats.groups} color="#14C47A" />
              <Stat icon="aperture" label="Story aktif" value={stats.stories} color="#FF5A8A" />
              <Stat icon="call" label="Total panggilan" value={stats.calls} color="#FF9F0A" />
              <Stat icon="ban" label="Diblokir admin" value={stats.banned} color={t.danger} />
            </View>
            <Card title="Pesan 7 hari terakhir">
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 170, padding: 14 }}>
                {stats.days.map((d, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <T v="caption" style={{ fontSize: 10 }}>{d.n}</T>
                    <View style={{ width: '70%', height: Math.max(6, (d.n / maxDay) * 110), borderRadius: 8, backgroundColor: i === 6 ? t.accent : t.accentSoft }} />
                    <T v="caption" style={{ fontSize: 10 }}>{d.label}</T>
                  </View>
                ))}
              </View>
            </Card>
            <Card title="Pengumuman global">
              <View style={{ padding: 10, gap: 12 }}>
                <NeuInput icon="megaphone" placeholder="Judul pengumuman" value={annTitle} onChangeText={setAnnTitle} maxLength={80} />
                <NeuInput icon="document-text" placeholder="Isi pengumuman…" value={annBody} onChangeText={setAnnBody} multiline maxLength={500} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Segmented value={annLevel} onChange={setAnnLevel} options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Penting' }, { value: 'critical', label: 'Kritis' }]} />
                  </View>
                  <NeuInput placeholder="Hari aktif" value={annDays} onChangeText={(s) => setAnnDays(s.replace(/\D/g, ''))} keyboardType="number-pad" containerStyle={{ width: 110 }} />
                </View>
                <Pressable onPress={() => setAnnPopup(!annPopup)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 }}>
                  <Ionicons name={annPopup ? 'checkbox' : 'square-outline'} size={20} color={t.accent} />
                  <T v="sub">Tampilkan sebagai banner di atas aplikasi</T>
                </Pressable>
                <Btn
                  title="Terbitkan pengumuman"
                  icon="send"
                  disabled={!annTitle.trim() || !annBody.trim()}
                  onPress={async () => {
                    await adminBroadcast(annTitle.trim(), annBody.trim(), annLevel, annPopup, Math.max(1, parseInt(annDays || '3', 10)));
                    setAnnTitle(''); setAnnBody('');
                  }}
                />
                {(db.announcements ?? []).filter((a) => a.activeUntil > Date.now()).map((a) => (
                  <Row key={a.id} icon="megaphone" title={a.title} subtitle={`${a.level} · aktif hingga ${new Date(a.activeUntil).toLocaleDateString('id-ID')}`} right={<Btn small variant="ghost" title="Akhiri" onPress={() => adminEndAnnouncement(a.id)} />} />
                ))}
              </View>
            </Card>
            <Card title="Kirim pesan ke SEMUA user (satu klik)">
              <View style={{ padding: 10, gap: 12 }}>
                <T v="sub">Pesan langsung (DM) terkirim ke chat pribadi setiap pengguna + notifikasi + push FCM. Batas 60 user per klik — klik lagi untuk sisa user berikutnya.</T>
                <NeuInput icon="chatbubbles" placeholder="Tulis pesan untuk semua pengguna…" value={allMsg} onChangeText={setAllMsg} multiline maxLength={500} />
                <Btn
                  title={allBusy ? 'Mengirim…' : 'Kirim ke semua user'}
                  icon="megaphone"
                  loading={allBusy}
                  disabled={!allMsg.trim()}
                  onPress={async () => {
                    setAllBusy(true);
                    const r = await adminMessageAll(allMsg.trim());
                    setAllBusy(false);
                    if (r.error) pushBanner({ title: 'Broadcast gagal', body: r.error, icon: 'alert' });
                    else setAllMsg('');
                  }}
                />
                <T v="label" style={{ fontWeight: '800', marginTop: 6 }}>Info update dari bot Zeroid AI</T>
                <T v="sub">Bot Zeroid AI mengabarkan update/berita baru ke chat AI setiap pengguna supaya mereka tahu info terbaru.</T>
                <NeuInput icon="sparkles" placeholder="Info update yang disebar bot Zeroid AI…" value={botMsg} onChangeText={setBotMsg} multiline maxLength={500} />
                <Btn
                  small
                  variant="neu"
                  title={botBusy ? 'Mengirim…' : 'Sebar info via Zeroid AI'}
                  icon="sparkles"
                  loading={botBusy}
                  disabled={!botMsg.trim()}
                  onPress={async () => {
                    setBotBusy(true);
                    const r = await adminBotBroadcast(botMsg.trim());
                    setBotBusy(false);
                    if (r.error) pushBanner({ title: 'Bot broadcast gagal', body: r.error, icon: 'alert' });
                    else setBotMsg('');
                  }}
                />
              </View>
            </Card>
          </>
        )}

        {tab === 'users' && (
          <>
            <NeuInput icon="search" placeholder="Cari nama, email, username, atau UID" value={q} onChangeText={setQ} autoCapitalize="none" containerStyle={{ marginBottom: 16 }} />
            {users.map((u) => (
              <Neu key={u.id} radius={R.lg} style={{ padding: 14, marginBottom: 12, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar uri={u.avatar} name={u.name} color={u.color} size={46} online={isOnline(u)} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <T v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{u.name}</T>
                      <UserBadges user={u} />
                      {u.banned && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.danger }}>
                          <T v="caption" color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>BANNED</T>
                        </View>
                      )}
                      {u.role !== 'user' && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.accent }}>
                          <T v="caption" color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>{u.role.toUpperCase()}</T>
                        </View>
                      )}
                    </View>
                    <T v="caption" numberOfLines={1}>
                      {u.username ? `@${u.username} · ` : ''}{u.email} · {(u.vipUntil ?? 0) > Date.now() ? `VIP s/d ${new Date(u.vipUntil!).toLocaleDateString('id-ID')}` : 'non-VIP'} · aktif {ago(u.lastSeen)}
                    </T>
                  </View>
                </View>
                {u.id !== me.id && (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    <Btn small variant={bannedNow(u) ? 'primary' : 'danger'} icon={bannedNow(u) ? 'lock-open' : 'ban'} title={bannedNow(u) ? (banRemaining(u) > 0 ? 'Cabut sanksi' : 'Unban') : 'Ban'} onPress={() => (setAskBan(u.id), setBanReason(''), setBanMs(bannedNow(u) ? -1 : 86400_000))} style={{ height: 36 }} />
                    <Btn small variant="neu" icon="diamond" title="VIP" onPress={() => (setVipFor(u.id), setVipDays('30'))} style={{ height: 36 }} />
                    {!u.verified && <Btn small variant="neu" icon="checkmark-circle" title="Verifikasi" onPress={() => adminVerify(u.id)} style={{ height: 36 }} />}
                    <Btn small variant={u.blueCheck ? 'neu' : 'primary'} icon="checkmark-circle" title={u.blueCheck ? 'Cabut centang' : 'Centang biru'} onPress={() => adminToggleBlueCheck(u.id)} style={{ height: 36 }} />
                    {!u.otpVerified && <Btn small variant="neu" icon="mail" title="OTP Gmail" onPress={() => (setOtpFor(u.id), setOtpCode(''), setOtpMsg(''))} style={{ height: 36 }} />}
                  </View>
                )}
                {bannedNow(u) && (
                  <T v="caption" color={t.danger}>
                    Diblokir{u.banReason ? ` — ${u.banReason}` : ''}{banRemaining(u) > 0 ? ` · sisa ${Math.ceil(banRemaining(u) / 3600000)} jam` : ' · permanen'}
                  </T>
                )}
                {mutedRemaining(u) > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <T v="caption" color={t.warning} style={{ flex: 1 }}>
                      AI Anti-Spam: dibatasi {Math.ceil(mutedRemaining(u) / 60000)} menit lagi (terdeteksi spam berlebihan)
                    </T>
                    <Btn small variant="ghost" icon="lock-open" title="Buka batasan" onPress={() => adminSetMuteOff(u.id)} style={{ height: 32 }} />
                  </View>
                )}
                {u.id !== me.id && (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {(['user', 'moderator', 'admin'] as const).map((r) => (
                      <Btn key={r} small variant={u.role === r ? 'primary' : 'ghost'} title={r} onPress={() => adminSetRole(u.id, r)} style={{ height: 32 }} />
                    ))}
                  </View>
                )}
              </Neu>
            ))}
          </>
        )}

        {tab === 'chats' && (
          <>
            {/* banding grup yang menunggu tinjauan */}
            {pendingChatAppeals.length > 0 && (
              <Card title={`Banding grup/saluran menunggu · ${pendingChatAppeals.length}`}>
                {pendingChatAppeals.map((c) => (
                  <Neu key={c.id} inset radius={R.md} style={{ padding: 12, marginTop: 10, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="mail-open" size={15} color={t.warning} />
                      <T v="h3" style={{ flex: 1, fontSize: 14 }}>{c.name ?? c.id}</T>
                      <T v="caption">oleh {c.banAppeal?.byName ?? db.users[c.banAppeal?.by ?? '']?.name ?? '-'}</T>
                    </View>
                    <T v="body">{c.banAppeal?.message}</T>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn small icon="checkmark" title="Setuju — buka ban" onPress={() => adminDecideChatAppeal(c.id, true)} style={{ flex: 1 }} />
                      <Btn small variant="danger" title="Tolak" onPress={() => adminDecideChatAppeal(c.id, false)} style={{ flex: 1 }} />
                    </View>
                  </Neu>
                ))}
              </Card>
            )}
            <Card title={`Grup, saluran & global · ${chatTargets.length}`}>
              {chatTargets.map((c) => {
                const banned = chatBannedNow(c);
                const verified = chatVerified(c);
                return (
                  <Neu key={c.id} radius={R.md} style={{ padding: 12, marginTop: 10, gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Avatar uri={c.avatar ?? null} name={c.name ?? c.id} size={40} color={c.color} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <T v="h3" numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>{c.name ?? c.id}</T>
                          {verified && <Ionicons name="checkmark-circle" size={14} color={t.accent} />}
                        </View>
                        <T v="caption" numberOfLines={1}>
                          {c.type} · {c.members.length} anggota
                          {verified && (c.verifiedUntil ?? 0) > Date.now() ? ` · centang biru ${Math.ceil(((c.verifiedUntil ?? 0) - Date.now()) / 86400000)}h lagi` : verified ? ' · centang biru permanen' : ''}
                        </T>
                      </View>
                      {banned && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.danger }}>
                          <T v="caption" color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>BANNED</T>
                        </View>
                      )}
                    </View>
                    {banned && (
                      <T v="caption" color={t.danger}>
                        Dibanned{c.banReason ? ` — ${c.banReason}` : ''}{chatBanRemaining(c) > 0 ? ` · sisa ${Math.ceil(chatBanRemaining(c) / 3600000)} jam` : ' · permanen'}
                      </T>
                    )}
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      <Btn small variant={banned ? 'primary' : 'danger'} icon={banned ? 'lock-open' : 'ban'} title={banned ? 'Buka ban' : 'Ban'} onPress={() => (banned ? adminUnbanChat(c.id) : (setAskBanChat(c.id), setChatBanReason(''), setChatBanMs(86400_000)))} style={{ height: 34 }} />
                      <Btn small variant={verified ? 'neu' : 'primary'} icon="checkmark-circle" title={verified ? 'Atur centang' : 'Centang biru'} onPress={() => (setAskVerifyChat(c.id), setVerifyDays(30))} style={{ height: 34 }} />
                      <Btn small variant="ghost" icon="chatbubbles" title="Buka" onPress={() => nav.navigate('ChatRoom', { chatId: c.id })} style={{ height: 34 }} />
                    </View>
                  </Neu>
                );
              })}
            </Card>
          </>
        )}

        {tab === 'orders' && (
          <>
            {db.orders.length === 0 && <Empty icon="receipt-outline" title="Belum ada transaksi" body="Pesanan VIP, Member, Centang biru, dan Keamanan akan muncul di sini." />}
            {db.orders.map((o) => {
              const p = productOf(o.product);
              const buyer = db.users[o.userId];
              return (
                <Neu key={o.id} radius={R.lg} style={{ padding: 16, marginBottom: 12, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: p.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                      <ProductIcon k={p.icon} size={20} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="h3" style={{ fontSize: 15 }}>{p.title} · {o.plan}</T>
                      <T v="caption">{buyer?.name ?? o.userId} · {o.method} · {ago(o.createdAt)}</T>
                    </View>
                    <T v="h3" color={p.color}>{rupiah(o.price)}</T>
                  </View>
                  {o.status === 'pending' ? (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn small icon="checkmark" title="Konfirmasi" onPress={() => adminDecideOrder(o.id, true)} style={{ flex: 1 }} />
                      <Btn small variant="neu" title="Tolak" onPress={() => adminDecideOrder(o.id, false)} style={{ flex: 1 }} />
                    </View>
                  ) : (
                    <T v="sub" color={o.status === 'paid' ? t.success : t.danger}>
                      {o.status === 'paid' ? 'Lunas — fitur sudah aktif' : 'Ditolak'}
                    </T>
                  )}
                  <Btn small variant="ghost" icon="chatbubbles" title="Buka chat transaksi" onPress={() => nav.navigate('ChatRoom', { chatId: o.chatId })} />
                </Neu>
              );
            })}
          </>
        )}

        {tab === 'reports' && (
          <>
            {db.reports.length === 0 && <Empty icon="shield-checkmark-outline" title="Tidak ada laporan" body="Pesan yang dilaporkan pengguna akan muncul di sini." />}
            {db.reports.map((r) => {
              const m = (db.messages[r.chatId] ?? []).find((x) => x.id === r.messageId);
              const sender = m ? db.users[m.senderId] : undefined;
              return (
                <Neu key={r.id} radius={R.lg} style={{ padding: 16, marginBottom: 12, gap: 10, opacity: r.resolved ? 0.6 : 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="flag" size={16} color={t.danger} />
                    <T v="h3" style={{ flex: 1, fontSize: 15 }}>{r.reason}</T>
                    <T v="caption">{ago(r.createdAt)}</T>
                  </View>
                  <T v="caption">Pelapor: {db.users[r.reporterId]?.name ?? '-'} · Pengirim: {sender?.name ?? '-'}</T>
                  <Neu inset radius={R.md} style={{ padding: 12 }}>
                    <T v="body">{m ? messagePreview(m) : 'Pesan sudah tidak ada'}</T>
                  </Neu>
                  {!r.resolved && (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn small variant="danger" icon="trash" title="Hapus pesan" onPress={() => adminResolveReport(r.id, true)} style={{ flex: 1 }} />
                      <Btn small variant="neu" title="Abaikan" onPress={() => adminResolveReport(r.id, false)} style={{ flex: 1 }} />
                    </View>
                  )}
                  {sender && !bannedNow(sender) && sender.id !== me.id && <Btn small variant="ghost" icon="ban" title={`Ban ${sender.name}`} onPress={() => (setAskBan(sender.id), setBanReason(''), setBanMs(86400_000))} />}                  </Neu>
                );
              })}
          </>
        )}

        {tab === 'appeals' && (
          <>
            {db.appeals.length === 0 && <Empty icon="mail-outline" title="Belum ada banding" body="Keterangan dari pengguna yang diblokir akan muncul di sini." />}
            {db.appeals.map((a) => (
              <Neu key={a.id} radius={R.lg} style={{ padding: 16, marginBottom: 12, gap: 10, opacity: a.status === 'pending' ? 1 : 0.65 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="mail-open" size={16} color={a.status === 'pending' ? t.warning : t.success} />
                  <T v="h3" style={{ flex: 1, fontSize: 15 }}>{db.users[a.uid]?.name ?? a.name ?? a.uid.slice(0, 10)}</T>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: a.status === 'pending' ? t.warning : a.status === 'approved' ? t.success : t.danger }}>
                    <T v="caption" color="#fff" style={{ fontSize: 10, fontWeight: '800' }}>{a.status === 'pending' ? 'MENUNGGU' : a.status === 'approved' ? 'DITERIMA' : 'DITOLAK'}</T>
                  </View>
                </View>
                <Neu inset radius={R.md} style={{ padding: 12 }}>
                  <T v="body">{a.message}</T>
                </Neu>
                <T v="caption">Dikirim {ago(a.createdAt)} · akun: {db.users[a.uid]?.email ?? '-'}</T>
                {a.status === 'pending' ? (
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Btn small icon="checkmark" title="Terima — unban" onPress={() => adminDecideAppeal(a.id, true)} style={{ flex: 1 }} />
                    <Btn small variant="danger" title="Tolak" onPress={() => adminDecideAppeal(a.id, false)} style={{ flex: 1 }} />
                  </View>
                ) : (
                  !!a.adminNote && <T v="caption" color={t.sub}>Catatan admin: {a.adminNote}</T>
                )}
              </Neu>
            ))}
          </>
        )}

        {tab === 'content' && (
          <>
            <Card title={`Story aktif · ${activeStories(db).length}`}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, padding: 8 }}>
                {activeStories(db).map((s) => (
                  <View key={s.id} style={{ width: 96, gap: 6 }}>
                    <View style={{ width: 96, height: 140, borderRadius: 14, overflow: 'hidden', backgroundColor: s.bg ?? '#000', alignItems: 'center', justifyContent: 'center' }}>
                      {s.uri ? <Image source={{ uri: s.uri }} style={{ width: 96, height: 140 }} contentFit="cover" /> : <T v="caption" color="#fff" numberOfLines={4} style={{ padding: 6, textAlign: 'center' }}>{s.text ?? ''}</T>}
                      <Pressable onPress={() => adminDeleteStory(s.id)} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,59,92,0.9)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Hapus story">
                        <Ionicons name="trash" size={14} color="#fff" />
                      </Pressable>
                    </View>
                    <T v="caption" numberOfLines={1}>{db.users[s.userId]?.name}</T>
                  </View>
                ))}
              </ScrollView>
            </Card>
            <Card title="Channel & grup">
              {Object.values(db.chats)
                .filter((c) => c.type === 'channel' || c.type === 'group' || c.type === 'global')
                .map((c) => (
                  <Row key={c.id} icon={c.type === 'channel' ? 'megaphone' : c.type === 'global' ? 'globe' : 'people'} title={c.name ?? ''} subtitle={`${c.type} · ${c.type === 'global' ? 'semua' : c.members.length} anggota`} onPress={() => nav.navigate('ChatRoom', { chatId: c.id })} />
                ))}
              <Row icon="add-circle" title="Buat channel baru" onPress={() => nav.navigate('NewGroup', { type: 'channel' })} />
            </Card>
          </>
        )}

        {tab === 'system' && (
          <>
            <MonitoringCard />
            <Card title="Mode pemeliharaan">
              <View style={{ padding: 10, gap: 12 }}>
                <T v="sub">Saat aktif, pengguna biasa melihat layar pemeliharaan. Admin & moderator tetap dapat masuk.</T>
                <NeuInput placeholder="Pesan pemeliharaan (opsional)" value={maintMsg} onChangeText={setMaintMsg} maxLength={140} />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Btn small variant={config?.maintenance?.enabled ? 'danger' : 'primary'} icon="warning" title={config?.maintenance?.enabled ? 'Matikan' : 'Aktifkan'} onPress={() => adminToggleMaintenance(!config?.maintenance?.enabled, maintMsg.trim() || undefined)} style={{ flex: 1 }} />
                  {config?.maintenance?.enabled && <Btn small variant="ghost" icon="open" title="Buka chat global" onPress={() => nav.navigate('ChatRoom', { chatId: 'c_global' })} />}
                </View>
              </View>
            </Card>
            <Card title="Layanan">
              {me.developer && <Row icon="pulse" title="Status layanan & API" subtitle="Diagnostik Firebase, WebRTC, proxy AI" onPress={() => nav.navigate('ApiStatus')} />}
              <Row icon="shield-checkmark" title="Audit log" subtitle={`${db.audit.length} tindakan moderasi tercatat — ketuk untuk semua`} onPress={() => nav.navigate('Audit')} chevron />
            </Card>
            <Card title="Supabase (media permanen & database)">
              <View style={{ padding: 10, gap: 12 }}>
                <T v="sub">Buat tabel (zeroid_media, zeroid_stickers, zeroid_bans) + bucket Storage `zeroid` secara OTOMATIS di Supabase. Jalankan sekali setelah env Supabase terpasang di Vercel — aman diulang kapan saja.</T>
                <Btn small icon="cloud-upload" title={seedBusy ? 'Menjalankan seed…' : 'Seed Supabase sekarang'} loading={seedBusy} onPress={runSeedSupabase} />
                {!!seedMsg && <T v="caption" style={{ lineHeight: 18 }}>{seedMsg}</T>}
                <T v="caption" color={t.faint}>Panduan lengkap: docs/SUPABASE_SETUP.md di repo (env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, POSTGRES_URL_NON_POOLING).</T>
              </View>
            </Card>
            <Card title="Audit log terbaru">
              {db.audit.slice(0, 20).map((a) => (
                <View key={a.id} style={{ paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.border }}>
                  <T v="sub" style={{ fontWeight: '600' }}>{a.action}{a.target ? ` · ${a.target.slice(0, 14)}` : ''}</T>
                  <T v="caption">{a.actorName} · {a.detail || '-'} · {ago(a.createdAt)}</T>
                </View>
              ))}
              {db.audit.length === 0 && <T v="sub" style={{ padding: 12 }}>Belum ada aktivitas moderasi.</T>}
            </Card>
          </>
        )}
      </ScrollView>

      {/* VIP grant sheet */}
      <Sheet visible={!!vipFor} onClose={() => setVipFor(null)} title={vipFor ? `Kelola VIP · ${db.users[vipFor]?.name}` : ''}>
        <View style={{ gap: 12 }}>
          <T v="sub">Beri masa VIP (hari). Isi 0 untuk mencabut VIP.</T>
          <NeuInput icon="time" placeholder="Jumlah hari" keyboardType="number-pad" value={vipDays} onChangeText={(s) => setVipDays(s.replace(/\D/g, ''))} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {['7', '30', '90', '365'].map((d) => (
              <Btn key={d} small variant="ghost" title={`${d}h`} onPress={() => setVipDays(d)} />
            ))}
          </View>
          <Btn
            small
            icon="checkmark"
            title="Terapkan"
            onPress={() => {
              if (!vipFor) return;
              adminSetVip(vipFor, parseInt(vipDays || '0', 10));
              setVipFor(null);
            }}
          />
        </View>
      </Sheet>

      {/* Ban dialog — alasan + durasi (jam/hari) */}
      <Sheet visible={!!askBan} onClose={() => setAskBan(null)} title={askBan ? `Ban · ${db.users[askBan]?.name}` : ''}>
        <View style={{ gap: 12 }}>
          {askBan && bannedNow(db.users[askBan]) ? (
            <View style={{ gap: 10 }}>
              <T v="sub">Pengguna ini sedang diblokir. Cabut sanksinya?</T>
              <Btn small icon="lock-open" title="Cabut blokir (unban)" onPress={() => { if (askBan) adminUnban(askBan); setAskBan(null); }} />
            </View>
          ) : (
            <>
              <T v="sub">Berikan alasan ban. Alasan ini dilihat pengguna di layar blokir, dan mereka bisa mengirim keterangan banding.</T>
              <NeuInput placeholder="Alasan ban" value={banReason} onChangeText={setBanReason} maxLength={140} multiline />
              <T v="label" style={{ fontWeight: '800' }}>Durasi</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {BAN_DURATIONS.map((d) => {
                  const on = banMs === d.ms;
                  return (
                    <Pressable key={d.label} onPress={() => setBanMs(d.ms)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? t.accent : t.bg2, borderWidth: 1, borderColor: on ? t.accent : t.border }}>
                      <T v="caption" color={on ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{d.label}</T>
                    </Pressable>
                  );
                })}
              </View>
              <Btn
                small
                variant="danger"
                icon="ban"
                title={`Ban (${banMs === 0 ? 'permanen' : BAN_DURATIONS.find((d) => d.ms === banMs)?.label ?? 'custom'})`}
                onPress={() => {
                  if (!askBan) return;
                  adminBan(askBan, banReason.trim(), banMs);
                  setAskBan(null);
                }}
              />
            </>
          )}
        </View>
      </Sheet>

      {/* Ban GRUP/SALURAN dialog — admin menulis pesan alasan + durasi */}
      <Sheet visible={!!askBanChat} onClose={() => setAskBanChat(null)} title={askBanChat ? `Ban ${db.chats[askBanChat]?.type === 'channel' ? 'saluran' : 'grup'} · ${db.chats[askBanChat]?.name ?? ''}` : ''}>
        <View style={{ gap: 12 }}>
          <T v="sub">Anggota tidak bisa mengirim pesan dan akan melihat layar tinjauan berisi alasan ini + tombol banding. Admin tetap bisa masuk.</T>
          <NeuInput placeholder="Alasan ban (dilihat anggota, mis. grup ini di ban karena spam berlebihan)" value={chatBanReason} onChangeText={setChatBanReason} maxLength={180} multiline />
          <T v="label" style={{ fontWeight: '800' }}>Durasi</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {BAN_DURATIONS.map((d) => {
              const on = chatBanMs === d.ms;
              return (
                <Pressable key={d.label} onPress={() => setChatBanMs(d.ms)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? t.accent : t.bg2, borderWidth: 1, borderColor: on ? t.accent : t.border }}>
                  <T v="caption" color={on ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{d.label}</T>
                </Pressable>
              );
            })}
          </View>
          <Btn
            small
            variant="danger"
            icon="ban"
            title={`Ban grup (${chatBanMs === 0 ? 'permanen' : BAN_DURATIONS.find((d) => d.ms === chatBanMs)?.label ?? 'custom'})`}
            onPress={() => {
              if (!askBanChat) return;
              adminBanChat(askBanChat, chatBanReason.trim(), chatBanMs);
              setAskBanChat(null);
            }}
          />
        </View>
      </Sheet>

      {/* Centang biru GRUP/SALURAN — masa aktif (hari), kadaluarsa otomatis */}
      <Sheet visible={!!askVerifyChat} onClose={() => setAskVerifyChat(null)} title={askVerifyChat ? `Centang biru · ${db.chats[askVerifyChat]?.name ?? ''}` : ''}>
        <View style={{ gap: 12 }}>
          <T v="sub">Pasang centang biru pada grup/saluran. Setelah masa aktif habis, centang hilang otomatis. Pilih 0 hari untuk permanen.</T>
          <T v="label" style={{ fontWeight: '800' }}>Masa aktif</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {[7, 30, 90, 180, 365, 0].map((d) => {
              const on = verifyDays === d;
              return (
                <Pressable key={d} onPress={() => setVerifyDays(d)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? t.accent : t.bg2, borderWidth: 1, borderColor: on ? t.accent : t.border }}>
                  <T v="caption" color={on ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{d === 0 ? 'Permanen' : `${d} hari`}</T>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn small icon="checkmark-circle" title="Pasang centang" onPress={() => { if (askVerifyChat) adminVerifyChat(askVerifyChat, verifyDays); setAskVerifyChat(null); }} style={{ flex: 1 }} />
            <Btn small variant="neu" icon="close-circle" title="Cabut centang" onPress={() => { if (askVerifyChat) adminUnverifyChat(askVerifyChat); setAskVerifyChat(null); }} style={{ flex: 1 }} />
          </View>
        </View>
      </Sheet>

      <Sheet visible={!!otpFor} onClose={() => setOtpFor(null)} title={otpFor ? `OTP Gmail · ${db.users[otpFor]?.email}` : ''}>
        <View style={{ gap: 12 }}>
          <T v="sub">Kirim kode OTP ke inbox Gmail pengguna lewat Firebase (ekstensi Trigger Email). Pengguna membacakan kodenya, lalu admin memverifikasi di sini.</T>
          <Btn
            small
            icon="paper-plane"
            title="Kirim OTP"
            onPress={async () => {
              if (!otpFor) return;
              const via = await sendOtp(otpFor);
              setOtpMsg(via === 'firebase' ? 'OTP dikirim ke Gmail via Firebase.' : 'Gagal: ekstensi Trigger Email belum terpasang.');
            }}
          />
          <NeuInput icon="keypad" placeholder="Kode dari pengguna" keyboardType="number-pad" value={otpCode} onChangeText={(s) => setOtpCode(s.replace(/\D/g, '').slice(0, 6))} />
          <Btn
            small
            variant="neu"
            icon="checkmark-circle"
            title="Verifikasi OTP"
            onPress={() => {
              if (!otpFor) return;
              const r = confirmOtp(otpFor, otpCode);
              setOtpMsg(r.ok ? 'Terverifikasi' : r.error ?? 'Gagal');
              if (r.ok) setTimeout(() => setOtpFor(null), 900);
            }}
          />
          {!!otpMsg && <T v="sub">{otpMsg}</T>}
        </View>
      </Sheet>
    </Screen>
  );
}
