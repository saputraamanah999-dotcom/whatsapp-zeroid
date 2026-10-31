import { ProductKey } from './types';

export type Plan = { label: string; days: number; price: number };
/** `icon` is an SVG badge key rendered by lib/icons.tsx (no emoji for UI). */
export type Product = { key: ProductKey; title: string; icon: string; color: string; desc: string; perks: string[]; plans: Plan[] };

/** Produk API berbayar — hasil nyata dari Vanzz API, dikirim otomatis setelah
 *  admin konfirmasi pembayaran (server-side via /api/vanzz action 'deliver').
 *  `fields` = input yang wajib diisi pembeli saat memesan. */
export type ApiProduct = { key: ProductKey; title: string; icon: string; color: string; price: number; desc: string; fields: { key: 'nomor' | 'email'; label: string; placeholder: string }[]; note: string };

export const API_PRODUCTS: ApiProduct[] = [
  {
    key: 'checknomor', title: 'Cek Nomor', icon: 'call', color: '#14C47A', price: 5000,
    desc: 'Lacak lokasi & provider nomor HP (Check Nomor Vanzz API).',
    fields: [{ key: 'nomor', label: 'Nomor HP', placeholder: '08xxxxxxxxxx' }],
    note: 'Hasil pelacakan muncul otomatis di pesanan setelah admin konfirmasi pembayaran.',
  },
  {
    key: 'netflix', title: 'Netflix Premium', icon: 'tv', color: '#E50914', price: 7000,
    desc: 'Netflix Premium Sharing Account — data akun dikirim ke pesananmu.',
    fields: [],
    note: 'Data akun muncul otomatis di pesanan setelah admin konfirmasi pembayaran.',
  },
  {
    key: 'amp', title: 'AlightMotion Premium', icon: 'videocam', color: '#7B61FF', price: 10000,
    desc: 'Magic link premium AlightMotion dikirim ke email kamu.',
    fields: [{ key: 'email', label: 'Email', placeholder: 'email@kamu.com' }],
    note: 'Magic link dikirim ke email + status tampil di pesanan setelah konfirmasi admin.',
  },
  {
    key: 'amunlock', title: 'AM Premium Unlock', icon: 'unlock', color: '#FF9F0A', price: 10000,
    desc: 'Unlock premium aplikasi AlightMotion (Premium Unlock).',
    fields: [{ key: 'email', label: 'Email', placeholder: 'email@kamu.com' }],
    note: 'Instruksi unlock muncul di pesanan setelah admin konfirmasi pembayaran.',
  },
];

export const apiProductOf = (k?: string) => API_PRODUCTS.find((p) => p.key === k);

export const PRODUCTS: Product[] = [
  {
    key: 'vip',
    title: 'VIP',
    icon: 'vip',
    color: '#FFB300',
    desc: 'Lencana VIP emas, prioritas dukungan, dan stiker eksklusif.',
    perks: ['Lencana VIP di profil', 'Kirim file hingga 2 GB', 'Stiker & tema eksklusif', 'Prioritas dukungan admin'],
    plans: [
      { label: '1 bulan', days: 30, price: 25000 },
      { label: '3 bulan', days: 90, price: 65000 },
      { label: '12 bulan', days: 365, price: 199000 },
    ],
  },
  {
    key: 'member',
    title: 'Member',
    icon: 'member',
    color: '#7B61FF',
    desc: 'Keanggotaan resmi Zeroid dengan fitur tambahan harian.',
    perks: ['Lencana Member', 'Buat hingga 20 grup & saluran', 'Story hingga 60 detik', 'Tanpa batas pesan berbintang'],
    plans: [
      { label: '1 bulan', days: 30, price: 10000 },
      { label: '6 bulan', days: 180, price: 50000 },
      { label: '12 bulan', days: 365, price: 89000 },
    ],
  },
  {
    key: 'bluecheck',
    title: 'Centang Biru',
    icon: 'bluecheck',
    color: '#1E6BFF',
    desc: 'Verifikasi akun resmi dengan centang biru setelah ditinjau admin.',
    perks: ['Centang biru di nama & profil', 'Ikut otomatis ke grup & saluran milikmu', 'Ditinjau manual oleh admin', 'Muncul teratas di pencarian'],
    plans: [
      { label: 'Permanen', days: 0, price: 49000 },
      { label: 'Bisnis · Permanen', days: 0, price: 149000 },
    ],
  },
  {
    key: 'security',
    title: 'Keamanan',
    icon: 'security',
    color: '#14C47A',
    desc: 'Kunci aplikasi dengan PIN, verifikasi OTP Gmail, dan peringatan login.',
    perks: ['Kunci aplikasi dengan PIN', 'OTP 2 langkah ke Gmail', 'Peringatan login perangkat baru', 'Lencana akun aman'],
    plans: [
      { label: '1 bulan', days: 30, price: 15000 },
      { label: '12 bulan', days: 365, price: 120000 },
    ],
  },
];

// PEMBAYARAN HANYA 2 METODE (permintaan pemilik): QRIS + DANA.
// Nomor DANA & foto QRIS dikelola admin di config/payments (Admin panel).
export const PAYMENT_METHODS = [
  { key: 'qris', label: 'QRIS', icon: 'qris' },
  { key: 'dana', label: 'DANA', icon: 'dana' },
];

export const productOf = (k: ProductKey) => PRODUCTS.find((p) => p.key === k)!;

/** AMAN untuk data lama/penanda seed (mis. product 'schema-marker'):
 *  krash "Cannot read properties of undefined (reading 'icon'/'color'/'title')"
 *  terjadi bila order punya product key yang tidak ada di PRODUCTS. */
const UNKNOWN_PRODUCT: Product = {
  key: 'vip',
  title: 'Produk',
  icon: 'receipt',
  color: '#7B61FF',
  desc: '',
  perks: [],
  plans: [{ label: '-', days: 0, price: 0 }],
};
export const productSafe = (k?: string): Product => (k && PRODUCTS.find((p) => p.key === k)) || UNKNOWN_PRODUCT;

/** AMAN terhadap data lama: order lama bisa punya price undefined/null →
 *  krash "Cannot read properties of undefined (reading 'toLocaleString')"
 *  yang mematikan seluruh layar (ErrorBoundary "Terjadi kesalahan tampilan"). */
export const rupiah = (n?: number | null) => 'Rp' + Number(n ?? 0).toLocaleString('id-ID');
