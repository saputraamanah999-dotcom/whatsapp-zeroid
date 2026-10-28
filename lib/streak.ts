import { doc, updateDoc } from 'firebase/firestore';
import { firebase, COLLECTIONS as C } from './firebase';
import { Chat, User } from './types';

/**
 * STREAK API — rawat bareng api & kucing di setiap chat.
 * - Bertambah +1 setiap ada pesan di hari beruntun (lokasi zona waktu perangkat).
 * - Api MUNCUL mulai streak 3 hari, makin lama makin besar.
 * - Setiap kelipatan 100 warna api berubah (siklus terus-menerus).
 * - Melemah bila 1 jam tidak ada aktivitas, PADAM bila 1 hari penuh kosong.
 * - Padam bisa dinyalakan lagi: maks 5x per bulan per pengguna.
 */

export const DAY_MS = 86400000;
export const FIRE_MIN_STREAK = 3;
export const REVIVES_PER_MONTH = 5;
/** api mulai melemah setelah 1 jam tanpa pesan (sesuai aturan aplikasi) */
export const DIM_AFTER_MS = 60 * 60 * 1000;
/** jendela hidupkan lagi: maks 7 hari setelah padam */
export const REVIVE_WINDOW_MS = 7 * DAY_MS;

/** Palet warna api — berubah tiap kelipatan 100, siklus terus menerus. */
export const FIRE_PALETTE = [
  '#FF8A00', '#FF3B5C', '#7B61FF', '#14C47A', '#1E6BFF', '#FFB300',
  '#FF5CA8', '#00C2FF', '#A3E635', '#F97316', '#8B5CF6', '#06B6D4',
];

export const dayStart = (t = Date.now()) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** index warna api: streak 3-99 → 0, 100-199 → 1, dst (siklus palet) */
export const fireColor = (count: number) =>
  count < FIRE_MIN_STREAK ? null : FIRE_PALETTE[Math.floor(count / 100) % FIRE_PALETTE.length];

export type FireState = {
  count: number;
  lit: boolean;      // api tampil (>=3 hari beruntun)
  dimmed: boolean;   // 1 jam tanpa pesan → api melemah
  dead: boolean;     // 1 hari penuh kosong → padam
  reviveable: boolean;
  revivesLeft: number;
  color: string | null;
  tier: number;      // kelipatan 100 (0,1,2…)
};

export const monthKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function revivesLeft(u: User | null | undefined, t = Date.now()): number {
  const used = u?.fireRevives?.[monthKey(t)] ?? 0;
  return Math.max(0, REVIVES_PER_MONTH - used);
}

export function fireState(chat: Chat | null | undefined, u: User | null | undefined, t = Date.now()): FireState {
  const count = chat?.streakCount ?? 0;
  const lastDay = chat?.streakDay ?? 0;
  const updatedAt = chat?.streakUpdatedAt ?? 0;
  const today = dayStart(t);
  const dead = count >= FIRE_MIN_STREAK && lastDay > 0 && today - lastDay >= 2 * DAY_MS;
  const reviveable = dead && count >= FIRE_MIN_STREAK && t - lastDay <= REVIVE_WINDOW_MS;
  return {
    count,
    lit: count >= FIRE_MIN_STREAK && !dead,
    dimmed: count >= FIRE_MIN_STREAK && !dead && t - updatedAt > DIM_AFTER_MS,
    dead,
    reviveable,
    revivesLeft: revivesLeft(u, t),
    color: fireColor(dead ? 0 : count),
    tier: Math.floor(count / 100),
  };
}

/**
 * Dipanggil SETELAH pesan berhasil terkirim. Naikkan streak bila ini pesan
 * pertama di hari baru, dan catat rekor ke bestStreak pemilik akun.
 */
export async function applyStreak(chat: Chat, me: User): Promise<void> {
  const fb = firebase();
  if (!fb || !me?.id) return;
  const today = dayStart();
  const lastDay = chat.streakDay ?? 0;
  let count = chat.streakCount ?? 0;
  if (lastDay === today) {
    if ((chat.streakUpdatedAt ?? 0) && Date.now() - (chat.streakUpdatedAt ?? 0) < 30000) return; // anti spam tulis
    updateDoc(doc(fb.db, C.chats, chat.id), { streakUpdatedAt: Date.now() }).catch(() => {});
    return;
  }
  count = today - lastDay === DAY_MS ? count + 1 : 1; // bolong → mulai dari 1 lagi
  const patch: Record<string, unknown> = {
    streakCount: count,
    streakDay: today,
    streakUpdatedAt: Date.now(),
  };
  const best = me.bestStreak ?? 0;
  if (count > best) patch.bestStreak = count;
  try {
    await updateDoc(doc(fb.db, C.chats, chat.id), patch);
  } catch { /* chat mungkin terhapus — abaikan */ }
  if (count > best) {
    updateDoc(doc(fb.db, C.users, me.id), { bestStreak: count }).catch(() => {});
  }
}

/**
 * Hidupkan api yang padam (maks 5x per bulan): streakDay digeser ke kemarin
 * sehingga pesan BERIKUTNYA melanjutkan streak — bukan memulai dari 1.
 */
export async function reviveFire(chat: Chat, me: User): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  if (!fb || !me?.id) return { ok: false, error: 'Belum masuk.' };
  const st = fireState(chat, me);
  if (!st.dead) return { ok: false, error: 'Api masih menyala.' };
  if (!st.reviveable) return { ok: false, error: 'Sudah lewat 7 hari — streak mulai dari awal.' };
  if (st.revivesLeft <= 0) return { ok: false, error: `Kesempatan hidupkan lagi bulan ini sudah habis (${REVIVES_PER_MONTH}x).` };
  const key = monthKey();
  const used = me.fireRevives?.[key] ?? 0;
  try {
    await updateDoc(doc(fb.db, C.users, me.id), { fireRevives: { ...(me.fireRevives ?? {}), [key]: used + 1 } });
    await updateDoc(doc(fb.db, C.chats, chat.id), { streakDay: dayStart() - DAY_MS, streakUpdatedAt: Date.now() });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Gagal menghidupkan api.' };
  }
}
