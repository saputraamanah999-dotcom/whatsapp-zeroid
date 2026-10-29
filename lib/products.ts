import { ProductKey } from './types';

export type Plan = { label: string; days: number; price: number };
/** `icon` is an SVG badge key rendered by lib/icons.tsx (no emoji for UI). */
export type Product = { key: ProductKey; title: string; icon: string; color: string; desc: string; perks: string[]; plans: Plan[] };

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

export const PAYMENT_METHODS = [
  { key: 'qris', label: 'QRIS', icon: 'qris' },
  { key: 'dana', label: 'DANA', icon: 'dana' },
  { key: 'gopay', label: 'GoPay', icon: 'gopay' },
  { key: 'ovo', label: 'OVO', icon: 'ovo' },
  { key: 'bca', label: 'Transfer BCA', icon: 'bca' },
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

export const rupiah = (n: number) => 'Rp' + n.toLocaleString('id-ID');
