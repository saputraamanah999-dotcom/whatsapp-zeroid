import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { Header, Screen, Avatar, T, Neu, Card, NeuInput, Btn, Empty, Segmented, Row } from '../components/ui';
import { Confirm, Sheet } from '../components/Sheet';
import BannerMedia from '../components/BannerMedia';
import { UserBadges } from '../components/ui';
import { ProductIcon } from '../lib/icons';
import { productOf, productSafe, rupiah } from '../lib/products';
import { useTheme, R } from '../lib/theme';
import {
  useStore, adminBan, adminUnban, adminSetRole, adminVerify, adminBroadcast, adminEndAnnouncement, adminResolveReport,
  adminDeleteStory, adminToggleBlueCheck, adminDecideOrder, adminSetVip, adminToggleMaintenance, sendOtp, confirmOtp,
  isOnline, activeStories, messagePreview, backendMode, adminDecideAppeal, bannedNow, banRemaining, mutedRemaining,
  adminBanChat, adminUnbanChat, adminDecideChatAppeal, adminVerifyChat, adminUnverifyChat,
  adminSetMuteOff, adminMessageAll, adminBotBroadcast, chatBannedNow, chatBanRemaining, chatVerified, chatBadge,
  updateAiProfile, adminDeleteChat, adminUpdateOrder, adminDeleteOrder, adminSetPayments, isOwnerDev,
  adminGrowFollowers, adminGrowReactions, followersCount, subscribeMessages,
} from '../lib/store';
import { apiProductOf } from '../lib/products';
import { useBackendHealth, healthLabel, supabaseStatus } from '../lib/health';
import { firebase, firebaseConfig } from '../lib/firebase';
import { proxyPost } from '../lib/proxy';
import { ago, compactId } from '../lib/format';
import { pushBanner } from '../lib/bus';
import { checkServerRules, rulesBanner, type RuleProbe } from '../lib/rulescheck';
import { pickGallery, uploadMedia, uploadMediaDirect } from '../lib/media';
import { subscribeAllFeedback, answerFeedback, deleteFeedback } from '../lib/feedback';
import { Feedback as FeedbackType } from '../lib/types';
import { subscribeVouchers, adminVoucherCreate, adminVoucherToggle, adminVoucherDelete, Voucher } from '../lib/vouchers';
import { onSnapshot, doc as fsDoc, setDoc as fsSetDoc, collection as fsCol, getFirestore } from 'firebase/firestore';

type GuardLog = {
  id: string; uid: string; name: string; role: string; chatId: string; chatName: string;
  kind: string; reason: string; excerpt: string; action: string; until: number; at: number;
};

type GuardConfig = {
  profanity: { on: boolean; hours: number };
  porn: { on: boolean; days: number };
  spam: { on: boolean; hours: number };
  virtex: { on: boolean; hours: number };
  mediaBomb: { on: boolean; hours: number; threshold: number };
  stickerSpam: { on: boolean; hours: number; threshold: number };
  autoSuspend: { on: boolean; minutes: number };
  ipBan: { on: boolean };
  staffExempt: { on: boolean };
  warnFirst: { on: boolean; maxWarns: number };
};

const GUARD_DEFAULTS: GuardConfig = {
  profanity: { on: true, hours: 2 },
  porn: { on: true, days: 7 },
  spam: { on: true, hours: 24 },
  virtex: { on: true, hours: 6 },
  mediaBomb: { on: true, hours: 12, threshold: 15 },
  stickerSpam: { on: true, hours: 6, threshold: 8 },
  autoSuspend: { on: true, minutes: 60 },
  ipBan: { on: true },
  staffExempt: { on: true },
  warnFirst: { on: false, maxWarns: 2 },
};

const KIND_LABEL: Record<string, string> = {
  porn: 'Konten 18+', profanity: 'Kata kasar', sticker_spam: 'Spam stiker',
  media_bomb: 'Bom media', login_attempt: 'Coba login admin', login_ban: 'Ban penyerang',
};

/**
 * AI GUARD — panel monitoring + atur skill moderator AI:
 *  - kata kasar  → on/off + durasi ban (jam)
 *  - konten 18+  → on/off + durasi ban (hari)
 *  - spam        → on/off + durasi ban (jam)
 * Eksekusi dilakukan SERVER (guard-enforce) sehingga sanksi tetap jalan walau
 * tak ada admin online; semua laporan (termasuk percobaan bobol akun admin dari
 * login-guard) tampil real-time di bawah.
 */
