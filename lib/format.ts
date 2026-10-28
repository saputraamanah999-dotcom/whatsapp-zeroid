export const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Normalisasi nilai tanggal apa pun (number ms, detik, Firestore Timestamp, string ISO, Date) → epoch-ms. */
function ms(v: any): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v < 9e11 ? Math.round(v * 1000) : v; // detik → ms
  if (typeof v === 'object') {
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000;
    if (v instanceof Date) return v.getTime();
    return 0;
  }
  if (typeof v === 'string') { const p = Date.parse(v); return isFinite(p) ? p : 0; }
  return 0;
}

export function timeShort(ts: any) {
  const t = ms(ts);
  if (!t) return '';
  return new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

export function chatTime(ts: any) {
  const t = ms(ts);
  if (!t) return '';
  const now = new Date();
  const d = new Date(t);
  if (d.toDateString() === now.toDateString()) return timeShort(t);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Kemarin';
  if (now.getTime() - t < 6 * 86400000) return d.toLocaleDateString('id-ID', { weekday: 'short' });
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function dayLabel(ts: any) {
  const t = ms(ts);
  if (!t) return '';
  const now = new Date();
  const d = new Date(t);
  if (d.toDateString() === now.toDateString()) return 'Hari ini';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Kemarin';
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "baru saja / x mnt lalu / x jam lalu / x hari lalu" — anti bug "20014 hari": 0/invalid → baru saja. */
export function ago(v: any) {
  const t = ms(v);
  if (!t) return 'baru saja';
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'baru saja';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} hari lalu`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo} bln lalu`;
  return `${Math.floor(mo / 12)} thn lalu`;
}

export function duration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function bytes(n?: number) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

/** Tiny non-cryptographic hash for local-mode passwords (Firebase Auth handles real credentials). */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 'h' + (h >>> 0).toString(36) + s.length;
}
