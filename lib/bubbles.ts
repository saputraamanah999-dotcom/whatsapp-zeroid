/**
 * GAYA BALON OBROLAN (gaya balon ala WhatsApp/TikTok) — setiap user bebas memilih,
 * tersimpan di profil (users/{uid}.bubble) dan TAMPIL REAL-TIME ke semua orang di
 * chat pribadi, grup, global, saluran. Pesan juga membawa snapshot gaya pengirim
 * (messages/{id}.bubble) supaya tetap konsisten walau profil gagal dimuat.
 *
 * Murni style props — tanpa gambar, ringan di semua perangkat.
 */
import type { BubbleStyleId, ChatThemeId } from './types';
import type { Theme } from './theme';

export type BubbleSkin = {
  id: BubbleStyleId;
  label: string;
  /** emoji kecil untuk pratinjau pemilih (bukan di chat) */
  tag: string;
  /** deskripsi singkat untuk pemilih */
  desc: string;
  /** penyesuaian warna balon: [milikku, orang lain] — undefined = warna tema */
  bg?: [string, string];
  /** warna teks di dalam balon: [milikku, orang lain] */
  fg?: [string, string];
  radius?: [number, number, number, number]; // TL TR BR BL (milik)
  borderWidth?: number;
  borderColor?: string;
  /** bayangan khusus */
  shadow?: string;
  /** sudut "telinga"/hiasan kecil di pojok balon milik */
  accentCorner?: string;
  /** garis putus-putus (sketsa) — disimulasikan lewat border ganda */
  dashed?: boolean;
  opacity?: number;
  /** glow neon */
  glowColor?: string;
  /** hiasan SVG (telinga hewan/mahkota/tanduk/antena/hati) di pojok balon */
  decor?: 'cat' | 'frog' | 'bear' | 'bunny' | 'panda' | 'fox' | 'crown' | 'horns' | 'alien' | 'love';
};

export const BUBBLE_STYLES: BubbleSkin[] = [
  {
    id: 'default', label: 'Default', tag: '💬', desc: 'Balon klasik Zeroid',
  },
  {
    id: 'sketch', label: 'Sketsa Whee', tag: '✏️', desc: 'Kertas gambar bergaris cokelat',
    bg: ['#FFF8EC', '#FFFDF6'], fg: ['#5B4632', '#5B4632'],
    borderColor: '#C9A227', borderWidth: 1.6, dashed: true, radius: [14, 14, 4, 18],
  },
  {
    id: 'ghost', label: 'Hantu', tag: '👻', desc: 'Transparan berkabut ungu (terbatas)',
    bg: ['rgba(124,94,242,0.88)', 'rgba(233,226,255,0.92)'], fg: ['#FFFFFF', '#3A2E63'],
    radius: [22, 22, 22, 8], opacity: 0.95,
  },
  {
    id: 'pumpkin', label: 'Labu', tag: '🎃', desc: 'Oranye labu manis (terbatas)',
    bg: ['#FF9F1C', '#FFE3B3'], fg: ['#FFFFFF', '#7A4A05'],
    radius: [20, 20, 20, 20], borderColor: '#E1670C', borderWidth: 2,
  },
  {
    id: 'spider', label: 'Spider', tag: '🕷️', desc: 'Gelap misterius bertanduk',
    bg: ['#241B2E', '#EDE7F6'], fg: ['#E6DFF6', '#2A1F38'],
    radius: [6, 18, 6, 18], borderColor: '#7B4DFF', borderWidth: 1.4, decor: 'horns',
  },
  {
    id: 'otter', label: 'Otter ceria', tag: '🦦', desc: 'Cokelat krem beruang air',
    bg: ['#A9714B', '#F3E3D3'], fg: ['#FFFFFF', '#5C3A22'],
    radius: [24, 24, 8, 24], decor: 'bear',
  },
  {
    id: 'diva', label: 'Diva glamor', tag: '💅', desc: 'Pink megah berkilau',
    bg: ['#FF4F9A', '#FFE0EE'], fg: ['#FFFFFF', '#8C1D54'],
    radius: [26, 26, 26, 6], borderColor: '#FFC1DD', borderWidth: 1.4,
    shadow: '0px 8px 20px rgba(255,79,154,0.35)', decor: 'crown',
  },
  {
    id: 'crocodile', label: 'Buaya santai', tag: '🐊', desc: 'Hijau sisik santai',
    bg: ['#2FA84F', '#DFF5E2'], fg: ['#FFFFFF', '#175C2B'],
    radius: [10, 22, 10, 22], borderColor: '#1E7A36', borderWidth: 2,
  },
  {
    id: 'frog', label: 'Kodok', tag: '🐸', desc: 'Hijau katak mata gembul',
    bg: ['#7ED957', '#EAFBE0'], fg: ['#FFFFFF', '#2C6B1F'],
    radius: [18, 18, 18, 18], borderColor: '#4CA636', borderWidth: 1.6, decor: 'frog',
  },
  {
    id: 'bunny', label: 'Kelinci', tag: '🐰', desc: 'Putih lembut telinga panjang',
    bg: ['#F7F4EF', '#FFFFFF'], fg: ['#FFFFFF', '#5B4632'],
    radius: [24, 24, 24, 8], borderColor: '#E4D9C8', borderWidth: 1.4, decor: 'bunny',
  },
  {
    id: 'panda', label: 'Panda', tag: '🐼', desc: 'Hitam putih gempal menggemaskan',
    bg: ['#FFFFFF', '#FFFFFF'], fg: ['#111111', '#111111'],
    radius: [22, 22, 22, 8], borderColor: '#111111', borderWidth: 1.6, decor: 'panda',
  },
  {
    id: 'fox', label: 'Rubah', tag: '🦊', desc: 'Oranye rubah lincah',
    bg: ['#F07F2E', '#FFE9D6'], fg: ['#FFFFFF', '#7A3D0E'],
    radius: [16, 16, 4, 16], decor: 'fox',
  },
  {
    id: 'bear', label: 'Beruang', tag: '🐻', desc: 'Cokelat beruang hangat',
    bg: ['#9C6B43', '#F1E3D3'], fg: ['#FFFFFF', '#4E3421'],
    radius: [20, 20, 20, 8], decor: 'bear',
  },
  {
    id: 'cat', label: 'Kucing', tag: '🐱', desc: 'Abu lembut telinga kucing',
    bg: ['#8E8E9A', '#F1F0F4'], fg: ['#FFFFFF', '#3E3E48'],
    radius: [20, 20, 4, 20], decor: 'cat',
  },
  {
    id: 'alien', label: 'Alien', tag: '👽', desc: 'Antena bercahaya hijau luar angkasa',
    bg: ['#173B2E', '#E3F8EC'], fg: ['#C9FFE2', '#12402F'],
    radius: [22, 22, 6, 22], borderColor: '#2FBF71', borderWidth: 1.5, decor: 'alien',
  },
  {
    id: 'love', label: 'Cinta', tag: '💗', desc: 'Hati melayang pink mengembang',
    bg: ['#FF5C8A', '#FFE9F1'], fg: ['#FFFFFF', '#A3134B'],
    radius: [26, 26, 26, 8], borderColor: '#FFB7CD', borderWidth: 1.4, decor: 'love',
  },
  {
    id: 'capybara', label: 'Kapibara', tag: '🦫', desc: 'Cokelat pasir santai maksimal',
    bg: ['#B08968', '#F5EBDD'], fg: ['#FFFFFF', '#5A4326'],
    radius: [28, 28, 28, 28], borderColor: '#8B6B4A', borderWidth: 1.4, decor: 'bear',
  },
  {
    id: 'neon', label: 'Neon malam', tag: '🌃', desc: 'Glow cyan khas gamer',
    bg: ['#101826', '#101826'], fg: ['#7DF9FF', '#B8F6FF'],
    radius: [16, 16, 16, 16], borderColor: '#19C8FF', borderWidth: 1.6,
    glowColor: 'rgba(25,200,255,0.45)',
  },
];

