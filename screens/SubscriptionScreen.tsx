/**
 * SUBSCRIPTION BILLING UI (v27) — fitur baru diminta pemilik:
 * "Lanjut ke fitur baru subscription billing ui… modern tetep jugaa memakai
 *  payment dana dan qris… ada animasi sukses dengan svg nya bagus".
 *
 * Layar "Langganan" (Billing):
 *  1. HERO kartu tagihan — SVG animasi (koin melayang + kilau gradien) +
 *     ringkasan tagihan 30 hari terakhir (nyata dari orders).
 *  2. LANGGANAN AKTIF — ring SVG animasi sisa hari (VIP/Member/Keamanan),
 *     tanggal berakhir, chip status AKTIF/SEGERA BERAKHIR.
 *  3. PAKET & SIKLUS — pilih siklus (1/3/12 bulan) → TOTAL TAGIHAN berubah
 *     langsung (angka besar) → bayar pakai DANA / QRIS (hanya 2 metode).
 *  4. ALUR PEMBAYARAN — order dibuat (pending) → QRIS dinamis nominal tepat
 *     (atau nomor DANA copy-able) → WAJIB unggah bukti transfer → admin
 *     konfirmasi → eksekusi otomatis (alur yang sama dengan Premium).
 *  5. RIWAYAT TAGIHAN — invoice rapi per pesanan (status chip, bukti, tanggal).
 *
 * Animasi sukses memakai FancyModal (konfeti SVG + suara CEKLING lib/sfx).
 * TANPA aset eksternal: semua logo/ikon/brosur digambar SVG inline (DANA biru,
 * QRIS hitam-putih, koin, struk) — aman offline & APK.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, ScrollView, Pressable, Modal, ActivityIndicator, Platform } from 'react-native';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Circle, Path, Rect, G, Defs, LinearGradient, Stop, ClipPath, Line } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { Header, Screen, T, Neu, Btn, Empty } from '../components/ui';
import { Sheet } from '../components/Sheet';
import { useTheme, R } from '../lib/theme';
import { useStore, createOrder, attachOrderProof } from '../lib/store';
import { PRODUCTS, productPlans, rupiah, rupiahShort, productOf, productSafe } from '../lib/products';
import { vanzzQris } from '../lib/vanzz';
import { pickGallery, uploadMedia } from '../lib/media';
import { pushBanner } from '../lib/bus';
import { chatTime } from '../lib/format';
import FancyModal from '../components/FancyModal';
import PurchaseTicker from '../components/PurchaseTicker';
import { sfx, haptic } from '../lib/sfx';
import { ProductKey } from '../lib/types';

/** Produk langganan (berulang) — centang biru sengaja TIDAK masuk (permanen,
 *  bukan langganan; tetap dibeli dari layar Premium). */
const SUB_PRODUCTS: ProductKey[] = ['vip', 'member', 'security'];
const isSubProduct = (k: string) => SUB_PRODUCTS.includes(k as ProductKey);

const AnimCircle = Animated.createAnimatedComponent(Circle);

