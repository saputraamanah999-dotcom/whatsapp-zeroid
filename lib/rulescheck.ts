/**
 * CEK IZIN SERVER (Rules Firestore live) — diagnostik untuk developer/admin.
 * Menguji SEMUA jalur rules penting yang dipakai aplikasi (v14):
 * ledger, ekonomi users, lastCallsSeenAt (badge panggilan), typing & lastRead
 * (animasi mengetik + unread), hiddenFor panggilan, usermeta, notifications,
 * config. Setiap penambahan rules baru WAJIB ditambahkan ke daftar ini juga,
 * supaya "Cek Izin Server" selalu mewakili rules terkini.
 */
import { doc, setDoc, deleteDoc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { firebase, COLLECTIONS as C } from './firebase';
import { User } from './types';
import { pushBanner } from './bus';

export type RuleProbe = { key: string; label: string; ok: boolean; hint?: string };

type Ctx = { fb: any; uid: string };
const PROBES: Array<{ key: string; label: string; hint: string; write: (x: Ctx) => Promise<unknown>; cleanup?: (x: Ctx) => Promise<unknown> }> = [
  {
    key: 'ledger', label: 'Bukti check-in (ledger create)', hint: 'Kalau merah: check-in & referral ditolak server — pasang Rules terbaru',
    write: async ({ fb, uid }) => setDoc(doc(fb.db, 'ledger', `probe_${uid}_${Date.now()}`), { uid, kind: 'probe', delta: 0, at: Date.now() }),
  },
  {
    key: 'economy', label: 'Ekonomi sendiri (koin/streak)', hint: 'Kalau merah: check-in & koin ditolak (selfEconomyUpdate)',
    write: async ({ fb, uid }) => {
      const u = await getDoc(doc(fb.db, C.users, uid));
      const cur = u.exists() ? (u.data().points ?? 0) : 0;
      await updateDoc(doc(fb.db, C.users, uid), { points: cur }); // tulis nilai sama — lolos rem rules
    },
  },
  {
    key: 'lastCallsSeenAt', label: 'Tandai panggilan dibaca (badge)', hint: 'Kalau merah: badge Panggilan tidak mau hilang — butuh Rules v14+',
    write: async ({ fb, uid }) => updateDoc(doc(fb.db, C.users, uid), { lastCallsSeenAt: Date.now() }),
  },
  {
    key: 'typing', label: 'Animasi mengetik (typing map)', hint: 'Kalau merah: "mengetik…" tidak pernah muncul — butuh Rules v14+',
    write: async ({ fb, uid }) => {
      const c = await getDoc(doc(fb.db, C.chats, 'c_global'));
      const cur = c.exists() ? (c.data().typing ?? {}) : {};
      await updateDoc(doc(fb.db, C.chats, 'c_global'), { typing: { ...cur, [uid]: 0 } });
    },
  },
  {
    key: 'lastRead', label: 'Tandai obrolan dibaca (lastRead map)', hint: 'Kalau merah: unread tidak terbaca server — butuh Rules v14+',
    write: async ({ fb, uid }) => {
      const c = await getDoc(doc(fb.db, C.chats, 'c_global'));
      const cur = c.exists() ? (c.data().lastRead ?? {}) : {};
      await updateDoc(doc(fb.db, C.chats, 'c_global'), { lastRead: { ...cur, [uid]: Date.now() } });
    },
  },
  {
    key: 'callsHide', label: 'Hapus riwayat panggilan (hiddenFor)', hint: 'Kalau merah: riwayat panggilan tidak bisa dihapus — butuh Rules terbaru',
    write: async ({ fb, uid }) => {
      const ref = await addDoc(collection(fb.db, C.calls), { chatId: '_schema', callerId: uid, calleeIds: [uid], video: false, status: 'ended', startedAt: Date.now() - 2000, endedAt: Date.now(), hiddenFor: [] });
      await updateDoc(ref, { hiddenFor: [uid] });
      await deleteDoc(ref);
    },
  },
  {
    key: 'usermeta', label: 'Catatan IP/perangkat (usermeta)', hint: 'Kalau merah: gerbang ban IP/device tidak bisa mencatat — pasang Rules terbaru',
    write: async ({ fb, uid }) => {
      // AMAN: baca dulu, tulis kembali nilai asli (jangan pernah menimpa dengan 'probe')
      const s = await getDoc(doc(fb.db, 'usermeta', uid));
      const cur = s.exists() ? (s.data() as any) : { lastIpHash: '', lastDeviceHash: '', at: 0 };
      await setDoc(doc(fb.db, 'usermeta', uid), { ...cur, at: cur.at ?? Date.now() }, { merge: true });
    },
  },
  {
    key: 'notifications', label: 'Notifikasi', hint: 'Pusat notifikasi tidak bisa menulis',
    write: async ({ fb, uid }) => {
      const ref = doc(fb.db, C.notifications, `probe_${uid}_${Date.now()}`);
      await setDoc(ref, { userId: uid, title: 'probe', kind: 'system', createdAt: Date.now() });
      await deleteDoc(ref);
    },
  },
  {
    key: 'config', label: 'Config platform (admin)', hint: 'Admin tidak bisa menulis config (maintenance/flag/AI persona)',
    write: async ({ fb, uid }) => {
      await setDoc(doc(fb.db, C.config, `probe_${uid}`), { uid, at: Date.now() }, { merge: true });
    },
    cleanup: async ({ fb, uid }) => { await deleteDoc(doc(fb.db, C.config, `probe_${uid}`)).catch(() => {}); },
  },
];

/** Jalankan semua probe (berurutan agar mudah dibaca). Bersih-bersih otomatis. */
export async function checkServerRules(me: User): Promise<RuleProbe[]> {
  const fb = firebase();
  if (!fb || !me?.id) return [];
  const out: RuleProbe[] = [];
  for (const p of PROBES) {
    try {
      await p.write({ fb, uid: me.id });
      out.push({ key: p.key, label: p.label, ok: true });
    } catch {
      out.push({ key: p.key, label: p.label, ok: false, hint: p.hint });
    }
  }
  setTimeout(() => { PROBES.forEach((p) => p.cleanup?.({ fb, uid: me.id }).catch(() => {})); }, 1500);
  return out;
}

/** Ringkas untuk banner */
export function rulesSummary(probes: RuleProbe[]): { ok: number; total: number; text: string } {
  const ok = probes.filter((p) => p.ok).length;
  const total = probes.length;
  const text = ok === total
    ? 'Semua izin server OK — Rules Firebase sudah terbaru.'
    : `${total - ok} izin DITOLAK server — jalankan workflow "Deploy Rules" (GitHub Actions) untuk memasang Rules terbaru, lalu cek ulang di sini.`;
  return { ok, total, text };
}

export function rulesBanner(probes: RuleProbe[]) {
  const s = rulesSummary(probes);
  pushBanner({ title: `Izin server ${s.ok}/${s.total} OK`, body: s.text, icon: s.ok === s.total ? 'shield-checkmark' : 'alert' });
}
