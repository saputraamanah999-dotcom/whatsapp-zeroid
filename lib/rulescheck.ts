/**
 * CEK IZIN SERVER (Rules Firestore live) — diagnostik untuk developer/admin.
 * Mencoba tulis-ke-tempat-sampah kecil di tiap jalur penting dan melaporkan
 * mana yang ditolak server. Dipakai untuk tahu apakah Rules Firebase sudah
 * versi terbaru TANPA harus menebak dari gejala (check-in gagal, dsb).
 */
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { firebase, COLLECTIONS as C } from './firebase';
import { User } from './types';
import { pushBanner } from './bus';

export type RuleProbe = { key: string; label: string; ok: boolean; hint?: string };

const PROBES: Array<{ key: string; label: string; hint: string; write: (fb: any, uid: string) => Promise<unknown> }> = [
  {
    key: 'ledger', label: 'Bukti check-in (ledger)', hint: 'Kalau merah: check-in & referral ditolak server — pasang Rules terbaru via /rules.html',
    write: async (fb, uid) => setDoc(doc(fb.db, 'ledger', `probe_${uid}_${Date.now()}`), { uid, kind: 'probe', delta: 0, at: Date.now() }),
  },
  {
    key: 'viewedBy', label: 'Foto sekali lihat (viewedBy)', hint: 'Kalau merah: sekali lihat bisa dibuka berkali-kali — pasang Rules terbaru',
    write: async (fb, uid) => setDoc(doc(fb.db, C.config, `probe_vo_${uid}`), { uid, viewedBy: [uid], at: Date.now() }),
  },
  {
    key: 'usermeta', label: 'Catatan IP/perangkat (usermeta)', hint: 'Kalau merah: gerbang ban IP/device tidak bisa mencatat — pasang Rules terbaru',
    write: async (fb, uid) => setDoc(doc(fb.db, 'usermeta', uid), { lastIpHash: 'probe', lastDeviceHash: 'probe', at: Date.now() }, { merge: true }),
  },
  {
    key: 'notifications', label: 'Notifikasi', hint: 'Pusat notifikasi tidak bisa menulis',
    write: async (fb, uid) => setDoc(doc(fb.db, C.notifications, `probe_${uid}_${Date.now()}`), { userId: uid, title: 'probe', kind: 'system', createdAt: Date.now() }),
  },
  {
    key: 'config', label: 'Config platform', hint: 'Admin tidak bisa menulis config (maintenance/flag/AI persona)',
    write: async (fb, uid) => setDoc(doc(fb.db, C.config, `probe_${uid}`), { uid, at: Date.now() }, { merge: true }),
  },
];

/** Jalankan semua probe. Dokumen yang boleh dihapus user akan dibersihkan. */
export async function checkServerRules(me: User): Promise<RuleProbe[]> {
  const fb = firebase();
  if (!fb || !me?.id) return [];
  const out: RuleProbe[] = [];
  const cleanups: Array<() => void> = [];
  for (const p of PROBES) {
    try {
      await p.write(fb, me.id);
      out.push({ key: p.key, label: p.label, ok: true });
    } catch {
      out.push({ key: p.key, label: p.label, ok: false, hint: p.hint });
    }
  }
  // bersih-bersih best effort (ledger append-only by design — dibiarkan, tidak berbahaya;
  // config & notifications boleh dihapus pemiliknya)
  cleanups.push(() => { deleteDoc(doc(fb.db, C.config, `probe_${me.id}`)).catch(() => {}); });
  cleanups.push(() => { deleteDoc(doc(fb.db, C.config, `probe_vo_${me.id}`)).catch(() => {}); });
  setTimeout(() => cleanups.forEach((f) => f()), 1500);
  return out;
}

/** Ringkas untuk banner */
export function rulesSummary(probes: RuleProbe[]): { ok: number; total: number; text: string } {
  const ok = probes.filter((p) => p.ok).length;
  const total = probes.length;
  const text = ok === total
    ? 'Semua izin server OK — Rules Firebase sudah terbaru.'
    : `${total - ok} izin DITOLAK server — buka /rules.html di domain aplikasi dan ikuti 2 langkah pasang (2 menit).`;
  return { ok, total, text };
}

export function rulesBanner(probes: RuleProbe[]) {
  const s = rulesSummary(probes);
  pushBanner({ title: `Izin server ${s.ok}/${s.total} OK`, body: s.text, icon: s.ok === s.total ? 'shield-checkmark' : 'alert' });
}