/** Ring sisa hari — SVG animasi (circle mengisi sesuai sisa hari, denyut halus). */
function DaysRing({ frac, color, size = 64 }: { frac: number; color: string; size?: number }) {
  const p = useRef(useSharedValue(0)).current;
  const pulse = useRef(useSharedValue(0)).current;
  useEffect(() => {
    p.value = withTiming(Math.max(0.04, Math.min(1, frac)), { duration: 900, easing: Easing.out(Easing.cubic) });
    pulse.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [frac, p, pulse]);
  const r = 26;
  const C = 2 * Math.PI * r;
  const animP = useAnimatedProps(() => ({ strokeDashoffset: C * (1 - p.value) }));
  const animO = useAnimatedProps(() => ({ opacity: 0.22 + pulse.value * 0.16 }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 60 60">
        <Circle cx="30" cy="30" r={r} stroke={color} strokeWidth="5" opacity={0.15} fill="none" />
        <AnimCircle cx="30" cy="30" r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round"
          strokeDasharray={`${C} ${C}`} animatedProps={animP} transform="rotate(-90 30 30)" />
        <AnimCircle cx="30" cy="30" r={r + 4} stroke={color} strokeWidth="1.4" fill="none" animatedProps={animO} />
      </Svg>
      <View style={{ position: 'absolute' }}>
        <T v="h3" style={{ fontSize: 12 }}>{Math.round(Math.min(1, Math.max(0, frac)) * 100)}%</T>
      </View>
    </View>
  );
}

/** HERO — kartu tagihan dengan koin melayang + kilau gradien (SVG + animasi). */
function BillingHero({ spent30, activeCount }: { spent30: number; activeCount: number }) {
  const float = useRef(useSharedValue(0)).current;
  const shine = useRef(useSharedValue(0)).current;
  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }), -1, true);
    shine.value = withRepeat(withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [float, shine]);
  const coinA = useAnimatedStyle(() => ({ transform: [{ translateY: -float.value * 7 }] }));
  const coinB = useAnimatedStyle(() => ({ transform: [{ translateY: float.value * 6 }] }));
  const glow = useAnimatedStyle(() => ({ opacity: 0.07 + shine.value * 0.09 }));
  return (
    <View style={{ borderRadius: R.xl, overflow: 'hidden' }}>
      <Svg width="100%" height={148} viewBox="0 0 340 148" style={{ position: 'absolute', top: 0, left: 0, right: 0 }} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="billg" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#1E6BFF" />
            <Stop offset="0.55" stopColor="#7B3BFF" />
            <Stop offset="1" stopColor="#FF5A8A" />
          </LinearGradient>
        </Defs>
        <Rect width="340" height="148" fill="url(#billg)" />
        <Circle cx="24" cy="140" r="60" fill="#ffffff" opacity={0.08} />
      </Svg>
      {/* kilau + koin melayang: Animated.View absolut (robust web+APK) */}
      <Animated.View style={[{ position: 'absolute', top: -28, right: 40, width: 92, height: 92, borderRadius: 46, backgroundColor: '#fff' }, glow]} />
      <Animated.View style={[{ position: 'absolute', right: 22, bottom: 18 }, coinA]}>
        <Svg width={30} height={30} viewBox="0 0 30 30">
          <Circle cx="15" cy="15" r="14" fill="#FFD54A" /><Circle cx="15" cy="15" r="10" fill="#FFB300" />
          <Path d="M12.6 18.6 C12.6 21.2 14.9 22 17 22 L17 24 L18.8 24 L18.8 21.9 C21.3 21.7 22.7 20.3 22.7 18.4 C22.7 16.2 21.1 15.6 18.4 15.1 C16.1 14.6 15.4 14.2 15.4 13.4 C15.4 12.6 16.2 12 17.6 12 C18.9 12 19.7 12.6 19.9 13.6 L22.3 13 C21.8 11.1 20.4 10.1 18.8 9.9 L18.8 8 L17 8 L17 9.9 C14.8 10.1 13 11.4 13 13.4 C13 15.5 14.6 16.2 17.2 16.8 C19.5 17.3 20.3 17.7 20.3 18.6 C20.3 19.5 19.3 20.1 17.8 20.1 C16 20.1 15 19.3 14.8 18 L12.6 18.6 Z" fill="#8A5A00" opacity={0.85} transform="translate(-3 -3) scale(0.82)" />
        </Svg>
      </Animated.View>
      <Animated.View style={[{ position: 'absolute', right: 54, top: 14 }, coinB]}>
        <Svg width={20} height={20} viewBox="0 0 20 20">
          <Circle cx="10" cy="10" r="9" fill="#8FE3C0" /><Circle cx="10" cy="10" r="6" fill="#14C47A" />
          <Path d="M6.6 10.2 L9 12.8 L13.6 7.4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      <View style={{ padding: 18, paddingTop: 20, gap: 4 }}>
        <T v="caption" color="#FFFFFFB3" style={{ fontWeight: '700', letterSpacing: 0.4 }}>SUBSCRIPTION BILLING</T>
        <T v="h2" color="#fff" style={{ fontSize: 21 }}>Kelola langganan Zeroid</T>
        <T v="caption" color="#FFFFFFD9" style={{ lineHeight: 17, marginTop: 2, maxWidth: 230 }} numberOfLines={2}>
          Sisa masa aktif, perpanjangan, dan riwayat tagihan — semua di sini.
        </T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
            <T v="caption" color="#FFFFFFC7">Langganan aktif</T>
            <T v="h3" color="#fff" style={{ fontSize: 17 }}>{activeCount}</T>
          </View>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
            <T v="caption" color="#FFFFFFC7">Dibayar 30 hari</T>
            <T v="h3" color="#fff" style={{ fontSize: 17 }}>{spent30 > 0 ? rupiahShort(spent30) : '—'}</T>
          </View>
        </View>
      </View>
    </View>
  );
}