function GuardPanel() {
  const t = useTheme();
  const { me, db } = useStore();
  const [cfg, setCfg] = useState<GuardConfig>(GUARD_DEFAULTS);
  const [logs, setLogs] = useState<GuardLog[]>([]);
  const [loaded, setLoaded] = useState(false);

  React.useEffect(() => {
    const fdb = getFirestore();
    const un1 = onSnapshot(fsDoc(fdb, 'guardconfig', 'main'), (s) => {
      const d = s.data() as any;
      if (d) setCfg({
        profanity: { on: d.profanity?.on !== false, hours: Number(d.profanity?.hours ?? 2) },
        porn: { on: d.porn?.on !== false, days: Number(d.porn?.days ?? 7) },
        spam: { on: d.spam?.on !== false, hours: Number(d.spam?.hours ?? 24) },
        virtex: { on: d.virtex?.on !== false, hours: Number(d.virtex?.hours ?? 6) },
        mediaBomb: { on: d.mediaBomb?.on !== false, hours: Number(d.mediaBomb?.hours ?? 12), threshold: Number(d.mediaBomb?.threshold ?? 15) },
        stickerSpam: { on: d.stickerSpam?.on !== false, hours: Number(d.stickerSpam?.hours ?? 6), threshold: Number(d.stickerSpam?.threshold ?? 8) },
        autoSuspend: { on: d.autoSuspend?.on !== false, minutes: Number(d.autoSuspend?.minutes ?? 60) },
        ipBan: { on: d.ipBan?.on !== false },
        staffExempt: { on: d.staffExempt?.on !== false },
        warnFirst: { on: !!d.warnFirst?.on, maxWarns: Number(d.warnFirst?.maxWarns ?? 2) },
      });
      setLoaded(true);
    }, () => setLoaded(true));
    const un2 = onSnapshot(fsCol(fdb, 'guardlog'), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as GuardLog[];
      list.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
      setLogs(list.slice(0, 40));
    }, () => setLogs([]));
    return () => { un1(); un2(); };
  }, []);

  const save = async (next: GuardConfig) => {
    setCfg(next);
    try {
      const fdb = getFirestore();
      await fsSetDoc(fsDoc(fdb, 'guardconfig', 'main'), {
        profanity: next.profanity, porn: next.porn, spam: next.spam,
        virtex: next.virtex, mediaBomb: next.mediaBomb, stickerSpam: next.stickerSpam,
        autoSuspend: next.autoSuspend, ipBan: next.ipBan, staffExempt: next.staffExempt,
        warnFirst: next.warnFirst,
        updatedAt: Date.now(), updatedBy: me?.name ?? 'admin',
      }, { merge: true });
    } catch { /* rules admin-only — abaikan */ }
  };

  const num = (v: string, dflt: number) => Math.max(1, Math.min(720, parseInt(v, 10) || dflt));
  const thr = (v: string, dflt: number) => Math.max(3, Math.min(100, parseInt(v, 10) || dflt));

  // baris skill: ikon + nama + tombol Aktif/Mati (tanpa pengulangan markup)
  const skillRow = (icon: keyof typeof Ionicons.glyphMap, color: string, label: string, on: boolean, toggle: () => void) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Ionicons name={icon} size={18} color={color} />
      <T v="body" style={{ flex: 1, fontWeight: '700' }}>{label}</T>
      <Btn small variant={on ? 'primary' : 'neu'} icon={on ? 'checkmark' : 'close'} title={on ? 'Aktif' : 'Mati'} onPress={toggle} />
    </View>
  );
  const numRow = (label: string, hint: string, value: number, onChange: (n: number) => void, suffix = 'jam') => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <T v="caption" color={t.sub}>{label}:</T>
      <View style={{ width: 84 }}>
        <NeuInput value={String(value)} onChangeText={(v: string) => onChange(parseInt(v, 10) || 1)} keyboardType="number-pad" />
      </View>
      <T v="caption" color={t.faint}>{suffix} · {hint}</T>
    </View>
  );

  return (
    <View style={{ gap: 16 }}>
      <Card title="Skill AI Guard (moderator otomatis)">
        <View style={{ padding: 12, gap: 14 }}>
          <T v="caption" color={t.sub}>
            AI Guard memeriksa SEMUA pesan grup/global/saluran. Yang aneh/berbahaya otomatis kena sanksi oleh SERVER, dicatat di log bawah, dan dilaporkan ke developer — termasuk percobaan bobol akun admin (ban keras IP + perangkat setelah 3x gagal). Semua skill di bawah bisa diatur bebas — berlaku REAL-TIME ke semua perangkat.
          </T>
          {/* KATA KASAR */}
          <View style={{ gap: 8 }}>
            {skillRow('chatbox-ellipses', t.warning, 'Filter kata kasar', cfg.profanity.on, () => save({ ...cfg, profanity: { ...cfg.profanity, on: !cfg.profanity.on } }))}
            {cfg.profanity.on && numRow('Ban otomatis', 'aneh dikit langsung dibanned', cfg.profanity.hours, (n) => save({ ...cfg, profanity: { ...cfg.profanity, hours: num(String(n), 2) } }))}
          </View>
          {/* PORNO */}
          <View style={{ gap: 8 }}>
            {skillRow('alert-circle', t.danger, 'Konten 18+ / porno', cfg.porn.on, () => save({ ...cfg, porn: { ...cfg.porn, on: !cfg.porn.on } }))}
            {cfg.porn.on && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <T v="caption" color={t.sub}>Ban otomatis (hari):</T>
                <View style={{ width: 90 }}>
                  <NeuInput value={String(cfg.porn.days)} onChangeText={(v: string) => save({ ...cfg, porn: { ...cfg.porn, days: num(v, 7) } })} keyboardType="number-pad" />
                </View>
                <T v="caption" color={t.faint}>+ IP & perangkat pelanggar ikut dikunci</T>
              </View>
            )}
          </View>
          {/* SPAM */}
          <View style={{ gap: 8 }}>
            {skillRow('sparkles', '#7B61FF', 'Spam (stiker/media beruntun)', cfg.spam.on, () => save({ ...cfg, spam: { ...cfg.spam, on: !cfg.spam.on } }))}
            {cfg.spam.on && numRow('Ban otomatis', 'deteksi macem-macem → eksekusi + IP ban', cfg.spam.hours, (n) => save({ ...cfg, spam: { ...cfg.spam, hours: num(String(n), 24) } }))}
          </View>
          {/* VIRTEX (bom karakter) */}
          <View style={{ gap: 8 }}>
            {skillRow('nuclear', t.danger, 'Virtext / bom karakter', cfg.virtex.on, () => save({ ...cfg, virtex: { ...cfg.virtex, on: !cfg.virtex.on } }))}
            {cfg.virtex.on && numRow('Ban otomatis', 'teks raksasa pembuat crash diblokir', cfg.virtex.hours, (n) => save({ ...cfg, virtex: { ...cfg.virtex, hours: num(String(n), 6) } }))}
          </View>
          {/* BOM MEDIA */}
          <View style={{ gap: 8 }}>
            {skillRow('images', '#FF8A00', 'Bom media (gambar/video)', cfg.mediaBomb.on, () => save({ ...cfg, mediaBomb: { ...cfg.mediaBomb, on: !cfg.mediaBomb.on } }))}
            {cfg.mediaBomb.on && (
              <>
                {numRow('Ban otomatis', 'bom media beruntun', cfg.mediaBomb.hours, (n) => save({ ...cfg, mediaBomb: { ...cfg.mediaBomb, hours: num(String(n), 12) } }))}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <T v="caption" color={t.sub}>Ambang:</T>
                  <View style={{ width: 84 }}>
                    <NeuInput value={String(cfg.mediaBomb.threshold)} onChangeText={(v: string) => save({ ...cfg, mediaBomb: { ...cfg.mediaBomb, threshold: thr(v, 15) } })} keyboardType="number-pad" />
                  </View>
                  <T v="caption" color={t.faint}>media dalam 60 detik dari orang sama</T>
                </View>
              </>
            )}
          </View>
          {/* SPAM STIKER */}
          <View style={{ gap: 8 }}>
            {skillRow('happy', '#FF7A9C', 'Spam stiker', cfg.stickerSpam.on, () => save({ ...cfg, stickerSpam: { ...cfg.stickerSpam, on: !cfg.stickerSpam.on } }))}
            {cfg.stickerSpam.on && (
              <>
                {numRow('Ban otomatis', 'spam stiker beruntun', cfg.stickerSpam.hours, (n) => save({ ...cfg, stickerSpam: { ...cfg.stickerSpam, hours: num(String(n), 6) } }))}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <T v="caption" color={t.sub}>Ambang:</T>
                  <View style={{ width: 84 }}>
                    <NeuInput value={String(cfg.stickerSpam.threshold)} onChangeText={(v: string) => save({ ...cfg, stickerSpam: { ...cfg.stickerSpam, threshold: thr(v, 8) } })} keyboardType="number-pad" />
                  </View>
                  <T v="caption" color={t.faint}>stiker dalam 90 detik dari orang sama</T>
                </View>
              </>
            )}
          </View>
          {!loaded && <T v="caption" color={t.faint}>Memuat pengaturan…</T>}
        </View>
      </Card>

      <Card title="Sanksi & perlindungan">
        <View style={{ padding: 12, gap: 14 }}>
          {/* TANGGUHKAN GRUP OTOMATIS */}
          <View style={{ gap: 8 }}>
            {skillRow('warning', '#FFB300', 'Tangguhkan grup otomatis', cfg.autoSuspend.on, () => save({ ...cfg, autoSuspend: { ...cfg.autoSuspend, on: !cfg.autoSuspend.on } }))}
            {cfg.autoSuspend.on && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <T v="caption" color={t.sub}>Durasi kunci:</T>
                <View style={{ width: 84 }}>
                  <NeuInput value={String(cfg.autoSuspend.minutes)} onChangeText={(v: string) => save({ ...cfg, autoSuspend: { ...cfg.autoSuspend, minutes: Math.max(1, Math.min(1440, parseInt(v, 10) || 60)) } })} keyboardType="number-pad" />
                </View>
                <T v="caption" color={t.faint}>menit — bisa dibuka lebih cepat developer</T>
              </View>
            )}
          </View>
          {/* KUNCI IP */}
          {skillRow('lock-closed', t.danger, 'Kunci IP & perangkat pelanggar', cfg.ipBan.on, () => save({ ...cfg, ipBan: { ...cfg.ipBan, on: !cfg.ipBan.on } }))}
          {cfg.ipBan.on && <T v="caption" color={t.faint}>Akun baru di IP/perangkat yang sama otomatis ditolak — anti buat akun baru.</T>}
          {/* STAF BEBAS */}
          {skillRow('shield-checkmark', t.success, 'Admin & developer kebal Guard', cfg.staffExempt.on, () => save({ ...cfg, staffExempt: { ...cfg.staffExempt, on: !cfg.staffExempt.on } }))}
          {cfg.staffExempt.on && <T v="caption" color={t.faint}>Tim tidak pernah kena sanksi otomatis (aman saat mengetes).</T>}
          {/* PERINGATAN DULU */}
          <View style={{ gap: 8 }}>
            {skillRow('megaphone', t.accent, 'Peringatan dulu sebelum ban', cfg.warnFirst.on, () => save({ ...cfg, warnFirst: { ...cfg.warnFirst, on: !cfg.warnFirst.on } }))}
            {cfg.warnFirst.on && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <T v="caption" color={t.sub}>Maks peringatan:</T>
                <View style={{ width: 84 }}>
                  <NeuInput value={String(cfg.warnFirst.maxWarns)} onChangeText={(v: string) => save({ ...cfg, warnFirst: { ...cfg.warnFirst, maxWarns: Math.max(1, Math.min(10, parseInt(v, 10) || 2)) } })} keyboardType="number-pad" />
                </View>
                <T v="caption" color={t.faint}>kali — setelah itu sanksi jalan</T>
              </View>
            )}
          </View>
        </View>
      </Card>

      <Card title={`Laporan & eksekusi AI Guard · ${logs.length}`}>
        {logs.length === 0 && <Empty icon="shield-checkmark-outline" title="Belum ada laporan" body="Pelanggaran yang terdeteksi AI Guard dan percobaan bobol akun admin akan muncul di sini real-time." />}
        {logs.map((l) => {
          const target = l.uid ? db.users[l.uid] : null;
          return (
            <Neu key={l.id} inset radius={R.md} style={{ padding: 12, marginTop: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: l.kind === 'login_attempt' || l.kind === 'login_ban' ? 'rgba(255,90,95,0.14)' : 'rgba(255,159,10,0.16)' }}>
                  <T v="caption" style={{ fontWeight: '800' }}>{KIND_LABEL[l.kind] ?? l.kind}</T>
                </View>
                <T v="label" style={{ flexShrink: 1 }}>{l.name}{l.role && l.role !== 'user' ? ` (${l.role})` : ''}</T>
                <T v="caption" color={t.faint} style={{ flex: 1, textAlign: 'right' }}>{l.at ? ago(l.at) : ''}</T>
              </View>
              <T v="caption" color={t.sub}>{l.chatName ? `di ${l.chatName} — ` : ''}{l.reason}{l.excerpt ? ` · "${l.excerpt}"` : ''}</T>
              <T v="caption" style={{ fontWeight: '700', color: String(l.action ?? '').includes('ban') ? t.danger : t.accent }}>Tindakan: {l.action}</T>
              {!!l.uid && l.kind !== 'login_attempt' && l.kind !== 'login_ban' && (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {!bannedNow(target) && <Btn small variant="danger" icon="ban" title={`Ban ${l.name}`} onPress={() => adminBan(l.uid, `[AI GUARD] ${l.reason}`, 7 * 86400_000)} style={{ height: 32 }} />}
                  {bannedNow(target) && <Btn small icon="lock-open" title="Cabut sanksi" onPress={() => adminUnban(l.uid)} style={{ height: 32 }} />}
                </View>
              )}
            </Neu>
          );
        })}
      </Card>
    </View>
  );
}


