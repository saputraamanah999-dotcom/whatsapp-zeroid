/**
 * VOUCHER DISKON — dibuat developer/admin di Admin Panel, ditukarkan user
 * di halaman Zeroid Premium (diskon % untuk VIP / Member / Centang biru /
 * Keamanan, koin maupun transfer).
 *
 * Dokumen vouchers/{code}:
 *   { code, percent, maxUses, usedCount, usedBy: string[], expiresAt, active,
 *     note, createdBy, createdAt }
 *
 * ANTI MAIN-MAIN (rules v19):
 *  - read  : signedIn (perlu untuk validasi sebelum bayar — isinya tidak rahasia);
 *  - create/update/delete : HANYA admin;
 *  - update oleh user biasa HANYA pola penukaran: usedCount +1, usedBy += me,
 *    dan HANYA bila voucher aktif, belum kadaluarsa, kuota tersisa, dan
 *    user belum pernah memakainya — diverifikasi rules di sisi server.
 */
import {
  collection, doc, updateDoc, deleteDoc, setDoc,
  onSnapshot, runTransaction, getDoc, serverTimestamp,
} from 'firebase/firestore';
import { firebase } from './firebase';
import { User } from './types';

export type Voucher = {
  id: string;
  code: string;
  percent: number;
  maxUses: number;
  usedCount: number;
  usedBy: string[];
  expiresAt: number;
  active: boolean;
  note: string;
  createdBy: string;
  createdAt: number;
};

function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapVoucher(id: string, d: any): Voucher {
  return {
    id,
    code: String(d?.code ?? id).toUpperCase(),
    percent: Math.max(1, Math.min(100, Number(d?.percent ?? 0))),
    maxUses: Math.max(1, Number(d?.maxUses ?? 1)),
    usedCount: Math.max(0, Number(d?.usedCount ?? 0)),
    usedBy: Array.isArray(d?.usedBy) ? d.usedBy.map(String) : [],
    expiresAt: toMs(d?.expiresAt),
    active: !!d?.active,
    note: String(d?.note ?? ''),
    createdBy: String(d?.createdBy ?? ''),
    createdAt: toMs(d?.createdAt),
  };
}

// ---------------- ADMIN ----------------

/** Admin membuat voucher baru. code dinormalisasi A-Z0-9 4-16 karakter. */
export async function adminVoucherCreate(input: {
  code: string; percent: number; maxUses: number; daysValid: number; note?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  if (!fb) return { ok: false, error: 'Belum terhubung.' };
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length < 4 || code.length > 16) return { ok: false, error: 'Kode 4-16 huruf/angka tanpa spasi.' };
  const percent = Math.round(input.percent);
  if (!Number.isFinite(percent) || percent < 1 || percent > 100) return { ok: false, error: 'Diskon 1-100%.' };
  const maxUses = Math.max(1, Math.min(10000, Math.round(input.maxUses)));
  const daysValid = Math.max(1, Math.min(3650, Math.round(input.daysValid)));
  try {
    const ref = doc(fb.db, 'vouchers', code);
    const exist = await getDoc(ref).catch(() => null);
    if (exist && exist.exists()) return { ok: false, error: `Kode ${code} sudah dipakai — pilih kode lain.` };
    await setDoc(ref, {
      code, percent, maxUses, usedCount: 0, usedBy: [],
      expiresAt: Date.now() + daysValid * 86400000,
      active: true, note: (input.note ?? '').slice(0, 120),
      createdBy: 'admin', createdAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? 'Gagal membuat voucher.') };
  }
}

export async function adminVoucherToggle(code: string, active: boolean): Promise<void> {
  const fb = firebase();
  if (!fb) return;
  updateDoc(doc(fb.db, 'vouchers', code), { active }).catch(() => {});
}

export async function adminVoucherDelete(code: string): Promise<void> {
  const fb = firebase();
  if (!fb) return;
  deleteDoc(doc(fb.db, 'vouchers', code)).catch(() => {});
}

/** Langganan semua voucher (admin panel, real-time). */
export function subscribeVouchers(cb: (list: Voucher[]) => void): () => void {
  const fb = firebase();
  if (!fb) { cb([]); return () => {}; }
  return onSnapshot(collection(fb.db, 'vouchers'), (s) => {
    cb(s.docs.filter((d) => d.id !== '_schema').map((d) => mapVoucher(d.id, d.data())));
  }, () => cb([]));
}

// ---------------- USER ----------------

/** Ambil voucher untuk validasi tampilan (tanpa memakai kuota). */
export async function getVoucher(code: string): Promise<Voucher | null> {
  const fb = firebase();
  if (!fb) return null;
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c) return null;
  try {
    const snap = await getDoc(doc(fb.db, 'vouchers', c));
    return snap.exists() ? mapVoucher(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

export function voucherUsable(v: Voucher | null | undefined, me: User | null): { ok: boolean; why?: string } {
  if (!v) return { ok: false, why: 'Kode voucher tidak ditemukan.' };
  if (!v.active) return { ok: false, why: 'Voucher sudah tidak aktif.' };
  if (v.expiresAt && v.expiresAt < Date.now()) return { ok: false, why: 'Voucher sudah kedaluwarsa.' };
  if (v.usedCount >= v.maxUses) return { ok: false, why: 'Kuota voucher sudah habis.' };
  if (me && v.usedBy.includes(me.id)) return { ok: false, why: 'Kamu sudah pernah memakai voucher ini.' };
  return { ok: true };
}

/** Harga setelah diskon (pembulatan ke atas). */
export function priceWithDiscount(price: number, percent: number): number {
  return Math.ceil(price * (100 - Math.max(0, Math.min(100, percent))) / 100);
}

/**
 * TUKARKAN voucher — atomik: kuota & status diverifikasi ULANG server,
 * usedCount +1 dan usedBy += me ditulis sekali. Mengembalikan voucher final
 * bila sukses (percent dipakai menghitung harga).
 */
export async function redeemVoucher(code: string, me: User): Promise<{ ok: boolean; voucher?: Voucher; error?: string }> {
  const fb = firebase();
  if (!fb || !me?.id) return { ok: false, error: 'Belum masuk.' };
  const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c) return { ok: false, error: 'Tulis kode voucher.' };
  try {
    const ref = doc(fb.db, 'vouchers', c);
    const finalV = await runTransaction(fb.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Kode voucher tidak ditemukan.');
      const v = mapVoucher(snap.id, snap.data());
      const u = voucherUsable(v, me);
      if (!u.ok) throw new Error(u.why ?? 'Voucher tidak bisa dipakai.');
      tx.update(ref, { usedCount: v.usedCount + 1, usedBy: [...v.usedBy, me.id] });
      return v;
    });
    return { ok: true, voucher: finalV };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? 'Gagal menukar voucher.') };
  }
}
