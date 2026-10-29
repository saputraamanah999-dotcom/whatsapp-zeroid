import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { firebase, COLLECTIONS as C } from './firebase';
import { User } from './types';

/**
 * KOIN & REFERRAL — mesin reward untuk mempromosikan Zeroid.
 * - 1 koin = Rp1 → centang biru 49rb = 49.000 koin (harga koin = harga rupiah).
 * - Check-in harian: +1.000 koin, bonus +500 tiap 7 hari beruntun (jeda 20 jam).
 * - Ajak teman: pengundang +5.000, teman baru +1.000 — terdeteksi OTOMATIS dari link.
 * - Semua mutasi tercatat di koleksi `ledger` (audit + syarat rules).
 */

export const KOIN_PER_RP = 1;             // 1 koin = Rp1
export const rpToKoin = (rp: number) => Math.round(rp * KOIN_PER_RP);
export const koinToRp = (k: number) => Math.round(k / KOIN_PER_RP);

export const CHECKIN_BASE = 1000;
export const CHECKIN_STREAK_BONUS = 500;  // tiap kelipatan 7 hari beruntun
export const CHECKIN_GAP_MS = 20 * 3600 * 1000;
export const REF_REWARD_REFERRER = 5000;
export const REF_REWARD_NEWBIE = 1000;
/** batas kenaikan koin per tulisan (dipakai juga rules) */
export const POINTS_MAX_STEP = 6000;

export const fmtKoin = (n: number) => n.toLocaleString('id-ID');

/** kode referral pendek dari uid: zr + base36 6 karakter */
export function refCodeFor(uid: string): string {
  let h = '';
  for (let i = 0; i < uid.length; i++) h = ((h.charCodeAt(0) ^ uid.charCodeAt(i)) >>> 0).toString(36) + h.slice(1);
  return ('zr' + (uid + h).replace(/[^a-z0-9]/gi, '').slice(-6).toLowerCase()).slice(0, 8);
}

export function referralLink(code: string, meName?: string): string {
  if (typeof window === 'undefined') return `https://whatsapp-zeroid.vercel.app/?ref=${code}`;
  const u = new URL(window.location.origin);
  u.searchParams.set('ref', code);
  return u.toString();
}

export function shareText(code: string, meName?: string): string {
  return `Yuk gabung di Zeroid WhatsApp!\nChat, panggilan, story, musik, anime, AI — lengkap.\n` +
    `Daftar lewat link ini biar kita dua-duanya dapat koin:\n${referralLink(code, meName)}`;
}

export async function shareReferral(code: string, meName?: string) {
  const text = shareText(code, meName);
  try {
    const { Platform, Share } = require('react-native');
    if (Platform.OS !== 'web') {
      await Share.share({ message: text });
      return;
    }
  } catch { /* web → fallback di bawah */ }
  if (typeof navigator !== 'undefined' && (navigator as any).share) {
    try { await (navigator as any).share({ title: 'Ajak teman ke Zeroid', text }); return; } catch { }
  }
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  if (typeof window !== 'undefined') window.open(url, '_blank');
}

// ---------- deteksi otomatis link ?ref= ----------

const REF_KEY = 'zeroid-ref';

/** web: simpan ?ref=CODE dari URL promosi (dipanggil sekali di App start) */
export function captureRefFromUrl() {
  try {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const ref = (q.get('ref') ?? '').trim().toLowerCase();
    if (ref) window.localStorage.setItem(REF_KEY, ref);
  } catch { }
}

export const pendingRef = () => {
  try { return (typeof window !== 'undefined' ? window.localStorage.getItem(REF_KEY) : null) ?? ''; } catch { return ''; }
};

/**
 * Dipanggil saat profil baru dibuat (register / Google): beri reward pengundang
 * + pendatang baru dalam SATU batch (ledger + 2 user docs) — didukung rules v8.
 */
export async function applyPendingReferral(me: User): Promise<{ ok: boolean; rewarded?: number }> {
  const fb = firebase();
  if (!fb || !me?.id) return { ok: false };
  const code = pendingRef();
  if (!code || me.referredBy) return { ok: false };
  try { window.localStorage.removeItem(REF_KEY); } catch { }
  try {
    // cari pemilik kode (query users diperbolehkan rules untuk user masuk)
    const { collection, query, where, getDocs, increment } = await import('firebase/firestore');
    const qs = await getDocs(query(collection(fb.db, C.users), where('referralCode', '==', code)));
    const ownerDoc = qs.empty ? null : qs.docs[0];
    const owner = ownerDoc?.id ?? '';
    if (!owner || owner === me.id) return { ok: false };
    const { writeBatch } = await import('firebase/firestore');
    const batch = writeBatch(fb.db);
    // ledger = bukti unik per pendatang baru (rules mensyaratkan ini ada)
    batch.set(doc(fb.db, 'ledger', me.id + '_ref'), {
      uid: me.id, kind: 'referral_newbie', to: owner, delta: REF_REWARD_NEWBIE, at: Date.now(),
    });
    batch.update(doc(fb.db, C.users, me.id), { referredBy: owner, points: (me.points ?? 0) + REF_REWARD_NEWBIE });
    batch.update(doc(fb.db, C.users, owner), { points: increment(REF_REWARD_REFERRER), refCount: increment(1) });
    await batch.commit();
    return { ok: true, rewarded: REF_REWARD_NEWBIE };
  } catch {
    return { ok: false };
  }
}

/** Check-in harian: +1.000 koin, bonus +500 tiap 7 hari beruntun.
 *  ATOMIK (runTransaction): update koin user + bukti ledger ditulis SEKALIGUS —
 *  kalau bukti hari ini sudah ada, SELURUH transaksi ditolak server → mustahil
 *  klaim 2x / tap berkali-kali, dan tidak ada lagi state nyangkut
 *  (versi lama: ledger ketulis tapi update user gagal → tombol bisa dipencet terus).
 *  Nilai koin/streak dihitung dari DATA SERVER (bukan cache) biar anti manipulasi. */