/** TUMBUHKAN SALURAN (v23 — permintaan pemilik):
 *  - FOLLOWERS MASSAL: tumpuk jumlah pengikut saluran berapa pun (real-time +
 *    angka tambahan yang tampil ke semua user) — dipakai admin & otomatis
 *    setelah pesanan paket followers lunas.
 *  - REAKSI MASSAL: tumpuk reaksi ke pesan terakhir saluran.
 *  Semua angka tampil natural (anggota nyata + tambahan) di daftar chat,
 *  header chat, info chat, dan Discover. */
function GrowPanel() {
  const t = useTheme();
  const { db } = useStore();
  const channels = Object.values(db.chats).filter((c) => c.type === 'channel').sort((a, b) => (b.lastMsg?.createdAt ?? 0) - (a.lastMsg?.createdAt ?? 0));
  const [chatId, setChatId] = useState<string>('');
  const [mode, setMode] = useState<'followers' | 'reaction'>('followers');
  const [amount, setAmount] = useState('100');
  const [emoji, setEmoji] = useState('\u2764\uFE0F');
  const [msg, setMsg] = useState('');
  const cur = channels.find((c) => c.id === chatId);
  const n = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;

  React.useEffect(() => {
    if (mode === 'reaction' && chatId) subscribeMessages(chatId); // butuh pesan utk target reaksi
  }, [mode, chatId]);

  const run = () => {
    setMsg('');
    if (!cur) { setMsg('Pilih salurannya dulu.'); return; }
    if (!n || n < 1) { setMsg('Isi jumlahnya dulu (angka).'); return; }
    if (mode === 'followers') {
      const r = adminGrowFollowers(chatId, n);
      setMsg(r.ok ? `Berhasil menambah ${n.toLocaleString('id-ID')} followers ke "${cur.name}".` : r.error ?? 'Gagal.');
    } else {
      const r = adminGrowReactions(chatId, n, emoji);
      setMsg(r.ok ? `Berhasil menambah ${n.toLocaleString('id-ID')} reaksi ke pesan terakhir "${cur.name}".` : r.error ?? 'Gagal.');
    }
  };

  const EMOJIS = ['\u2764\uFE0F', '\u{1F44D}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}', '\u{1F525}'];

  return (
    <View style={{ gap: 16 }}>
      <Card title="Tumbuhkan saluran (followers & reaksi massal)">
        <View style={{ padding: 12, gap: 12 }}>
          <T v="caption" color={t.sub}>
            Pilih saluran, pilih jenisnya, tulis jumlahnya — langsung masuk & tampil ke semua pengguna. Angka asli anggota tetap utuh, tambahannya ditumpuk di atasnya.
          </T>
          <Segmented<'followers' | 'reaction'>
            value={mode}
            onChange={(m) => { setMode(m); setMsg(''); }}
            options={[
              { value: 'followers', label: 'Followers' },
              { value: 'reaction', label: 'Reaksi' },
            ]}
          />
          {channels.length === 0 ? (
            <Empty icon="megaphone" title="Belum ada saluran" body="Buat saluran dulu lewat menu baru → saluran." />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {channels.map((c) => {
                const on = chatId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setChatId(c.id)}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? t.accent : t.bg, boxShadow: on ? t.insetSm : t.raisedSm } as any}
                  >
                    <T v="caption" color={on ? '#fff' : t.sub} style={{ fontWeight: '800' }} numberOfLines={1}>{c.name || '(tanpa nama)'} · {compactId(followersCount(c))}</T>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {!!cur && (
            <Neu inset radius={R.md} style={{ padding: 12, gap: 4 }}>
              <T v="caption" color={t.faint}>Saluran terpilih</T>
              <T v="body" style={{ fontWeight: '800' }}>{cur.name}</T>
              <T v="caption" color={t.sub}>{compactId(followersCount(cur))} pengikut saat ini ({cur.members.length} asli + {cur.extraFollowers ?? 0} tambahan)</T>
            </Neu>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 140 }}>
              <NeuInput icon="stats-chart" placeholder={mode === 'followers' ? 'Mis. 1000' : 'Mis. 500'} value={amount} onChangeText={setAmount} keyboardType="number-pad" />
            </View>
            <T v="caption" color={t.faint} style={{ flex: 1 }}>
              {mode === 'followers' ? 'followers tambahan (bisa sampai 1.000.000)' : 'reaksi tambahan ke pesan TERAKHIR saluran (maks 500.000)'}
            </T>
          </View>
          {mode === 'reaction' && (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <T v="caption" color={t.sub}>Emoji reaksi:</T>
              {EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => setEmoji(e)} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: emoji === e ? t.accentSoft : t.bg2 }}>
                  <T style={{ fontSize: 18 }}>{e}</T>
                </Pressable>
              ))}
            </View>
          )}
          <Btn variant="primary" icon={mode === 'followers' ? 'trending-up' : 'heart'} title={`Tambah ${mode === 'followers' ? 'followers' : 'reaksi'}${n ? ` (${n.toLocaleString('id-ID')})` : ''}`} onPress={run} />
          {!!msg && <T v="caption" color={t.accent} style={{ fontWeight: '800' }}>{msg}</T>}
        </View>
      </Card>
    </View>
  );
}

