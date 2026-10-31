import { ProductKey } from './types';

export type Plan = { label: string; days: number; price: number };
/** `icon` is an SVG badge key rendered by lib/icons.tsx (no emoji for UI). */
export type Product = { key: ProductKey; title: string; icon: string; color: string; desc: string; perks: string[]; plans: Plan[] };

/** Jenis input produk API: nomor HP / email / resi / ekspedisi / saluran / jumlah. */
export type ApiFieldKey = 'nomor' | 'email' | 'resi' | 'ekspedisi' | 'channel' | 'amount';
export type ApiField = { key: ApiFieldKey; label: string; placeholder: string };

/** Produk API berbayar — hasil nyata, diproses otomatis SERVER setelah admin
 *  konfirmasi pembayaran (via /api/vanzz action 'deliver').
 *  Produk berharga SATUAN (followers/reaksi): `unit` = jumlah per step,
 *  `price` = harga per step → total = ceil(amount/unit) * price. */
export type ApiProduct = {
  key: ProductKey; title: string; icon: string; color: string;
  price: number; desc: string; fields: ApiField[]; note: string;
  /** harga satuan: beli per kelipatan `unit` seharga `price` (Rp). */
  unit?: number; unitLabel?: string; minAmount?: number; maxAmount?: number;
};

export const API_PRODUCTS: ApiProduct[] = [
  {
    key: 'checknomor', title: 'Cek Nomor', icon: 'call', color: '#14C47A', price: 5000,
    desc: 'Lacak lokasi & provider nomor HP.',
    fields: [{ key: 'nomor', label: 'Nomor HP', placeholder: '08xxxxxxxxxx' }],
    note: 'Hasil pelacakan muncul otomatis di pesanan setelah admin konfirmasi pembayaran.',
  },
  {
    key: 'cekresi', title: 'Cek Resi', icon: 'cube', color: '#FF8A00', price: 5000,
    desc: 'Lacak status pengiriman paket semua ekspedisi (Shopee, J&T, JNE, dll).',
    fields: [
      { key: 'resi', label: 'Nomor resi', placeholder: 'Contoh: SPXID054330680586' },
      { key: 'ekspedisi', label: 'Ekspedisi', placeholder: 'Contoh: shopee-express, jnt, jne' },
    ],
    note: 'Hasil pelacakan paket muncul otomatis di pesanan setelah admin konfirmasi pembayaran.',
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
    note: 'Magic link dikirim ke email kamu — buka email (cek juga folder SPAM), lalu tempel URL verifikasinya di pesanan.',
  },
  {
    key: 'amunlock', title: 'AM Premium Unlock', icon: 'unlock', color: '#FF9F0A', price: 10000,
    desc: 'Unlock premium aplikasi AlightMotion (Premium Unlock).',
    fields: [{ key: 'email', label: 'Email', placeholder: 'email@kamu.com' }],
    note: 'Ikuti petunjuk unlock di pesanan — tempel URL verifikasi dari email kamu.',
  },
  {
    key: 'followers', title: 'Followers Saluran', icon: 'people', color: '#1E9BFF', price: 3000,
    unit: 5, unitLabel: 'followers', minAmount: 5, maxAmount: 1000000,
    desc: 'Tambah pengikut saluran — pilih nama saluran & jumlahnya.',
    fields: [
      { key: 'channel', label: 'Nama saluran', placeholder: 'Tulis nama saluran tujuan' },
      { key: 'amount', label: `Jumlah followers (kelipatan 5)`, placeholder: 'Contoh: 100' },
    ],
    note: 'Pengikut masuk otomatis beberapa menit setelah admin konfirmasi pembayaran.',
  },
  {
    key: 'reaction', title: 'Reaksi Saluran', icon: 'heart', color: '#FF5A8A', price: 5000,
    unit: 10, unitLabel: 'reaksi', minAmount: 10, maxAmount: 500000,
    desc: 'Reaksi massal ke pesan terakhir saluran — pilih saluran & jumlahnya.',
    fields: [
      { key: 'channel', label: 'Nama saluran', placeholder: 'Tulis nama saluran tujuan' },
      { key: 'amount', label: 'Jumlah reaksi (kelipatan 10)', placeholder: 'Contoh: 100' },
    ],
    note: 'Reaksi ditumpuk ke pesan terakhir saluran setelah admin konfirmasi pembayaran.',
  },
];

export const apiProductOf = (k?: string) => API_PRODUCTS.find((p) => p.key === k);

/** Produk dengan harga SATUAN (followers/reaksi) → total = ceil(amount/unit)*price. */
export const isUnitProduct = (k?: string) => !!apiProductOf(k)?.unit;
export function unitPriceOf(k: string, amount: number): number {
  const ap = apiProductOf(k);
  if (!ap?.unit) return ap?.price ?? 0;
  const want = Number(amount) || (ap.minAmount ?? ap.unit);
  const step = Math.max(1, Math.ceil(want / ap.unit));
  return step * ap.price;
}

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