export async function dailyCheckIn(me: User): Promise<{ ok: boolean; reward?: number; error?: string; already?: boolean }> {
  const fb = firebase();
  if (!fb || !me?.id) return { ok: false, error: 'Belum masuk.' };
  const now = Date.now();
  if (now - (me.lastCheckinAt ?? 0) < CHECKIN_GAP_MS) {
    const left = CHECKIN_GAP_MS - (now - (me.lastCheckinAt ?? 0));
    const h = Math.floor(left / 3600000), m = Math.ceil((left % 3600000) / 60000);
    return { ok: false, already: true, error: `Sudah check-in — kembali lagi dalam ${h} jam ${m} menit.` };
  }
  const yStart = new Date(now); yStart.setHours(0, 0, 0, 0);
  const yesterday = yStart.getTime() - 3600000; // toleransi jam
  const d = new Date(now);
  const dayId = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const ALREADY = { ok: false as const, already: true as const, error: 'Sudah check-in hari ini — kembali lagi besok!' };
  try {
    const { runTransaction, getDoc } = await import('firebase/firestore');
    const ledRef = doc(fb.db, 'ledger', `c_${me.id}_${dayId}`);
    const uRef = doc(fb.db, C.users, me.id);

    // --- PEMULIHAN STATE LAMA: bukti ledger ada tapi koin tak pernah masuk? ---
    const led = await getDoc(ledRef).catch(() => null);
    if (led && led.exists()) {
      const L: any = led.data() ?? {};
      const res = await runTransaction(fb.db, async (tx) => {
        const u = await tx.get(uRef);
        if (!u.exists()) throw new Error('Profil tidak ditemukan.');
        const srv: any = u.data();
        const prev = srv.lastCheckinAt ?? 0;
        if (now - prev < CHECKIN_GAP_MS) return false; // sudah dikredit (device lain duluan)
        const reward = Math.max(0, Math.min(6000, L.delta ?? CHECKIN_BASE));
        const streak = prev >= yesterday ? (srv.checkinStreak ?? 0) + 1 : Math.max(1, Math.min(L.streak ?? 1, (srv.checkinStreak ?? 0) + 1));
        tx.update(uRef, { points: (srv.points ?? 0) + reward, checkinStreak: streak, lastCheckinAt: now });
        return reward;
      });
      if (res === false) return ALREADY;
      return { ok: true, reward: res as number };
    }

    // --- JALUR NORMAL: satu transaction = update koin + bukti ledger ---
    const reward = await runTransaction(fb.db, async (tx) => {
      const u = await tx.get(uRef);
      if (!u.exists()) throw new Error('Profil tidak ditemukan.');
      const srv: any = u.data();
      const last = srv.lastCheckinAt ?? 0;
      if (now - last < CHECKIN_GAP_MS) throw ALREADY; // kalah kejar device lain → semua batal
      const streak = last >= yesterday ? (srv.checkinStreak ?? 0) + 1 : 1;
      const r = CHECKIN_BASE + (streak % 7 === 0 ? CHECKIN_STREAK_BONUS : 0);
      tx.update(uRef, { points: (srv.points ?? 0) + r, checkinStreak: streak, lastCheckinAt: now });
      // bukti unik per hari — kalau doc-nya sudah ada rules menolak UPDATE →
      // seluruh transaksi dibatalkan (koin tidak ikut masuk) = anti spam tap server.
      tx.set(ledRef, { uid: me.id, kind: 'checkin', delta: r, streak, at: now });
      return r;
    });
    return { ok: true, reward };
  } catch (e: any) {
    if (e === ALREADY || e?.already || e?.code === 'permission-denied') return ALREADY;
    return { ok: false, error: e?.message ?? 'Check-in gagal.' };
  }
}

/** Apakah tombol check-in HARUS terkunci sekarang? Dipanggil UI saat halaman dibuka:
 *  bukti ledger hari ini ada DAN koinnya sudah masuk → kunci tombol sejak awal,
 *  jangan tunggu user tap dulu baru dapat pesan "sudah check-in". */
export async function checkinLockedToday(me: User): Promise<boolean> {
  const fb = firebase();
  if (!fb || !me?.id) return false;
  try {
    const { getDoc } = await import('firebase/firestore');
    const d = new Date();
    const dayId = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const led = await getDoc(doc(fb.db, 'ledger', `c_${me.id}_${dayId}`)).catch(() => null);
    if (!led || !led.exists()) return false;
    const at = (led.data() as any)?.at ?? 0;
    return (me.lastCheckinAt ?? 0) >= at - 60000; // koin sudah masuk → kunci; belum → biarkan jalur pemulihan
  } catch { return false; }
}

/** Belanja dengan koin (kurangi saldo sendiri). Dipanggil sebelum membuat order. */
export async function spendKoin(me: User, amount: number, reason: string): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  if (!fb || !me?.id) return { ok: false, error: 'Belum masuk.' };
  if (amount <= 0) return { ok: false, error: 'Nominal tidak valid.' };
  if ((me.points ?? 0) < amount) return { ok: false, error: 'Koin belum cukup.' };
  try {
    await setDoc(doc(fb.db, 'ledger', `s_${me.id}_${Date.now()}`), {
      uid: me.id, kind: 'spend', reason, delta: -amount, at: Date.now(),
    }).catch(() => { });
    await updateDoc(doc(fb.db, C.users, me.id), { points: (me.points ?? 0) - amount });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Gagal memakai koin.' };
  }
}
