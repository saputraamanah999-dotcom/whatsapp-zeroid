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
  useStore, adminToggleBan, adminSetRole, adminVerify, adminBroadcast, adminEndAnnouncement, adminResolveReport,
  adminDeleteStory, adminToggleBlueCheck, adminDecideOrder, adminSetVip, adminToggleMaintenance, sendOtp, confirmOtp,
  isOnline, activeStories, messagePreview, backendMode,
} from '../lib/store';
import { ago } from '../lib/format';
import { pushBanner } from '../lib/bus';

type Tab = 'overview' | 'users' | 'orders' | 'reports' | 'content' | 'system';

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
  const [otpFor, setOtpFor] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpMsg, setOtpMsg] = useState('');
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annLevel, setAnnLevel] = useState<'info' | 'warning' | 'critical'>('info');
  const [annPopup, setAnnPopup] = useState(true);
  const [annDays, setAnnDays] = useState('3');
  const [maintMsg, setMaintMsg] = useState('');

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
      <View style={{ paddingHorizontal: 18, paddingBottom: 8, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: 'Info' },
            { value: 'users', label: 'User' },
            { value: 'orders', label: `Order${pendingOrders ? ` ${pendingOrders}` : ''}` },
            { value: 'reports', label: `Lapor${openReports ? ` ${openReports}` : ''}` },
            { value: 'content', label: 'Konten' },
            { value: 'system', label: 'Sistem' },
          ]}
        />
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
                    <Btn small variant={u.banned ? 'primary' : 'danger'} icon={u.banned ? 'lock-open' : 'ban'} title={u.banned ? 'Unban' : 'Ban'} onPress={() => (setAskBan(u.id), setBanReason(''))} style={{ height: 36 }} />
                    <Btn small variant="neu" icon="diamond" title="VIP" onPress={() => (setVipFor(u.id), setVipDays('30'))} style={{ height: 36 }} />
                    {!u.verified && <Btn small variant="neu" icon="checkmark-circle" title="Verifikasi" onPress={() => adminVerify(u.id)} style={{ height: 36 }} />}
                    <Btn small variant={u.blueCheck ? 'neu' : 'primary'} icon="checkmark-circle" title={u.blueCheck ? 'Cabut centang' : 'Centang biru'} onPress={() => adminToggleBlueCheck(u.id)} style={{ height: 36 }} />
                    {!u.otpVerified && <Btn small variant="neu" icon="mail" title="OTP Gmail" onPress={() => (setOtpFor(u.id), setOtpCode(''), setOtpMsg(''))} style={{ height: 36 }} />}
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
                  {sender && !sender.banned && sender.id !== me.id && <Btn small variant="ghost" icon="ban" title={`Ban ${sender.name}`} onPress={() => (setAskBan(sender.id), setBanReason(''))} />}
                </Neu>
              );
            })}
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

      {/* Ban reason dialog */}
      <Sheet visible={!!askBan} onClose={() => setAskBan(null)} title={askBan ? `Ban · ${db.users[askBan]?.name}` : ''}>
        <View style={{ gap: 12 }}>
          <T v="sub">Berikan alasan ban. Alasan ini dilihat pengguna saat mencoba masuk.</T>
          <NeuInput placeholder="Alasan ban" value={banReason} onChangeText={setBanReason} maxLength={140} multiline />
          <Btn
            small
            variant="danger"
            icon="ban"
            title="Ban pengguna"
            onPress={() => {
              if (!askBan) return;
              adminToggleBan(askBan, banReason.trim() || undefined);
              setAskBan(null);
            }}
          />
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