export const bubbleStyleOf = (id?: string | null): BubbleSkin =>
  BUBBLE_STYLES.find((s) => s.id === id) ?? BUBBLE_STYLES[0];

/** Tema warna chat — dipakai ChatRoom + balon milik sendiri. */
export const CHAT_THEMES: { id: ChatThemeId; label: string; mine: string; accent: string; tag: string }[] = [
  { id: 'default', label: 'Default Zeroid', mine: '#1E6BFF', accent: '#1E6BFF', tag: '🔵' },
  { id: 'ocean', label: 'Samudra', mine: '#0E9F9C', accent: '#0E9F9C', tag: '🌊' },
  { id: 'sunset', label: 'Senja', mine: '#F4713C', accent: '#F4713C', tag: '🌅' },
  { id: 'forest', label: 'Rimba', mine: '#2E9E5B', accent: '#2E9E5B', tag: '🌿' },
  { id: 'candy', label: 'Permen', mine: '#E0559C', accent: '#E0559C', tag: '🍬' },
  { id: 'mono', label: 'Monokrom', mine: '#2B2F36', accent: '#2B2F36', tag: '🖤' },
];

export const chatThemeOf = (id?: string | null) => CHAT_THEMES.find((x) => x.id === id) ?? CHAT_THEMES[0];

/**
 * Resolve style balon FINAL untuk satu pesan:
 *  1) tema chat (warna dasar milik),
 *  2) skin gaya (override warna/bentuk),
 *  3) tema gelap → fallback yang tetap terbaca.
 */
export function resolveBubble(opts: {
  styleId?: string | null;
  themeId?: string | null;
  mine: boolean;
  dark?: boolean;
  t: Theme;
}): {
  backgroundColor: string;
  color: string;
  borderRadius: number;
  borderBottomRightRadius: number;
  borderBottomLeftRadius: number;
  borderWidth: number;
  borderColor: string;
  opacity: number;
  boxShadow: string;
  decor?: 'cat' | 'frog' | 'bear' | 'bunny' | 'panda' | 'fox' | 'crown' | 'horns' | 'alien' | 'love';
} {
  const { styleId, themeId, mine, t } = opts;
  const skin = bubbleStyleOf(styleId);
  const theme = chatThemeOf(themeId);
  const bg = skin.bg ? (mine ? skin.bg[0] : skin.bg[1]) : mine ? theme.mine : t.bubbleOther;
  const fg = skin.fg ? (mine ? skin.fg[0] : skin.fg[1]) : mine ? '#fff' : t.text;
  const r = skin.radius ?? [20, 20, 6, 20];
  let shadow: string;
  if (skin.shadow) shadow = skin.shadow;
  else if (skin.glowColor) shadow = `0px 0px 14px ${skin.glowColor}`;
  else if (mine) shadow = '0px 6px 14px rgba(30,107,255,0.28)';
  else shadow = t.raisedSm as string;
  return {
    backgroundColor: bg,
    color: fg,
    borderRadius: r[0],
    borderBottomRightRadius: r[2],
    borderBottomLeftRadius: r[3],
    borderWidth: skin.borderWidth ?? 0,
    borderColor: skin.borderColor ?? 'transparent',
    opacity: skin.opacity ?? 1,
    boxShadow: shadow,
    decor: skin.decor,
  };
}