/** Badge metode pembayaran (SVG): DANA biru & QRIS — tanpa aset luar. */
function MethodBadges() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.bg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, boxShadow: t.raisedSm } as any}>
        <Svg width={20} height={20} viewBox="0 0 24 24"><Rect x="1" y="4" width="22" height="16" rx="4" fill="#118EEA" /><Path d="M6 9.2 C6 8 7 7.2 8.4 7.2 C9.6 7.2 10.5 7.8 10.8 8.7 L9.3 9.3 C9.1 8.9 8.8 8.7 8.4 8.7 C7.9 8.7 7.6 9 7.6 9.4 C7.6 9.8 7.9 10 8.8 10.3 C10.2 10.8 11 11.4 11 12.7 C11 14 9.9 14.9 8.4 14.9 C7 14.9 5.9 14.1 5.6 12.9 L7.1 12.3 C7.3 12.8 7.8 13.3 8.4 13.3 C8.9 13.3 9.3 13 9.3 12.6 C9.3 12.2 9 12 8.1 11.7 C6.8 11.2 6 10.6 6 9.2 Z" fill="#fff" /><Path d="M11.8 7.3 H13.6 L14.6 11.4 L15.7 7.3 H17 L18.1 11.4 L19.1 7.3 H20.9 L18.8 14.8 H17.3 L16.35 11.2 L15.4 14.8 H13.9 Z" fill="#fff" /></Svg>
        <T v="caption" style={{ fontWeight: '800' }}>DANA</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.bg, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, boxShadow: t.raisedSm } as any}>
        <Svg width={20} height={20} viewBox="0 0 24 24"><G fill={t.text}>
          <Rect x="3" y="3" width="7" height="7" rx="1.4" /><Rect x="14" y="3" width="7" height="7" rx="1.4" />
          <Rect x="3" y="14" width="7" height="7" rx="1.4" /><Rect x="14" y="14" width="3" height="3" />
          <Rect x="18" y="14" width="3" height="3" opacity={0.55} /><Rect x="14" y="18" width="3" height="3" opacity={0.55} />
          <Rect x="18" y="18" width="3" height="3" />
        </G></Svg>
        <T v="caption" style={{ fontWeight: '800' }}>QRIS</T>
      </View>
    </View>
  );
}

/** Chip status tagihan. */
function StatusChip({ status }: { status: string }) {
  const t = useTheme();
  const map: Record<string, { c: string; label: string }> = {
    pending: { c: '#F59E0B', label: 'Menunggu konfirmasi' },
    paid: { c: '#22c55e', label: 'Lunas' },
    rejected: { c: '#FF5A5F', label: 'Ditolak' },
  };
  const s = map[status] ?? { c: t.sub, label: status };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: s.c + '1A', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.c }} />
      <T v="caption" color={s.c} style={{ fontWeight: '800', fontSize: 11 }}>{s.label}</T>
    </View>
  );
}