/** KONFIGURASI PEMBAYARAN (config/payments): nomor DANA + nama + foto QRIS +
 *  catatan. Semua user melihat ini di layar bayar; admin mengatur di sini. */
function PaymentsConfigPanel() {
  const t = useTheme();
  const { db } = useStore();
  const cfg = db.payments;
  const [dana, setDana] = useState('');
  const [danaName, setDanaName] = useState('');
  const [note, setNote] = useState('');
  const [qris, setQris] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setDana(cfg?.danaNumber ?? '');
    setDanaName(cfg?.danaName ?? '');
    setNote(cfg?.note ?? '');
    setQris(cfg?.qrisImage ?? null);
  }, [cfg?.danaNumber, cfg?.danaName, cfg?.note, cfg?.qrisImage]);

  const pickQris = async () => {
    try {
      const p = await pickGallery('images');
      if (!p) return;
      const up = await uploadMedia(p.uri, `payments/qris_${Date.now()}.jpg`, p.mime || 'image/jpeg');
      if (up?.url) setQris(up.url);
      else pushBanner({ title: 'Upload gagal', body: 'Coba gambar lain / cek koneksi.', icon: 'alert' });
    } catch (e: any) {
      pushBanner({ title: 'Upload gagal', body: String(e?.message ?? '').slice(0, 140), icon: 'alert' });
    }
  };

  return (
    <Card title="Konfigurasi pembayaran (QRIS + DANA)">
      <View style={{ padding: 12, gap: 12 }}>
        <T v="caption" color={t.sub}>Nomor DANA & QRIS ini yang dilihat pembeli di layar bayar. Foto QRIS statis otomatis dijadikan QRIS DINAMIS ber-nominal saat user membayar (via API developer).</T>
        <NeuInput icon="wallet" placeholder="Nomor DANA (mis. 081234567890)" keyboardType="number-pad" value={dana} onChangeText={(v: string) => setDana(v.replace(/[^0-9+]/g, '').slice(0, 16))} />
        <NeuInput icon="person" placeholder="Nama pemilik DANA (a.n.)" value={danaName} onChangeText={(v: string) => setDanaName(v.slice(0, 60))} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {qris ? (
            <Pressable onPress={pickQris}>
              <Image source={{ uri: qris }} style={{ width: 92, height: 92, borderRadius: 12, backgroundColor: '#fff' }} contentFit="contain" />
            </Pressable>
          ) : (
            <Pressable onPress={pickQris} style={{ width: 92, height: 92, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="qr-code" size={26} color={t.faint} />
            </Pressable>
          )}
          <View style={{ flex: 1, gap: 6 }}>
            <T v="caption">Foto QRIS statis {qris ? 'terpasang ✓ (ketuk untuk ganti)' : 'belum ada — ketuk kotak untuk unggah'}</T>
            <Btn small variant="ghost" icon="cloud-upload" title="Pilih foto QRIS" onPress={pickQris} />
          </View>
        </View>
        <NeuInput placeholder="Catatan untuk pembeli (mis. konfirmasi 1x24 jam)" value={note} onChangeText={(v: string) => setNote(v.slice(0, 300))} maxLength={300} multiline />
        <Btn
          small
          variant="primary"
          icon="checkmark"
          title="Simpan konfigurasi pembayaran"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            const r = await adminSetPayments({ danaNumber: dana.trim(), danaName: danaName.trim(), qrisImage: qris ?? '', note: note.trim() });
            setBusy(false);
            if (r.ok) pushBanner({ title: 'Pembayaran tersimpan', body: 'Semua pembeli melihat nomor DANA & QRIS terbaru.', icon: 'checkmark-circle' });
          }}
        />
      </View>
    </Card>
  );
}

