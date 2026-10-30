/**
 * MASUKAN (FEEDBACK) user → developer.
 *  - User menulis masukan (ide/bug/lainnya) langsung dari aplikasi;
 *  - Developer melihatnya di Admin Panel → membalas + memberi APRESIASI koin;
 *  - User melihat balasan + apresiasi di layar "Masukan & Bantuan" (real-time);
 *  - Koin apresiasi masuk lewat transaksi ledger (kind='feedback_reward').
 */
import {
  collection, doc, addDoc, updateDoc, query, where, orderBy, limit as fsLimit,
  onSnapshot, serverTimestamp, runTransaction, getDoc,
} from 'firebase/firestore';
import { firebase, COLLECTIONS as C } from './firebase';
import { Feedback } from './types';
import { notifyFor } from './store';

/** Konversi Firestore Timestamp / number → epoch ms. */
function toMs(v: any): number {
  if (!v) return 0;
  if (typeof v?.toMillis === 'function') return v.toMillis();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Kirim masukan baru ke developer. */
export async function submitFeedback(input: { uid: string; name: string; text: string; kind: Feedback['kind'] }): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  const text = (input.text || '').trim();
  if (!fb) return { ok: false, error: 'Belum terhubung.' };
  if (text.length < 5) return { ok: false, error: 'Tulis minimal 5 karakter supaya developer paham.' };
  if (text.length > 2000) return { ok: false, error: 'Maksimal 2000 karakter.' };
  try {
    await addDoc(collection(fb.db, C.feedback), {
      uid: input.uid,
      name: input.name,
      text,
      kind: input.kind,
      status: 'open',
      reply: '',
      reward: 0,
      readByUser: true,
      at: serverTimestamp(),
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? 'Gagal mengirim masukan.') };
  }
}

/** Langganan masukan milik SATU user (real-time).
 *  PENTING: TANPA orderBy('at') — kombinasi where(uid)+orderBy(at) butuh
 *  composite index yang menampilkan error "query requires an index" kalau
 *  indexnya belum jadi. Sorting dilakukan di klien sehingga daftar SELALU
 *  tampil tanpa syarat index apa pun. */
export function subscribeMyFeedback(
  uid: string,
  cb: (list: Feedback[]) => void,
  onError?: (msg: string) => void
): () => void {
  const fb = firebase();
  if (!fb) { cb([]); return () => {}; }
  const q = query(collection(fb.db, C.feedback), where('uid', '==', uid), fsLimit(60));
  return onSnapshot(q, (s) => {
    const list = s.docs.map((d) => {
      const v = d.data() as any;
      return { id: d.id, ...v, at: toMs(v.at), repliedAt: toMs(v.repliedAt) } as Feedback;
    });
    list.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    cb(list.slice(0, 30));
  }, (e) => {
    // JANGAN senyap-senyap tampilkan kosong — user harus tahu kalau daftarnya
    // gagal dimuat (mis. izin).
    onError?.(String(e?.message ?? 'Gagal memuat masukan.'));
    cb([]);
  });
}

/** Langganan SEMUA masukan untuk admin panel (real-time). */
export function subscribeAllFeedback(cb: (list: Feedback[]) => void): () => void {
  const fb = firebase();
  if (!fb) { cb([]); return () => {}; }
  const q = query(collection(fb.db, C.feedback), orderBy('at', 'desc'), fsLimit(120));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => {
    const v = d.data() as any;
    return { id: d.id, ...v, at: toMs(v.at), repliedAt: toMs(v.repliedAt) } as Feedback;
  })), () => cb([]));
}

/** User menandai masukannya sudah dibaca (badge hilang). */
export async function markFeedbackRead(fid: string): Promise<void> {
  const fb = firebase();
  if (!fb) return;
  updateDoc(doc(fb.db, C.feedback, fid), { readByUser: true }).catch(() => {});
}

/**
 * Developer membalas masukan + (opsional) memberi apresiasi koin.
 * Koin masuk ATOMIK lewat transaksi: users/{uid}.points + ledger/{fid}_fb.
 */
export async function answerFeedback(opts: {
  fid: string;
  feedback: Feedback;
  reply: string;
  reward: number;
  adminId: string;
  adminName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const fb = firebase();
  if (!fb) return { ok: false, error: 'Belum terhubung.' };
  const reply = (opts.reply || '').trim();
  const reward = Math.max(0, Math.min(6000, Math.round(opts.reward || 0)));
  if (reply.length < 2) return { ok: false, error: 'Tulis balasan dulu.' };
  try {
    if (reward > 0) {
      const userRef = doc(fb.db, 'users', opts.feedback.uid);
      const ledgerRef = doc(fb.db, 'ledger', `${opts.fid}_fb`);
      const led = await getDoc(ledgerRef);
      if (!led.exists()) {
        await runTransaction(fb.db, async (tx) => {
          const u = await tx.get(userRef);
          const cur = (u.data()?.points as number) ?? 0;
          tx.update(userRef, { points: cur + reward });
          tx.set(ledgerRef, {
            uid: opts.feedback.uid,
            kind: 'feedback_reward',
            delta: reward,
            ref: opts.fid,
            by: opts.adminId,
            at: Date.now(),
          });
        });
      }
    }
    await updateDoc(doc(fb.db, C.feedback, opts.fid), {
      status: 'answered',
      reply,
      repliedAt: serverTimestamp(),
      reward: reward || 0,
      handledBy: opts.adminName,
    }).catch(async (e: any) => {
      // TABRAKAN ATURAN: kalau admin tidak punya izin update (rules lama),
      // admin TETAP dibantu dengan pesan yang jelas — bukan gagam.
      throw e;
    });
    notifyFor(
      opts.feedback.uid,
      'group',
      reward > 0 ? `Developer membalas masukanmu +${reward} koin 🎁` : 'Developer membalas masukanmu',
      reply.slice(0, 140),
      {}
    );
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? 'Gagal membalas masukan.') };
  }
}

/** Hapus masukan (admin). */
export async function deleteFeedback(fid: string): Promise<void> {
  const fb = firebase();
  if (!fb) return;
  const { deleteDoc } = await import('firebase/firestore');
  deleteDoc(doc(fb.db, C.feedback, fid)).catch(() => {});
}