export default function SubscriptionScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { db, me } = useStore();
  const pay = db.payments;

  // ================= ALUR PEMBAYARAN (DANA + QRIS + BUKTI) =================
  const [buy, setBuy] = useState<{ product: ProductKey; plan: number } | null>(null);
  const [method, setMethod] = useState<'qris' | 'dana' | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderPrice, setOrderPrice] = useState(0);
  const [qrisImg, setQrisImg] = useState<string | null>(null);
  const [qrisBusy, setQrisBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState(false);
  const [placed, setPlaced] = useState<{ title: string; body: string } | null>(null);

  // siklus terpilih per produk (default paket pertama)
  const [cycle, setCycle] = useState<Record<string, number>>({});

  const myOrders = useMemo(() => db.orders.filter((o) => o.userId === me?.id && isSubProduct(String(o.product))), [db.orders, me?.id]);
  const spent30 = useMemo(() => {
    const cut = Date.now() - 30 * 86400000;
    return myOrders.filter((o) => o.status === 'paid' && o.createdAt >= cut).reduce((a, o) => a + (Number(o.price) || 0), 0);
  }, [myOrders]);

  const activeCount = useMemo(() => {
    if (!me) return 0;
    let n = 0;
    if ((me.vipUntil ?? 0) > Date.now()) n++;
    if ((me.memberUntil ?? 0) > Date.now()) n++;
    if (!!me.security) n++;
    return n;
  }, [me]);

  const openBuy = (product: ProductKey, planIdx: number) => {
    sfx('pop');
    setBuy({ product, plan: planIdx });
    setMethod(null);
    setOrderId(null);
    setQrisImg(null);
  };

  /** Pilih metode → order PENDING dibuat → tampilkan detail bayar. */
  const chooseMethod = (m: 'qris' | 'dana') => {
    if (!buy || !me) return;
    const price = planPrice(buy.product, buy.plan);
    const r = createOrder(buy.product, buy.plan, m);
    if (r && 'error' in r) { pushBanner({ title: 'Pembelian dibatasi', body: r.error, icon: 'alert' }); return; }
    if (r && 'orderId' in r) {
      setOrderId(r.orderId);
      setOrderPrice(price);
      setMethod(m);
      if (m === 'qris') {
        setQrisBusy(true); setQrisImg(null);
        vanzzQris(price).then((qr) => { setQrisImg(qr.image ?? pay?.qrisImage ?? null); setQrisBusy(false); }).catch(() => { setQrisImg(pay?.qrisImage ?? null); setQrisBusy(false); });
      }
    }
  };

  /** Unggah bukti transfer → sukses modal + CEKLING. */
  const uploadProof = async () => {
    if (!orderId || proofBusy) return;
    setProofBusy(true);
    try {
      const picked = await pickGallery('images');
      if (!picked) return;
      const up = await uploadMedia(picked.uri, `bukti/${orderId}/${Date.now()}_${picked.name ?? 'bukti.jpg'}`, picked.mime || 'image/jpeg');
      if (!up?.url) throw new Error('Upload gagal — coba lagi.');
      const r = await attachOrderProof(orderId, up.url);
      if (!r.ok) throw new Error(r.error ?? 'Gagal menyimpan bukti.');
      sfx('success'); haptic('success');
      setBuy(null); setMethod(null); setOrderId(null);
      setPlaced({ title: 'Tagihan dibuat!', body: 'Bukti terkirim. Admin akan mengonfirmasi, lalu langgananmu langsung aktif otomatis.' });
    } catch (e: any) {
      pushBanner({ title: 'Bukti gagal', body: String(e?.message ?? 'Coba lagi.').slice(0, 140), icon: 'alert' });
    } finally {
      setProofBusy(false);
    }
  };

  const planPrice = (k: ProductKey, idx: number) => productPlans(k)[idx]?.price ?? 0;
  const planLabel = (k: ProductKey, idx: number) => productPlans(k)[idx]?.label ?? '-';

  if (!me) return null;

  return (
    <Screen>
      <Header title="Langganan" subtitle="Billing · Paket · Riwayat tagihan" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center', gap: 18 }}>
        {/* HERO */}
        <BillingHero spent30={spent30} activeCount={activeCount} />

        {/* v29.2 PERMINTAAN PEMILIK: pengumuman pembelian BERJALAN ke kiri terus
            (pembeli apapun, semua produk) — di bawah kartu teratas (bukan di atas
            banget), TIDAK pernah hilang; pembelian baru masuk otomatis real-time */}
        <PurchaseTicker />

        {/* METODE PEMBAYARAN — v29: susunan TUMPUK (dulu 3 kolom digencet badge →
            judul patah "pembayara-n" + caption jadi 7 baris pendek jelek) */}
        <Neu radius={R.xl} style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ionicons name="card" size={20} color={t.accent} />
            </View>
            <T v="h3" style={{ fontSize: 15, flex: 1 }} numberOfLines={1}>Metode pembayaran</T>
            <MethodBadges />
          </View>
          <T v="caption" color={t.sub} numberOfLines={1}>DANA & QRIS saja — dikonfirmasi admin.</T>
        </Neu>

        {/* LANGGANAN AKTIF */}
        <View style={{ gap: 10 }}>
          <T v="h3" style={{ fontSize: 16, marginLeft: 4 }}>Langganan aktif</T>
          {(() => {
            const rows = [
              { k: 'vip' as ProductKey, until: me.vipUntil ?? 0 },
              { k: 'member' as ProductKey, until: me.memberUntil ?? 0 },
              { k: 'security' as ProductKey, until: !!me.security ? Number.MAX_SAFE_INTEGER - 1 : 0 },
            ].filter((r) => r.until > Date.now());
            if (!rows.length) {
              return (
                <Neu radius={R.xl} style={{ padding: 18, alignItems: 'center', gap: 6 }}>
                  <Svg width={54} height={54} viewBox="0 0 24 24"><G stroke={t.sub} strokeWidth={1.5} fill="none" strokeLinecap="round" opacity={0.6}><Rect x="4" y="3" width="16" height="18" rx="3" /><Line x1="8" y1="8" x2="16" y2="8" /><Line x1="8" y1="12" x2="16" y2="12" /><Line x1="8" y1="16" x2="12" y2="16" /></G></Svg>
                  <T v="h3" style={{ fontSize: 15 }}>Belum ada langganan aktif</T>
                  <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>Pilih paket di bawah — sisa masa aktif akan tampil di sini dengan ring animasi.</T>
                </Neu>
              );
            }
            return rows.map((r) => {
              const p = productOf(r.k);
              const permanent = r.until > Number.MAX_SAFE_INTEGER - 10;
              const leftMs = r.until - Date.now();
              const leftD = Math.max(0, Math.ceil(leftMs / 86400000));
              const frac = Math.min(1, leftD / 30);
              const soon = !permanent && leftD <= 7;
              return (
                <Neu key={r.k} radius={R.xl} style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <DaysRing frac={permanent ? 1 : frac} color={soon ? '#FF5A5F' : p.color} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <T v="h3" style={{ fontSize: 15 }}>{p.title}</T>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: (soon ? '#FF5A5F' : '#22c55e') + '1A', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: soon ? '#FF5A5F' : '#22c55e' }} />
                        <T v="caption" color={soon ? '#FF5A5F' : '#16a34a'} style={{ fontWeight: '800', fontSize: 10.5 }}>{soon ? 'Segera berakhir' : 'AKTIF'}</T>
                      </View>
                    </View>
                    <T v="caption" color={t.sub}>{permanent ? 'Aktif permanen — tidak ada tagihan berulang' : `Berakhir ${chatTime(r.until)} — sisa ${leftD} hari`}</T>
                  </View>
                  <Btn title={permanent ? 'Lihat' : 'Perpanjang'} small onPress={() => openBuy(r.k, 0)} style={{ backgroundColor: p.color }} />
                </Neu>
              );
            });
          })()}
        </View>

        {/* PAKET & SIKLUS */}
        <View style={{ gap: 10 }}>
          <T v="h3" style={{ fontSize: 16, marginLeft: 4 }}>Paket langganan</T>
          {SUB_PRODUCTS.map((k) => {
            const p = productOf(k);
            const plans = productPlans(k);
            const sel = cycle[k] ?? 0;
            const price = plans[sel]?.price ?? 0;
            const isActive = k === 'vip' ? (me.vipUntil ?? 0) > Date.now() : k === 'member' ? (me.memberUntil ?? 0) > Date.now() : !!me.security;
            return (
              <Neu key={k} radius={R.xl} style={{ padding: 0, overflow: 'hidden' }}>
                <View style={{ height: 4, backgroundColor: p.color }} />
                <View style={{ padding: 15, gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: p.color + '1E', alignItems: 'center', justifyContent: 'center' }}>
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        {k === 'vip' ? (<G><Path d="M3 7 L7 4 L12 7 L17 4 L21 7 L19.4 17 A2 2 0 0 1 17.4 19 H6.6 A2 2 0 0 1 4.6 17 Z" fill={p.color} opacity={0.9} /><Path d="M9.4 10.6 L11 12.2 L14.6 8.6" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" /></G>) : k === 'member' ? (<G><Rect x="3.4" y="5" width="17.2" height="14" rx="3.4" fill={p.color} opacity={0.9} /><Circle cx="12" cy="11" r="2.6" fill="#fff" /><Path d="M7.4 17 C8 15 9.8 14.2 12 14.2 C14.2 14.2 16 15 16.6 17" stroke="#fff" strokeWidth="1.7" fill="none" strokeLinecap="round" /></G>) : (<G><Path d="M12 3 L19.4 6 V11 C19.4 15.8 16.4 19.4 12 21 C7.6 19.4 4.6 15.8 4.6 11 V6 Z" fill={p.color} opacity={0.9} /><Path d="M8.8 11.8 L11 14 L15.2 9.4" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></G>)}
                      </Svg>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <T v="h3" style={{ fontSize: 16 }}>{p.title}</T>
                        {isActive && <T v="caption" color="#16a34a" style={{ fontWeight: '800' }}>· aktif</T>}
                      </View>
                      <T v="caption" color={t.sub} numberOfLines={2}>{p.desc}</T>
                    </View>
                  </View>
                  {/* PERKS */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {p.perks.slice(0, 4).map((x) => (
                      <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.bg2, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 }}>
                        <Ionicons name="checkmark" size={11} color={p.color} />
                        <T v="caption" color={t.sub} style={{ fontSize: 10.5 }}>{x}</T>
                      </View>
                    ))}
                  </View>
                  {/* SIKLUS — total tagihan berubah langsung */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {plans.map((pl, i) => {
                      const on = i === sel;
                      return (
                        <Pressable key={pl.label} onPress={() => { sfx('pop'); setCycle((c) => ({ ...c, [k]: i })); }}
                          style={({ pressed }) => ({ borderRadius: 12, borderWidth: 1.6, borderColor: on ? p.color : t.border, backgroundColor: on ? p.color + '14' : t.bg, paddingHorizontal: 12, paddingVertical: 7, opacity: pressed ? 0.8 : 1 } as any)}>
                          <T v="caption" color={on ? p.color : t.sub} style={{ fontWeight: '800' }}>{pl.label}</T>
                          <T v="caption" color={on ? p.color : t.sub} style={{ fontSize: 10.5 }}>{rupiahShort(pl.price)}</T>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <View>
                      <T v="caption" color={t.sub}>Total tagihan ({planLabel(k, sel)})</T>
                      <T v="h2" style={{ fontSize: 24, color: p.color }}>{rupiah(price)}</T>
                    </View>
                    <Btn title="Berlangganan" onPress={() => openBuy(k, sel)} style={{ backgroundColor: p.color }} />
                  </View>
                </View>
              </Neu>
            );
          })}
        </View>

        {/* RIWAYAT TAGIHAN */}
        <View style={{ gap: 10 }}>
          <T v="h3" style={{ fontSize: 16, marginLeft: 4 }}>Riwayat tagihan</T>
          {myOrders.length === 0 ? (
            <Empty icon="receipt" title="Belum ada tagihan" body="Setiap pembelian langganan akan tercatat di sini sebagai invoice." />
          ) : (
            myOrders.slice(0, 12).map((o) => {
              const p = productSafe(String(o.product) as ProductKey);
              return (
                <Neu key={o.id} radius={R.lg} style={{ padding: 13, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: p.color + '1E', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="receipt" size={18} color={p.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T v="h3" style={{ fontSize: 14 }}>{p.title} — {o.plan || '-'}</T>
                      <T v="caption" color={t.sub}>{chatTime(o.createdAt)} · INV-{o.id.slice(-8).toUpperCase()}</T>
                    </View>
                    <T v="h3" style={{ fontSize: 14 }}>{rupiah(o.price)}</T>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <StatusChip status={o.status} />
                    {!!o.proofUrl && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="image" size={12} color={t.accent} /><T v="caption" color={t.accent} style={{ fontWeight: '700', fontSize: 11 }}>Bukti terlampir</T></View>}
                    {!!o.adminNote && <T v="caption" color={t.sub} numberOfLines={1}>Catatan: {o.adminNote}</T>}
                  </View>
                </Neu>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* SHEET METODE */}
      <Sheet visible={!!buy && !method} onClose={() => setBuy(null)} title="Pilih metode pembayaran">
        <View style={{ gap: 10, paddingBottom: 6 }}>
          {buy && (
            <View style={{ backgroundColor: t.bg2, borderRadius: 14, padding: 12, gap: 4 }}>
              <T v="caption" color={t.sub}>{productOf(buy.product).title} · {planLabel(buy.product, buy.plan)}</T>
              <T v="h2" style={{ fontSize: 20 }}>{rupiah(planPrice(buy.product, buy.plan))}</T>
            </View>
          )}
          <Pressable onPress={() => chooseMethod('qris')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm } as any)}>
            <Svg width={38} height={38} viewBox="0 0 24 24"><G fill={t.text}><Rect x="3" y="3" width="7" height="7" rx="1.4" /><Rect x="14" y="3" width="7" height="7" rx="1.4" /><Rect x="3" y="14" width="7" height="7" rx="1.4" /><Rect x="14" y="14" width="3" height="3" /><Rect x="18" y="14" width="3" height="3" opacity={0.55} /><Rect x="14" y="18" width="3" height="3" opacity={0.55} /><Rect x="18" y="18" width="3" height="3" /></G></Svg>
            <View style={{ flex: 1 }}>
              <T v="h3" style={{ fontSize: 15 }}>QRIS</T>
              <T v="caption" color={t.sub}>Scan sekali bayar — QR dinamis sesuai nominal</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.sub} />
          </Pressable>
          <Pressable onPress={() => chooseMethod('dana')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 14, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm } as any)}>
            <Svg width={38} height={38} viewBox="0 0 24 24"><Rect x="1" y="4" width="22" height="16" rx="4" fill="#118EEA" /><Path d="M6 9.2 C6 8 7 7.2 8.4 7.2 C9.6 7.2 10.5 7.8 10.8 8.7 L9.3 9.3 C9.1 8.9 8.8 8.7 8.4 8.7 C7.9 8.7 7.6 9 7.6 9.4 C7.6 9.8 7.9 10 8.8 10.3 C10.2 10.8 11 11.4 11 12.7 C11 14 9.9 14.9 8.4 14.9 C7 14.9 5.9 14.1 5.6 12.9 L7.1 12.3 C7.3 12.8 7.8 13.3 8.4 13.3 C8.9 13.3 9.3 13 9.3 12.6 C9.3 12.2 9 12 8.1 11.7 C6.8 11.2 6 10.6 6 9.2 Z" fill="#fff" /><Path d="M11.8 7.3 H13.6 L14.6 11.4 L15.7 7.3 H17 L18.1 11.4 L19.1 7.3 H20.9 L18.8 14.8 H17.3 L16.35 11.2 L15.4 14.8 H13.9 Z" fill="#fff" /></Svg>
            <View style={{ flex: 1 }}>
              <T v="h3" style={{ fontSize: 15 }}>DANA</T>
              <T v="caption" color={t.sub}>{pay?.danaNumber ? `Transfer ke ${pay.danaNumber}` : 'Transfer ke nomor DANA admin'}</T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={t.sub} />
          </Pressable>
        </View>
      </Sheet>

      {/* SHEET DETAIL BAYAR + BUKTI */}
      <Sheet visible={!!buy && !!method && !!orderId} onClose={() => { setBuy(null); setMethod(null); }} title={method === 'qris' ? 'Bayar dengan QRIS' : 'Bayar dengan DANA'}>
        <View style={{ gap: 12, paddingBottom: 8 }}>
          {/* INVOICE */}
          <View style={{ backgroundColor: t.bg2, borderRadius: 14, padding: 13, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="caption" color={t.sub}>INV-{String(orderId ?? '').slice(-8).toUpperCase()}</T>
              <T v="caption" color={t.sub}>Status: Menunggu bukti</T>
            </View>
            <T v="h2" style={{ fontSize: 22 }}>{rupiah(orderPrice)}</T>
            <T v="caption" color={t.sub}>{buy ? `${productOf(buy.product).title} · ${planLabel(buy.product, buy.plan)}` : ''}</T>
          </View>

          {method === 'qris' && (
            <View style={{ alignItems: 'center', gap: 8 }}>
              {qrisBusy ? (
                <View style={{ height: 220, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.accent} /><T v="caption" color={t.sub} style={{ marginTop: 8 }}>Membuat QR dinamis…</T></View>
              ) : qrisImg ? (
                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 10 }}>
                  <Image source={{ uri: qrisImg }} style={{ width: 210, height: 210 }} contentFit="contain" />
                </View>
              ) : (
                <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}><T v="caption" color={t.sub}>QR tidak tersedia — pakai DANA atau hubungi admin.</T></View>
              )}
              <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>Scan pakai aplikasi pembayaran apa pun yang mendukung QRIS.</T>
            </View>
          )}

          {method === 'dana' && (
            <View style={{ gap: 8 }}>
              <View style={{ backgroundColor: '#118EEA14', borderRadius: 14, padding: 14, gap: 4 }}>
                <T v="caption" color={t.sub}>Nomor DANA tujuan</T>
                <T v="h2" style={{ fontSize: 20, letterSpacing: 0.6 }}>{pay?.danaNumber || 'Belum diatur admin'}</T>
                {!!pay?.danaName && <T v="caption" color={t.sub}>a.n. {pay.danaName}</T>}
              </View>
              {!!pay?.danaNumber && (
                <Btn title="Salin nomor" icon="copy" onPress={async () => { await Clipboard.setStringAsync(String(pay?.danaNumber ?? '')); sfx('pop'); pushBanner({ title: 'Nomor disalin', body: 'Tempel di aplikasi DANA kamu.', icon: 'checkmark-circle' }); }} />
              )}
            </View>
          )}

          {!!pay?.note && (
            <View style={{ backgroundColor: t.bg2, borderRadius: 12, padding: 10 }}>
              <T v="caption" color={t.sub}>Catatan admin: {pay.note}</T>
            </View>
          )}

          <Btn title={proofBusy ? 'Mengunggah…' : 'Unggah bukti transfer'} icon="cloud-upload" onPress={uploadProof} disabled={proofBusy} />
          <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>Wajib unggah bukti agar admin bisa mengonfirmasi tagihanmu.</T>
        </View>
      </Sheet>

      {/* SUCCESS MODAL (konfeti + CEKLING) */}
      <FancyModal
        visible={!!placed}
        variant="success"
        title={placed?.title ?? ''}
        body={placed?.body ?? ''}
        onClose={() => { setPlaced(null); nav.navigate('Premium'); }}
      />
    </Screen>
  );
}