/** VOUCHER — buat kode diskon untuk VIP/Member/Centang biru/Keamanan. */
function VoucherPanel() {
  const t = useTheme();
  const [list, setList] = useState<Voucher[]>([]);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('10');
  const [maxUses, setMaxUses] = useState('50');
  const [days, setDays] = useState('30');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  React.useEffect(() => subscribeVouchers(setList), []);

  const create = async () => {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await adminVoucherCreate({ code, percent: parseInt(percent, 10), maxUses: parseInt(maxUses, 10) || 1, daysValid: parseInt(days, 10) || 30 });
    setBusy(false);
    if (r.ok) { setMsg(`Voucher ${code.trim().toUpperCase()} aktif!`); setCode(''); }
    else setMsg(r.error ?? 'Gagal membuat voucher.');
  };

  return (
    <View style={{ gap: 16 }}>
      <Card title="Buat kode voucher diskon">
        <View style={{ padding: 12, gap: 10 }}>
          <T v="caption" color={t.sub}>Voucher bisa ditukarkan user di halaman Zeroid Premium — diskon % untuk VIP, Member, Centang biru, dan Keamanan (koin atau transfer).</T>
          <NeuInput icon="ticket" placeholder="KODE VOUCHER (mis. ZEROID10)" value={code} onChangeText={(v: string) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} autoCapitalize="characters" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <T v="caption" color={t.sub}>Diskon (%)</T>
              <NeuInput value={percent} onChangeText={(v: string) => setPercent(v.replace(/\D/g, ''))} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <T v="caption" color={t.sub}>Kuota pemakaian</T>
              <NeuInput value={maxUses} onChangeText={(v: string) => setMaxUses(v.replace(/\D/g, ''))} keyboardType="number-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <T v="caption" color={t.sub}>Masa aktif (hari)</T>
              <NeuInput value={days} onChangeText={(v: string) => setDays(v.replace(/\D/g, ''))} keyboardType="number-pad" />
            </View>
          </View>
          {!!msg && <T v="caption" color={msg.startsWith('Voucher') ? t.success : t.danger} style={{ fontWeight: '700' }}>{msg}</T>}
          <Btn title="Buat voucher" icon="add-circle" loading={busy} onPress={create} disabled={code.trim().length < 4} />
        </View>
      </Card>

      <Card title={`Voucher aktif · ${list.length}`}>
        {list.length === 0 && <Empty icon="ticket-outline" title="Belum ada voucher" body="Buat kode voucher pertamamu di atas." />}
        {list.map((v) => {
          const expired = v.expiresAt > 0 && v.expiresAt < Date.now();
          const usedUp = v.usedCount >= v.maxUses;
          return (
            <Neu key={v.id} inset radius={R.md} style={{ padding: 12, marginTop: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T v="h3" style={{ flex: 1, letterSpacing: 1.5 }}>{v.code}</T>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: !v.active || expired || usedUp ? t.dangerSoft : 'rgba(20,196,122,0.14)' }}>
                  <T v="caption" style={{ fontWeight: '800', color: !v.active || expired || usedUp ? t.danger : t.success }}>
                    {!v.active ? 'nonaktif' : expired ? 'kadaluarsa' : usedUp ? 'habis' : `${v.percent}% off`}
                  </T>
                </View>
              </View>
              <T v="caption" color={t.sub}>
                Diskon {v.percent}% · terpakai {v.usedCount}/{v.maxUses} · berlaku sampai {v.expiresAt ? new Date(v.expiresAt).toLocaleDateString('id-ID') : '-'}
              </T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Btn small variant={v.active ? 'neu' : 'primary'} icon={v.active ? 'pause' : 'play'} title={v.active ? 'Nonaktifkan' : 'Aktifkan'} onPress={() => adminVoucherToggle(v.code, !v.active)} style={{ flex: 1, height: 34 }} />
                <Btn small variant="ghost" icon="trash" title="Hapus" onPress={() => adminVoucherDelete(v.code)} style={{ height: 34 }} />
              </View>
            </Neu>
          );
        })}
      </Card>
    </View>
  );
}

/** Panel MASUKAN user → developer: balas + apresiasi koin (admin panel). */
function FeedbackPanel() {
  const t = useTheme();
  const { me } = useStore();
  const [list, setList] = useState<FeedbackType[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { reply: string; reward: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  React.useEffect(() => {
    const unsub = subscribeAllFeedback(setList);
    return () => unsub();
  }, []);

  const shown = list.filter((f) => (filter === 'open' ? f.status === 'open' : true));

  const sendReply = async (f: FeedbackType) => {
    const d = drafts[f.id] ?? { reply: '', reward: '' };
    if (!me) return;
    setBusyId(f.id);
    const r = await answerFeedback({
      fid: f.id,
      feedback: f,
      reply: d.reply,
      reward: parseInt(d.reward || '0', 10) || 0,
      adminId: me.id,
      adminName: me.name,
    });
    setBusyId(null);
    if (r.ok) {
      setDrafts((x) => ({ ...x, [f.id]: { reply: '', reward: '' } }));
      pushBanner({ title: 'Masukan dibalas', body: 'Balasan + apresiasi terkirim ke pengguna.', icon: 'checkmark-circle' });
    } else {
      pushBanner({ title: 'Gagal membalas', body: r.error ?? 'Coba lagi.', icon: 'alert' });
    }
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Segmented value={filter} onChange={(v) => setFilter(v as 'open' | 'all')} options={[{ value: 'open', label: 'Belum dibalas' }, { value: 'all', label: 'Semua' }]} />
        </View>
      </View>
      {shown.length === 0 && <Empty icon="chatbubbles-outline" title="Tidak ada masukan" body="Masukan pengguna akan muncul di sini secara real-time." />}
      {shown.map((f) => {
        const d = drafts[f.id] ?? { reply: '', reward: '' };
        const answered = f.status === 'answered';
        return (
          <Card key={f.id}>
            <View style={{ padding: 12, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <T v="label" style={{ flexShrink: 1 }}>{f.name || 'Pengguna'}</T>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: f.kind === 'bug' ? 'rgba(255,90,95,0.14)' : 'rgba(30,107,255,0.12)' }}>
                  <T v="caption" style={{ fontWeight: '700' }}>{f.kind === 'bug' ? 'Bug' : f.kind === 'ide' ? 'Ide' : 'Lainnya'}</T>
                </View>
                <T v="caption" color={t.faint} style={{ flex: 1, textAlign: 'right' }}>{ago((f.at as any) ?? Date.now())}</T>
              </View>
              <T v="sub" style={{ lineHeight: 20 }}>{f.text}</T>
              {answered && !!f.reply && (
                <View style={{ borderRadius: R.md, padding: 10, backgroundColor: 'rgba(20,196,122,0.08)', gap: 3 }}>
                  <T v="caption" color={t.success} style={{ fontWeight: '800' }}>
                    Sudah dibalas{f.handledBy ? ` oleh ${f.handledBy}` : ''}{f.reward ? ` · apresiasi +${f.reward} koin` : ''}
                  </T>
                  <T v="sub" style={{ lineHeight: 19 }}>{f.reply}</T>
                </View>
              )}
              {!answered && (
                <View style={{ gap: 8 }}>
                  <NeuInput icon="chatbubbles" placeholder="Tulis balasan untuk pengguna ini…" value={d.reply} onChangeText={(s) => setDrafts((x) => ({ ...x, [f.id]: { ...d, reply: s } }))} multiline maxLength={1200} />
                  <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                    <View style={{ width: 130 }}>
                      <NeuInput placeholder="Koin (0)" value={d.reward} onChangeText={(s) => setDrafts((x) => ({ ...x, [f.id]: { ...d, reward: s.replace(/\D/g, '') } }))} keyboardType="number-pad" />
                    </View>
                    <Btn small title="Balas & apresiasi" icon="gift" loading={busyId === f.id} onPress={() => sendReply(f)} style={{ flex: 1 }} />
                    <Btn small variant="ghost" icon="trash" title="" onPress={() => deleteFeedback(f.id)} />
                  </View>
                  <T v="caption" color={t.faint}>Apresiasi koin masuk otomatis ke saldo pengguna + tercatat di ledger (maks 6000).</T>
                </View>
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

type Tab = 'overview' | 'users' | 'chats' | 'orders' | 'reports' | 'appeals' | 'feedback' | 'content' | 'ai' | 'guard' | 'grow' | 'voucher' | 'system';

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
  // HAPUS GRUP dari admin panel — konfirmasi dulu, hapus permanen chat + pesan
  const [askDeleteChat, setAskDeleteChat] = useState<string | null>(null);
  const [seedMsg, setSeedMsg] = useState('');
  const [seedBusy, setSeedBusy] = useState(false);
  const [rulesProbes, setRulesProbes] = useState<RuleProbe[]>([]);
  const [allMsg, setAllMsg] = useState('');
  const [allBusy, setAllBusy] = useState(false);
  const [botMsg, setBotMsg] = useState('');
  const [botBusy, setBotBusy] = useState(false);
  // editor profil Zeroid AI (hanya developer/admin) — nama, bio, avatar, banner
  const [aiName, setAiName] = useState('');
  const [aiBio, setAiBio] = useState('');
  const [aiAvatar, setAiAvatar] = useState<string | null>(null);
  const [aiBanner, setAiBanner] = useState<string | null>(null);
  const [aiBannerType, setAiBannerType] = useState<'image' | 'video'>('image');
  const [aiBusy, setAiBusy] = useState(false);
  // kelola transaksi: edit catatan + hapus
  const [editOrder, setEditOrder] = useState<string | null>(null);
  const [editNote, setEditNote] = useState('');
  const [deleteOrderId, setDeleteOrder] = useState<string | null>(null);

  // form editor AI diisi ulang setiap tab 'ai' dibuka / profil berubah (realtime dari Firestore)
  useEffect(() => {
    if (tab !== 'ai') return;
    const p = db.aiProfile;
    setAiName(p?.name ?? 'Zeroid AI');
    setAiBio(p?.bio ?? 'Asisten AI · selalu online');
    setAiAvatar(p?.avatar ?? null);
    setAiBanner(p?.banner ?? null);
    setAiBannerType(p?.bannerType === 'video' ? 'video' : 'image');
  }, [tab, db.aiProfile?.updatedAt, db.aiProfile?.name, db.aiProfile?.bio, db.aiProfile?.avatar, db.aiProfile?.banner]);

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
  const [openFeedbackCount, setOpenFeedbackCount] = useState(0);
  React.useEffect(() => {
    if (tab !== 'overview' && tab !== 'feedback') return;
    const unsub = subscribeAllFeedback((list) => setOpenFeedbackCount(list.filter((f) => f.status === 'open').length));
    return () => unsub();
  }, [tab]);
  const openFeedback = openFeedbackCount;

  const runSeedSupabase = async () => {
    setSeedBusy(true);
    setSeedMsg('');
    try {
      const token = await firebase()?.auth.currentUser?.getIdToken();
      if (!token) throw new Error('Belum masuk — login ulang sebagai admin.');
      const r = await proxyPost<{ ok: boolean; message?: string; error?: string }>('/api/supabase-seed', { token }, 60000);
      setSeedMsg(r.ok ? `${r.message ?? 'Seed selesai.'}` : `Gagal: ${r.error ?? 'Seed gagal.'}`);
    } catch (e: any) {
      setSeedMsg(`Gagal: ${String(e?.message ?? 'Gagal menghubungi server.').slice(0, 160)}`);
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
            ['feedback', `Masukan${openFeedback ? ` ${openFeedback}` : ''}`],
            ['guard', 'AI Guard'],
            ['grow', 'Tumbuhkan'],
            ['voucher', 'Voucher'],
            ['content', 'Konten'],
            ['ai', 'Zeroid AI'],
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
        {tab === 'feedback' && <FeedbackPanel />}
        {tab === 'guard' && <GuardPanel />}
        {tab === 'grow' && <GrowPanel />}
        {tab === 'voucher' && <VoucherPanel />}
        {tab === 'overview' && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 22 }}>
              <Stat icon="people" label={`Pengguna · ${stats.online} online`} value={stats.users} color={t.accent} />
              <Stat icon="chatbubbles" label={`hari ini: ${stats.today} pesan`} value={stats.msgs} color="#7B61FF" />
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
            {users.map((u) => {
              // DEVELOPER UTAMA — anti-ban & tidak bisa diatur siapa pun:
              // semua tombol aksi (Ban/VIP/Verifikasi/Centang/Role) disembunyikan.
              const owner = isOwnerDev(u) || u.ownerDev === true;
              return (
              <Neu key={u.id} radius={R.lg} style={{ padding: 14, marginBottom: 12, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar uri={u.avatar} name={u.name} color={u.color} size={46} online={isOnline(u)} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <T v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{u.name}</T>
                      <UserBadges user={u} />
                      {owner && (
                        <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#FFB300' }}>
                          <T v="caption" color="#3a2600" style={{ fontSize: 10, fontWeight: '800' }}>OWNER</T>
                        </View>
                      )}
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
                {owner ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="shield-checkmark" size={15} color="#FFB300" />
                    <T v="caption" style={{ flex: 1, color: '#FFB300', fontWeight: '700' }}>Developer utama — anti-ban, tidak bisa diatur dari panel mana pun.</T>
                  </View>
                ) : u.id !== me.id && (
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
                {!owner && u.id !== me.id && (
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {(['user', 'moderator', 'admin'] as const).map((r) => (
                      <Btn key={r} small variant={u.role === r ? 'primary' : 'ghost'} title={r} onPress={() => adminSetRole(u.id, r)} style={{ height: 32 }} />
                    ))}
                  </View>
                )}
              </Neu>
              );
            })}
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
                      <Btn small variant="ghost" icon="trash" title="Hapus grup" onPress={() => setAskDeleteChat(c.id)} style={{ height: 34 }} />
                    </View>
                  </Neu>
                );
              })}
            </Card>
          </>
        )}

        {tab === 'orders' && (
          <>
            <PaymentsConfigPanel />
            {db.orders.length === 0 && <Empty icon="receipt-outline" title="Belum ada transaksi" body="Pesanan VIP, Member, Centang biru, Keamanan, Cek Nomor, Netflix & AlightMotion akan muncul di sini." />}
            {db.orders.map((o) => {
              const p = productSafe(o.product);
              const buyer = db.users[o.userId];
              const isApi = !!apiProductOf(o.product);
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
                  {/* input produk API (nomor/email) */}
                  {!!o.meta && (!!o.meta.nomor || !!o.meta.email) && (
                    <T v="caption">Target: {o.meta.nomor ? `📞 ${o.meta.nomor}` : ''}{o.meta.email ? `${o.meta.nomor ? ' · ' : ''}✉️ ${o.meta.email}` : ''}</T>
                  )}
                  {/* BUKTI PEMBAYARAN */}
                  {o.proofUrl ? (
                    <Pressable onPress={() => nav.navigate('MediaViewer', { uri: o.proofUrl })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Image source={{ uri: o.proofUrl }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: t.bg2 }} contentFit="cover" />
                      <View style={{ flex: 1 }}>
                        <T v="caption" style={{ fontWeight: '800' }} color={t.success}>Bukti pembayaran ✓</T>
                        <T v="caption" color={t.faint}>Ketuk untuk memperbesar</T>
                      </View>
                    </Pressable>
                  ) : o.status === 'pending' && (
                    <T v="caption" color={t.warning}>Belum ada bukti pembayaran dari pembeli.</T>
                  )}
                  {/* status realisasi API */}
                  {isApi && o.status === 'paid' && (
                    o.delivered ? (
                      <View style={{ borderRadius: R.md, padding: 10, backgroundColor: 'rgba(20,196,122,0.1)', gap: 4 }}>
                        <T v="caption" style={{ fontWeight: '800' }} color={t.success}>Hasil sudah dikirim ke pembeli</T>
                        <T v="caption" numberOfLines={4} color={t.sub}>{(() => { try { const rr = o.result?.json ? JSON.parse(o.result.json) : o.result; return JSON.stringify(rr).slice(0, 400); } catch { return String(o.result?.json ?? o.result ?? '').slice(0, 400); } })()}</T>
                      </View>
                    ) : o.deliveryError ? (
                      <T v="caption" color={t.warning}>Realisasi otomatis gagal: {o.deliveryError} — kirim hasil manual ke pembeli.</T>
                    ) : (
                      <T v="caption" color={t.accent}>Menunggu realisasi otomatis (Check Nomor/Netflix/AM)…</T>
                    )
                  )}
                  {!!o.adminNote && <T v="caption" color={t.sub}>Catatan: {o.adminNote}</T>}
                  {o.status === 'pending' ? (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn small icon="checkmark" title="Konfirmasi" onPress={() => adminDecideOrder(o.id, true)} style={{ flex: 1 }} />
                      <Btn small variant="neu" title="Tolak" onPress={() => adminDecideOrder(o.id, false)} style={{ flex: 1 }} />
                    </View>
                  ) : (
                    <T v="sub" color={o.status === 'paid' ? t.success : t.danger}>
                      {o.status === 'paid' ? (isApi ? 'Lunas — hasil dikirim otomatis' : 'Lunas — fitur sudah aktif') : 'Ditolak'}
                    </T>
                  )}
                  {/* EDIT TRANSAKSI: status manual + catatan + hapus */}
                  <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                    {o.status !== 'paid' && <Btn small variant="ghost" icon="checkmark-done" title="Tandai lunas" onPress={() => adminUpdateOrder(o.id, { status: 'paid' })} style={{ height: 32 }} />}
                    {o.status !== 'pending' && <Btn small variant="ghost" icon="time" title="Jadikan pending" onPress={() => adminUpdateOrder(o.id, { status: 'pending' })} style={{ height: 32 }} />}
                    <Btn small variant="ghost" icon="create" title="Catatan" onPress={() => (setEditOrder(o.id), setEditNote(o.adminNote ?? ''))} style={{ height: 32 }} />
                    <Btn small variant="danger" icon="trash" title="Hapus" onPress={() => setDeleteOrder(o.id)} style={{ height: 32 }} />
                    <Btn small variant="ghost" icon="chatbubbles" title="Chat" onPress={() => nav.navigate('ChatRoom', { chatId: o.chatId })} style={{ height: 32 }} />
                  </View>
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

        {tab === 'ai' && (
          <>
            <Card title="Profil Zeroid AI">
              <View style={{ padding: 10, gap: 14 }}>
                <T v="sub">Profil ini tampil untuk SEMUA pengguna: header chat AI, info chat, Discover, nama balasan AI, dan kepribadian jawaban AI. Hanya developer/admin yang bisa mengubah.</T>
                {/* pratinjau seperti yang dilihat pengguna */}
                <View style={{ borderRadius: R.lg, overflow: 'hidden', backgroundColor: t.bg2 }}>
                  {aiBanner ? (
                    <View style={{ height: 110 }}>
                      <BannerMedia uri={aiBanner} video={aiBannerType === 'video'} height={110} />
                    </View>
                  ) : (
                    <View style={{ height: 74, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                      <T v="caption" color={t.accent} style={{ fontWeight: '700' }}>Belum ada banner — ikon AI dipakai</T>
                    </View>
                  )}
                  <View style={{ alignItems: 'center', marginTop: aiBanner ? -40 : 10, paddingBottom: 12 }}>
                    <View style={{ borderRadius: 44, borderWidth: 3, borderColor: t.bg, overflow: 'hidden' }}>
                      {aiAvatar ? (
                        <Image source={{ uri: aiAvatar }} style={{ width: 84, height: 84 }} contentFit="cover" />
                      ) : (
                        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="sparkles" size={34} color="#fff" />
                        </View>
                      )}
                    </View>
                    <T v="h3" style={{ marginTop: 6 }}>{aiName.trim() || 'Zeroid AI'}</T>
                    <T v="caption" color={t.faint} numberOfLines={1}>{aiBio.trim() || 'Asisten AI · selalu online'}</T>
                  </View>
                </View>
                <NeuInput icon="text" placeholder="Nama AI (mis. Zeroid AI)" value={aiName} onChangeText={setAiName} maxLength={60} />
                <NeuInput icon="document-text" placeholder="Bio AI (mis. Asisten AI · selalu online)" value={aiBio} onChangeText={setAiBio} multiline maxLength={300} />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  <Btn small variant="neu" icon="image" title={aiBusy ? '…' : 'Ganti foto AI'} onPress={async () => {
                    const p = await pickGallery('images');
                    if (!p) return;
                    setAiBusy(true);
                    try {
                      const r = await uploadMedia(p.uri, `ai/avatar_${Date.now()}.jpg`, 'image/jpeg');
                      setAiAvatar(r.url);
                      pushBanner({ title: 'Foto siap', body: 'Tekan Simpan untuk menerapkan.', icon: 'checkmark-circle' });
                    } catch (e: any) {
                      pushBanner({ title: 'Upload gagal', body: String(e?.message ?? '').slice(0, 120), icon: 'alert' });
                    } finally { setAiBusy(false); }
                  }} />
                  <Btn small variant="neu" icon="images" title={aiBusy ? '…' : 'Ganti banner'} onPress={async () => {
                    const p = await pickGallery('all');
                    if (!p) return;
                    setAiBusy(true);
                    try {
                      if (p.mime?.startsWith('video') || /\.mp4$/i.test(p.name ?? '')) {
                        const size = p.size ?? 0;
                        const r = size > 3.2 * 1024 * 1024
                          ? await uploadMediaDirect(p.uri, (p.name ?? 'aibanner').replace(/[^\w.-]/g, '_'), p.mime ?? 'video/mp4')
                          : await uploadMedia(p.uri, `ai/banner_${Date.now()}.mp4`, p.mime ?? 'video/mp4');
                        setAiBanner(r.url); setAiBannerType('video');
                      } else {
                        const r = await uploadMedia(p.uri, `ai/banner_${Date.now()}.jpg`, 'image/jpeg');
                        setAiBanner(r.url); setAiBannerType('image');
                      }
                      pushBanner({ title: 'Banner siap', body: 'Tekan Simpan untuk menerapkan.', icon: 'checkmark-circle' });
                    } catch (e: any) {
                      pushBanner({ title: 'Upload gagal', body: String(e?.message ?? '').slice(0, 120), icon: 'alert' });
                    } finally { setAiBusy(false); }
                  }} />
                  {(aiBanner || aiAvatar) && (
                    <Btn small variant="ghost" icon="trash" title="Reset visual" onPress={() => { setAiAvatar(null); setAiBanner(null); setAiBannerType('image'); }} />
                  )}
                </View>
                <Btn
                  title={aiBusy ? 'Menyimpan…' : 'Simpan profil AI'}
                  icon="checkmark"
                  loading={aiBusy}
                  disabled={aiBusy}
                  onPress={async () => {
                    setAiBusy(true);
                    const r = await updateAiProfile({ name: aiName, bio: aiBio, avatar: aiAvatar, banner: aiBanner, bannerType: aiBannerType });
                    setAiBusy(false);
                    if (r.ok) pushBanner({ title: 'Profil AI tersimpan', body: 'Semua pengguna melihat profil baru dalam hitungan detik.', icon: 'checkmark-circle' });
                    else pushBanner({ title: 'Gagal menyimpan', body: r.error ?? 'Coba lagi.', icon: 'alert' });
                  }}
                />
                <T v="caption" color={t.faint}>Nama & bio juga otomatis dipakai AI saat menjawab (persona server-side), banner bisa foto atau video loop.</T>
              </View>
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
              <Row
                icon="server"
                title="Cek izin server (Rules)"
                subtitle="Tes check-in / sekali lihat / ban-IP ditolak atau tidak oleh Firestore"
                onPress={async () => {
                  const probes: RuleProbe[] = await checkServerRules(me);
                  rulesBanner(probes);
                  setRulesProbes(probes);
                }}
                chevron
              />
              {rulesProbes.length > 0 && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 8, gap: 4 }}>
                  {rulesProbes.map((p) => (
                    <T key={p.key} v="caption" style={{ color: p.ok ? '#0E9F6E' : t.danger }}>
                      {p.ok ? '✓' : '✗'} {p.label}{!p.ok && p.hint ? ` — ${p.hint}` : ''}
                    </T>
                  ))}
                </View>
              )}
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
      <Sheet visible={!!editOrder} onClose={() => setEditOrder(null)} title="Catatan transaksi">
        <View style={{ gap: 12 }}>
          <T v="sub">Catatan internal pada transaksi (terlihat hanya di panel admin). Simpan juga bila perlu mencatat pembayaran manual.</T>
          <NeuInput placeholder="mis. DANA terverifikasi, transfer masuk 12:30" value={editNote} onChangeText={setEditNote} maxLength={300} multiline />
          <Btn small icon="checkmark" title="Simpan catatan" onPress={() => { if (editOrder) adminUpdateOrder(editOrder, { adminNote: editNote.trim() }); setEditOrder(null); }} />
        </View>
      </Sheet>
      <Confirm
        visible={!!deleteOrderId}
        title="Hapus transaksi ini?"
        body="Transaksi dihapus dari daftar dan tidak bisa dikembalikan. Data pembayaran/bukti ikut hilang."
        confirm="Hapus"
        danger
        onConfirm={() => { if (deleteOrderId) adminDeleteOrder(deleteOrderId); setDeleteOrder(null); }}
        onClose={() => setDeleteOrder(null)}
      />
      <Confirm
        visible={!!askDeleteChat}
        title={`Hapus ${db.chats[askDeleteChat ?? '']?.type === 'channel' ? 'saluran' : 'grup'} ini?`}
        body={`"${db.chats[askDeleteChat ?? '']?.name ?? ''}" akan dihapus PERMANEN untuk semua anggota — termasuk seluruh isi pesannya. Tindakan ini tidak bisa dibatalkan.`}
        confirm="Hapus permanen"
        danger
        onConfirm={async () => {
          const id = askDeleteChat;
          setAskDeleteChat(null);
          if (!id) return;
          const r = await adminDeleteChat(id);
          pushBanner(r.ok
            ? { title: 'Grup dihapus', body: 'Chat + seluruh pesannya sudah dihapus permanen.', icon: 'checkmark-circle' }
            : { title: 'Gagal menghapus', body: r.error ?? 'Coba lagi.', icon: 'alert' });
        }}
        onClose={() => setAskDeleteChat(null)}
      />
    </Screen>
  );
}
