/**
 * MENU GRATIS — SIDEBAR BARU (mengikuti referensi desain sidebar premium):
 *   1. Brand logo di atas (blok gradien "Z" + nama)
 *   2. Label seksi + ITEM NAVIGASI horizontal (ikon dalam kotak rounded + label),
 *      item aktif di-highlight lembut (bukan kotak penuh warna norak)
 *   3. Sub-item sekunder (sumber berita / jenis quotes) menjorok dengan indikator titik
 *   4. Tombol ciut/kembang (collapsed 76px ↔ expanded 236px) seperti referensi
 *   5. Kartu CTA gradien di bawah (ala "Skyrocket company growth")
 *   6. Footer workspace: pembatas + profil pengguna
 *
 * Konten:
 *   - CUACA   : cuaca sekarang (lembab, angin, tekanan, presipitasi) + PRAKIRAAN
 *               7 HARI Senin–Minggu (peluang hujan %, mm, angin, UV, terbit/terbenam)
 *               + JAM-JAMAN 24 jam (hujan mulai jam berapa) — Open-Meteo via server.
 *   - GEMPA   : gempa terbaru BMKG (magnitudo besar + peta shakemap) + gempa terkini.
 *   - BERITA  : 6 sumber, daftar berita dengan gambar.
 *   - QUOTES  : Motivasi/Galau/Gombal — kartu kutipan rapi (dulu tombol melar jelek).
 *   - AM FINDER: hasil creator + daftar preset AlightMotion dengan tombol unduh.
 *   - ANIME   : hub + FYP (poster asli animein) → buka Anime Hub.
 * Semua lewat proxy /api/vanzz — apikey tidak pernah ada di klien.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Linking, FlatList, useWindowDimensions } from "react-native";
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { T, Btn, Empty, Header, Neu, NeuInput, Screen } from '../components/ui';
import { useTheme, R } from '../lib/theme';
import { useStore } from '../lib/store';
import { vanzzCall } from '../lib/vanzz';

type Section = 'anime' | 'berita' | 'quotes' | 'cuaca' | 'gempa' | 'amfinder';

const SECTIONS: { key: Section; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'anime', label: 'Anime', icon: 'tv', color: '#FF7A9C' },
  { key: 'berita', label: 'Berita', icon: 'newspaper', color: '#1E6BFF' },
  { key: 'cuaca', label: 'Cek Cuaca', icon: 'partly-sunny', color: '#FFB300' },
  { key: 'gempa', label: 'Cek Gempa', icon: 'pulse', color: '#FF4D6D' },
  { key: 'quotes', label: 'Quotes', icon: 'chatbubble-ellipses', color: '#7B61FF' },
  { key: 'amfinder', label: 'AM Finder', icon: 'sparkles', color: '#14C47A' },
];

const BERITA_SRC: { key: string; label: string }[] = [
  { key: 'berita_kompas', label: 'Kompas' },
  { key: 'berita_cnn', label: 'CNN' },
  { key: 'berita_liputan6', label: 'Liputan6' },
  { key: 'berita_antara', label: 'Antara' },
  { key: 'berita_cnbc', label: 'CNBC' },
  { key: 'berita_sindonews', label: 'Sindonews' },
];

const QUOTES_SRC: { key: string; label: string }[] = [
  { key: 'quotes_motivasi', label: 'Motivasi' },
  { key: 'quotes_galau', label: 'Galau' },
  { key: 'quotes_gombal', label: 'Gombal' },
];

const ICON_OF: Record<string, keyof typeof Ionicons.glyphMap> = {
  sunny: 'sunny', 'partly-sunny': 'partly-sunny', cloud: 'cloud', rainy: 'rainy',
  snow: 'snow', thunderstorm: 'thunderstorm',
};

// ----------------------------------------------------------------generic bits
function NewsCard({ item, onOpen }: { item: { title?: string; image?: string; snippet?: string; subtitle?: string }; onOpen?: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onOpen}>
      <Neu style={{ flexDirection: 'row', gap: 10, padding: 10, alignItems: 'center', marginBottom: 10 }}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={{ width: 86, height: 62, borderRadius: R.md, backgroundColor: t.bg2 }} contentFit="cover" />
        ) : (
          <View style={{ width: 86, height: 62, borderRadius: R.md, backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="image-outline" size={22} color={t.faint} />
          </View>
        )}
        <View style={{ flex: 1, gap: 3 }}>
          <T v="caption" numberOfLines={2} style={{ fontWeight: '800' }}>{item.title}</T>
          {!!item.subtitle && <T v="caption" color={t.faint} numberOfLines={1}>{item.subtitle}</T>}
          {!!item.snippet && <T v="caption" color={t.sub} numberOfLines={2}>{item.snippet}</T>}
        </View>
        <Ionicons name="open-outline" size={16} color={t.sub} />
      </Neu>
    </Pressable>
  );
}

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function hariDari(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return HARI[d.getDay()];
}
function tglPendek(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${BULAN[d.getMonth()]}`;
}

// ---------------------------------------------------------------- CUACA view
type CuacaData = {
  place: string; region: string; source: string;
  current: { desc: string; icon: string; temp: number; feels: number; humidity: number; wind: number; windDir: number; pressure: number; precip: number };
  daily: { date: string; desc: string; icon: string; tmax: number; tmin: number; rainMm: number; rainProb: number; wind: number; uv: number; sunrise: string; sunset: string }[];
  hourly: { time: string; temp: number; rainProb: number; rainMm: number; desc: string }[];
};

function CuacaView({ data }: { data: CuacaData }) {
  const t = useTheme();
  const c = data.current;
  const rainToday = data.daily[0]?.rainProb ?? 0;
  const rainDay = data.daily.find((d) => d.rainProb >= 60); // hari hujan pertama minggu ini
  const DetailChip = ({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }) => (
    <View style={{ flexBasis: '31%', flexGrow: 1, padding: 10, borderRadius: R.md, backgroundColor: t.bg, gap: 4 } as any}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Ionicons name={icon} size={13} color={color} />
        <T v="caption" color={t.faint} numberOfLines={1}>{label}</T>
      </View>
      <T v="caption" style={{ fontWeight: '900' }}>{value}</T>
    </View>
  );
  return (
    <View style={{ padding: 14, gap: 12, paddingBottom: 60 }}>
      {/* HERO sekarang */}
      <Neu radius={R.xl} style={{ padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Ionicons name={ICON_OF[c.icon] ?? 'partly-sunny'} size={52} color="#FFB300" />
          <View style={{ flex: 1, minWidth: 130 }}>
            <T style={{ fontWeight: '900', fontSize: 30, lineHeight: 34 }}>{c.temp}°C</T>
            <T v="sub" color={t.sub} style={{ fontWeight: '700' }}>{c.desc}</T>
            <T v="caption" color={t.faint} numberOfLines={1}>{data.place}{data.region ? ` · ${data.region}` : ''}</T>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            <T v="caption" color={t.sub}>Terasa {c.feels}°</T>
            <T v="caption" color={rainToday >= 50 ? t.accent2 : t.sub}>Hujan {rainToday}%</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <DetailChip icon="water" label="Kelembaban" value={`${c.humidity}%`} color="#1E9BFF" />
          <DetailChip icon="leaf" label="Angin" value={`${c.wind} km/j`} color="#14C47A" />
          <DetailChip icon="speedometer" label="Tekanan" value={`${c.pressure} hPa`} color="#7B61FF" />
          <DetailChip icon="rainy" label="Presipitasi" value={`${c.precip} mm`} color="#1E6BFF" />
          <DetailChip icon="sunny-outline" label="UV maks (hari ini)" value={`${data.daily[0]?.uv ?? '-'} / 11`} color="#FFB300" />
          <DetailChip icon="time" label="Terbit / Terbenam" value={`${data.daily[0]?.sunrise ?? '-'} · ${data.daily[0]?.sunset ?? '-'}`} color="#FF8A00" />
        </View>
      </Neu>

      {/* PRAKIRAAN 7 HARI — Senin s/d Minggu lengkap */}
      <Neu radius={R.xl} style={{ padding: 16, gap: 6 }}>
        <T v="h3" style={{ fontSize: 15 }}>Prakiraan 7 hari</T>
        {data.daily.map((d, i) => {
          const range = Math.max(1, Math.max(...data.daily.map((x) => x.tmax)) - Math.min(...data.daily.map((x) => x.tmin)));
          const left = ((d.tmin - Math.min(...data.daily.map((x) => x.tmin))) / range) * 100;
          const widthPct = ((d.tmax - d.tmin) / range) * 100;
          const wet = d.rainProb >= 60;
          return (
            <View key={d.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: i < data.daily.length - 1 ? 1 : 0, borderBottomColor: t.border }}>
              <View style={{ width: 84 }}>
                <T v="caption" style={{ fontWeight: '900' }}>{i === 0 ? 'Hari ini' : hariDari(d.date)}</T>
                <T v="caption" color={t.faint}>{tglPendek(d.date)}</T>
              </View>
              <Ionicons name={ICON_OF[d.icon] ?? 'cloud'} size={20} color={d.icon === 'sunny' ? '#FFB300' : d.icon === 'rainy' || d.icon === 'thunderstorm' ? '#1E9BFF' : t.sub} />
              <View style={{ width: 44, alignItems: 'flex-end' }}>
                <T v="caption" style={{ fontWeight: '800' }}>{d.tmax}°</T>
                <T v="caption" color={t.faint}>{d.tmin}°</T>
              </View>
              <View style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: t.bg2, overflow: 'hidden', marginHorizontal: 4 }}>
                <View style={{ position: 'absolute', left: `${left}%`, width: `${Math.max(8, widthPct)}%`, height: 5, borderRadius: 3, backgroundColor: '#FF8A00' } as any} />
              </View>
              <View style={{ width: 62, alignItems: 'flex-end' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Ionicons name="rainy" size={11} color={wet ? '#1E9BFF' : t.faint} />
                  <T v="caption" color={wet ? '#1E9BFF' : t.faint} style={{ fontWeight: '800' }}>{d.rainProb}%</T>
                </View>
                <T v="caption" color={t.faint}>{d.rainMm} mm</T>
              </View>
            </View>
          );
        })}
        {rainDay && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: R.md, backgroundColor: '#1E9BFF14' }}>
            <Ionicons name="umbrella" size={15} color="#1E9BFF" />
            <T v="caption" color="#1E9BFF" style={{ flex: 1, fontWeight: '700' }}>
              perkiraan hujan {hariDari(rainDay.date)} — {rainDay.desc}, peluang {rainDay.rainProb}% ({rainDay.rainMm} mm)
            </T>
          </View>
        )}
      </Neu>

      {/* JAM-JAMAN 24 jam */}
      <Neu radius={R.xl} style={{ padding: 16, gap: 10 }}>
        <T v="h3" style={{ fontSize: 15 }}>Jam-jaman (24 jam ke depan)</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
          {data.hourly.map((h, i) => {
            const wet = h.rainProb >= 50;
            return (
              <View key={`${h.time}${i}`} style={{ width: 58, alignItems: 'center', gap: 3, paddingVertical: 8, borderRadius: R.md, backgroundColor: wet ? '#1E9BFF14' : t.bg }}>
                <T v="caption" color={t.faint} style={{ fontWeight: '700' }}>{h.time}</T>
                <Ionicons name={wet ? 'rainy' : h.temp >= 29 ? 'sunny' : 'partly-sunny'} size={17} color={wet ? '#1E9BFF' : '#FFB300'} />
                <T v="caption" style={{ fontWeight: '900' }}>{h.temp}°</T>
                <T v="caption" color={wet ? '#1E9BFF' : t.faint}>{h.rainProb}%</T>
              </View>
            );
          })}
        </ScrollView>
        <T v="caption" color={t.faint}>Sumber {data.source} · diperbarui tiap dibuka</T>
      </Neu>
    </View>
  );
}

// ---------------------------------------------------------------- GEMPA view
type Gempa = { lokasi?: string; waktu?: string; magnitude?: string; kedalaman?: string; koordinat?: string; potensi?: string; dirasakan?: string; peta?: string };
type BmkgTerkini = { Tanggal?: string; Jam?: string; Magnitude?: string; Kedalaman?: string; Wilayah?: string; Potensi?: string };

function GempaView({ data }: { data: { main: Gempa; list: BmkgTerkini[] } }) {
  const t = useTheme();
  const g = data.main;
  return (
    <View style={{ padding: 14, gap: 12, paddingBottom: 60 }}>
      <Neu radius={R.xl} style={{ padding: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 76, height: 76, borderRadius: 22, backgroundColor: '#FF4D6D18', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
            <T style={{ fontWeight: '900', fontSize: 24, color: '#FF4D6D' }}>{g.magnitude ?? '-'}</T>
            <T v="caption" color={t.faint}>magnitudo</T>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <T v="h3" style={{ fontSize: 15 }}>Gempa terbaru</T>
            <T v="caption" color={t.sub} style={{ fontWeight: '700' }}>{g.lokasi ?? '-'}</T>
            <T v="caption" color={t.faint}>{g.waktu ?? ''}</T>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.md, backgroundColor: t.bg }}>
            <T v="caption" style={{ fontWeight: '800' }}>Kedalaman {g.kedalaman ?? '-'}</T>
          </View>
          <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.md, backgroundColor: t.bg }}>
            <T v="caption" style={{ fontWeight: '800' }}>Koordinat {g.koordinat ?? '-'}</T>
          </View>
        </View>
        {!!g.potensi && (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: R.md, backgroundColor: '#FFB30014' }}>
            <Ionicons name="alert-circle" size={15} color="#FFB300" />
            <T v="caption" color={t.sub} style={{ flex: 1 }}>{g.potensi}</T>
          </View>
        )}
        {!!g.dirasakan && (
          <T v="caption" color={t.sub}>Skala dirasakan: <T v="caption" style={{ fontWeight: '800' }}>{g.dirasakan}</T></T>
        )}
        {!!g.peta && (
          <View style={{ borderRadius: R.lg, overflow: 'hidden', backgroundColor: t.bg2 }}>
            <Image source={{ uri: g.peta }} style={{ width: '100%', height: 190 }} contentFit="cover" />
            <View style={{ position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <T v="caption" color="#fff">Peta guncangan BMKG</T>
            </View>
          </View>
        )}
      </Neu>

      {!!data.list.length && (
        <Neu radius={R.xl} style={{ padding: 16, gap: 4 }}>
          <T v="h3" style={{ fontSize: 15, marginBottom: 4 }}>Gempa terkini (BMKG)</T>
          {data.list.slice(0, 8).map((q, i) => (
            <View key={`q${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: i < Math.min(7, data.list.length - 1) ? 1 : 0, borderBottomColor: t.border }}>
              <View style={{ width: 46, alignItems: 'center', paddingVertical: 4, borderRadius: 10, backgroundColor: Number(String(q.Magnitude ?? '0').replace(',', '.')) >= 5 ? '#FF4D6D18' : t.bg2 }}>
                <T v="caption" style={{ fontWeight: '900', color: Number(String(q.Magnitude ?? '0').replace(',', '.')) >= 5 ? '#FF4D6D' : t.text }}>{q.Magnitude ?? '-'}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T v="caption" style={{ fontWeight: '700' }} numberOfLines={2}>{q.Wilayah ?? '-'}</T>
                <T v="caption" color={t.faint}>{q.Tanggal ?? ''} · {q.Jam ?? ''} · kedalaman {q.Kedalaman ?? '-'}</T>
              </View>
            </View>
          ))}
        </Neu>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- AM Finder
type AmPreset = { no?: number; tipe?: string; judul?: string; url?: string; ukuran_file?: string };
type AmData = {
  nama_creator?: string; handle_creator?: string; bio_creator?: string; avatar_creator?: string;
  sumber?: string; judul_video?: string; tautan_video?: string; thumbnail?: string;
  tautan_share?: string; link_preset?: string[]; preset?: AmPreset[];
};

function AmFinderView({ data }: { data: AmData }) {
  const t = useTheme();
  const open = (u?: string) => u && Linking.openURL(u).catch(() => {});
  return (
    <View style={{ padding: 14, gap: 12, paddingBottom: 60 }}>
      <Neu radius={R.xl} style={{ padding: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {data.avatar_creator ? (
            <Image source={{ uri: data.avatar_creator }} style={{ width: 52, height: 52, borderRadius: 26 }} />
          ) : (
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#14C47A22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="person" size={24} color="#14C47A" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <T v="h3" style={{ fontSize: 15 }}>{data.nama_creator || 'Creator ditemukan'}</T>
            {!!data.handle_creator && <T v="caption" color={t.sub}>{data.handle_creator} · sumber {data.sumber ?? '-'}</T>}
            {!!data.judul_video && <T v="caption" color={t.faint} numberOfLines={2}>{data.judul_video}</T>}
          </View>
        </View>
        {!!data.bio_creator && <T v="caption" color={t.sub}>{data.bio_creator}</T>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!!data.tautan_video && <Btn small variant="neu" icon="open" title="Video asli" onPress={() => open(data.tautan_video)} />}
          {!!data.tautan_share && <Btn small variant="ghost" icon="share-social" title="Halaman preset" onPress={() => open(data.tautan_share)} />}
        </View>
      </Neu>

      <Neu radius={R.xl} style={{ padding: 16, gap: 10 }}>
        <T v="h3" style={{ fontSize: 15 }}>Preset AlightMotion ({data.preset?.length ?? 0})</T>
        {(data.preset ?? []).map((p, i) => (
          <View key={`p${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: R.md, backgroundColor: t.bg }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: '#14C47A22', alignItems: 'center', justifyContent: 'center' }}>
              <T v="caption" style={{ fontWeight: '900', color: '#14C47A' }}>{p.no ?? i + 1}</T>
            </View>
            <View style={{ flex: 1 }}>
              <T v="caption" style={{ fontWeight: '800' }} numberOfLines={2}>{p.judul || 'Preset AM'}</T>
              <T v="caption" color={t.faint}>{[p.tipe, p.ukuran_file].filter(Boolean).join(' · ')}</T>
            </View>
            <IconMini icon="download" color="#14C47A" onPress={() => open(p.url || data.link_preset?.[0])} />
          </View>
        ))}
        {!data.preset?.length && !!data.link_preset?.length && (
          <Btn small variant="neu" icon="download" title="Buka tautan preset" onPress={() => open(data.link_preset![0])} />
        )}
      </Neu>
    </View>
  );
}

function IconMini({ icon, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 12, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }] })}>
      <Ionicons name={icon} size={17} color={color} />
    </Pressable>
  );
}

// ================================================================ MAIN SCREEN
export function FreeMenuScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { me } = useStore();
  const [sec, setSec] = useState<Section>('berita');
  const [srcKey, setSrcKey] = useState('berita_kompas');
  const [items, setItems] = useState<any[] | null>(null);
  const [obj, setObj] = useState<any>(null); // hasil bentuk objek (cuaca7/gempa/bmkg/amfinder)
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const [railOpen, setRailOpen] = useState(false);
  const seq = useRef(0);
  const { width: winW } = useWindowDimensions();
  // tablet/desktop: sidebar terbuka; ponsel: ciut setelah memilih seksi supaya
  // konten tidak sesak (keluhan "sampingnya kegedean")
  useEffect(() => { if (winW >= 700) setRailOpen(true); }, [winW]);

  const load = useCallback(async (key: string, params: Record<string, string> = {}) => {
    const my = ++seq.current;
    setLoading(true);
    setErr('');
    try {
      const r = await vanzzCall(key, params, 50000);
      if (my !== seq.current) return;
      if (!r.ok) throw new Error(r.error ?? 'Gagal memuat.');
      const d = r.data;
      // normalisasi per jenis → objek kaya ATAU daftar item
      if (key === 'cuaca7') { setObj({ kind: 'cuaca', d }); setItems([]); }
      else if (key === 'gempa' || key === 'bmkg') {
        const main: Gempa = d?.result && typeof d.result === 'object' && !Array.isArray(d.result)
          ? (d.result.auto?.Infogempa?.gempa ? {
              lokasi: d.result.auto.Infogempa.gempa.Wilayah,
              waktu: `${d.result.auto.Infogempa.gempa.Tanggal ?? ''} ${d.result.auto.Infogempa.gempa.Jam ?? ''}`,
              magnitude: d.result.auto.Infogempa.gempa.Magnitude,
              kedalaman: d.result.auto.Infogempa.gempa.Kedalaman,
              koordinat: d.result.auto.Infogempa.gempa.Coordinates,
              potensi: d.result.auto.Infogempa.gempa.Potensi,
              dirasakan: d.result.auto.Infogempa.gempa.Dirasakan,
              peta: d.result.auto.Infogempa.gempa.downloadShakemap,
            } as Gempa : d.result)
          : {};
        const list: BmkgTerkini[] = d?.result?.terkini?.Infogempa?.gempa ?? (key === 'bmkg' ? [] : []);
        setObj({ kind: 'gempa', d: { main, list } });
        setItems([]);
      } else if (key === 'amfinder') { setObj({ kind: 'am', d: d?.result ?? d }); setItems([]); }
      else {
        // daftar: cari array pertama (termasuk nested result.xxx — dulu hanya level atas
        // → anime/otakudesu selalu "Daftar kosong"). Lalu dinormalkan ke bentuk seragam.
        let arr: any[] | null = null;
        const findArr = (o: any, depth = 0): any[] | null => {
          if (!o || typeof o !== 'object' || depth > 3) return null;
          if (Array.isArray(o)) return o;
          for (const k of Object.keys(o)) { const f = findArr(o[k], depth + 1); if (f?.length) return f; }
          return null;
        };
        arr = Array.isArray(d) ? d : findArr(d);
        // quotes Vanzz balas string tunggal → bungkus jadi 1 kartu
        if (!arr?.length && typeof d?.result === 'string' && d.result.trim()) arr = [d.result];
        const imgOf = (it: any) => {
          for (const k of ['image', 'thumbnail', 'thumb', 'img', 'poster', 'url_thumbnail', 'thumbSrc', 'cover']) {
            const v = it?.[k];
            if (typeof v === 'string' && /^https?:\/\//.test(v)) return v;
          }
          return undefined;
        };
        const norm = (it: any) => (typeof it === 'string' ? { title: it } : {
          id: it.id ?? it.id_movie ?? undefined,
          title: it.title ?? it.name ?? it.judul ?? it.anime ?? it.quote ?? it.quotes ?? it.nama ?? it.Wilayah ?? '(tanpa judul)',
          subtitle: it.author ?? it.episode ?? it.artis ?? it.channel ?? it.uploaded ?? it.date ?? it.time ?? it.waktu,
          image: imgOf(it),
          url: it.url ?? it.link ?? it.href ?? it.watch,
          snippet: it.desc ?? it.snippet ?? it.description ?? it.synopsis,
          extra: it.duration ?? it.views ?? it.size,
        });
        setObj(null);
        setItems((arr ?? []).slice(0, 60).map(norm));
        if (!arr?.length) setErr('Daftar kosong — coba sumber lain atau lagi nanti.');
      }
    } catch (e: any) {
      if (my !== seq.current) return;
      setErr(e?.message ?? 'Gagal memuat.');
      setItems([]);
      setObj(null);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  // Muat otomatis untuk tab tanpa input (berita/gempa/quotes)
  useEffect(() => {
    if (sec === 'berita') load(srcKey);
    else if (sec === 'gempa') load('gempa');
    else if (sec === 'quotes') load(srcKey);
    else { setItems(null); setObj(null); setErr(''); }
  }, [sec, srcKey, load]);

  const { width } = useWindowDimensions();
  const railW = railOpen ? 236 : 76;

  const pickSec = (s: Section) => {
    setSec(s); setItems(null); setObj(null); setErr(''); setQuery('');
    if (s === 'berita') setSrcKey('berita_kompas');
    if (s === 'quotes') setSrcKey('quotes_motivasi');
    if (winW < 700) setRailOpen(false); // ponsel: beri ruang konten maksimal
  };

  // ---------------- SIDEBAR (referensi: brand → nav → sub → CTA → footer) ----------------
  const NavItem = ({ s }: { s: (typeof SECTIONS)[number] }) => {
    const on = sec === s.key;
    return (
      <Pressable
        onPress={() => pickSec(s.key)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', gap: 11,
          height: 44, borderRadius: 14, paddingHorizontal: railOpen ? 10 : 0,
          justifyContent: railOpen ? 'flex-start' : 'center',
          marginHorizontal: 8, marginTop: 2,
          backgroundColor: on ? s.color + '1C' : pressed ? t.bg2 : 'transparent',
        })}
      >
        <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? s.color : t.bg2 }}>
          <Ionicons name={s.icon} size={16} color={on ? '#fff' : s.color} />
        </View>
        {railOpen && (
          <T v="caption" color={on ? s.color : t.sub} style={{ fontWeight: '800', flex: 1 }} numberOfLines={1}>{s.label}</T>
        )}
        {railOpen && on && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: s.color }} />}
      </Pressable>
    );
  };

  const SubItem = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, borderRadius: 10,
        paddingLeft: 12, marginHorizontal: 8, marginTop: 1,
        backgroundColor: active ? t.accentSoft : pressed ? t.bg2 : 'transparent',
      })}
    >
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: active ? t.accent : t.border }} />
      {railOpen && <T v="caption" color={active ? t.accent : t.sub} style={{ fontWeight: active ? '800' : '600', flex: 1 }} numberOfLines={1}>{label}</T>}
    </Pressable>
  );

  const showSub = sec === 'berita' ? BERITA_SRC : sec === 'quotes' ? QUOTES_SRC : null;
  const subLabel = sec === 'berita' ? 'SUMBER BERITA' : 'JENIS QUOTES';

  return (
    <Screen>
      <Header title="Menu Gratis" subtitle="Anime · Berita · Cuaca · Gempa · Quotes · AM Finder" back />
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {/* ================= SIDEBAR ================= */}
        <View style={{ width: railW, borderRightWidth: 1, borderRightColor: t.border, backgroundColor: t.bg, paddingTop: 10 }}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false} contentContainerStyle={{ paddingBottom: 12 + insets.bottom, flexGrow: 1 }}>
            {/* BRAND */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: railOpen ? 16 : 0, justifyContent: railOpen ? 'flex-start' : 'center', marginBottom: 14 }}>
              <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <T style={{ color: '#fff', fontWeight: '900', fontSize: 17 }}>Z</T>
              </View>
              {railOpen && (
                <View style={{ flex: 1 }}>
                  <T v="caption" style={{ fontWeight: '900' }}>Zeroid</T>
                  <T v="caption" color={t.faint} style={{ fontSize: 10 }}>Menu Gratis</T>
                </View>
              )}
            </View>

            {/* label seksi */}
            {railOpen && (
              <T v="caption" color={t.faint} style={{ fontSize: 10, letterSpacing: 1.2, fontWeight: '800', paddingHorizontal: 18, marginBottom: 6 }}>MENU</T>
            )}
            {SECTIONS.map((s) => <NavItem key={s.key} s={s} />)}

            {/* SUB-SUMBER (secondary level) */}
            {showSub && (
              <View style={{ marginTop: 12 }}>
                {railOpen && (
                  <T v="caption" color={t.faint} style={{ fontSize: 10, letterSpacing: 1.2, fontWeight: '800', paddingHorizontal: 18, marginBottom: 4 }}>{subLabel}</T>
                )}
                {showSub.map((x) => (
                  <SubItem key={x.key} label={x.label} active={srcKey === x.key} onPress={() => setSrcKey(x.key)} />
                ))}
              </View>
            )}

            {/* SPACER + CTA CARD (ala referensi "Skyrocket company growth") */}
            <View style={{ flex: 1, minHeight: 16 }} />
            {railOpen ? (
              <View style={{ marginHorizontal: 12, marginTop: 12, borderRadius: 18, padding: 14, backgroundColor: '#7B61FF', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="diamond" size={15} color="#fff" />
                  <T v="caption" color="#fff" style={{ fontWeight: '900' }}>Zeroid Premium</T>
                </View>
                <T v="caption" color="rgba(255,255,255,0.85)" style={{ lineHeight: 16 }}>
                  Buka centang biru, VIP, followers saluran & fitur berbayar lain.
                </T>
                <Pressable onPress={() => nav.navigate('Premium')} style={({ pressed }) => ({ backgroundColor: '#fff', borderRadius: 10, paddingVertical: 7, alignItems: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
                  <T v="caption" color="#7B61FF" style={{ fontWeight: '900' }}>Lihat paket</T>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={() => nav.navigate('Premium')} style={{ marginHorizontal: 12, marginTop: 12, height: 44, borderRadius: 14, backgroundColor: '#7B61FF', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="diamond" size={18} color="#fff" />
              </Pressable>
            )}

            {/* FOOTER workspace: user */}
            <View style={{ borderTopWidth: 1, borderTopColor: t.border, marginTop: 12, paddingTop: 10, paddingHorizontal: railOpen ? 14 : 0, flexDirection: 'row', alignItems: 'center', gap: 9, justifyContent: railOpen ? 'flex-start' : 'center' }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}>
                <T v="caption" style={{ fontWeight: '900' }}>{(me?.name ?? 'Z').slice(0, 1).toUpperCase()}</T>
              </View>
              {railOpen && (
                <View style={{ flex: 1 }}>
                  <T v="caption" style={{ fontWeight: '800' }} numberOfLines={1}>{me?.name ?? 'Pengguna'}</T>
                  <T v="caption" color={t.faint} style={{ fontSize: 10 }}>{me?.role === 'developer' ? 'Developer' : me?.role === 'admin' ? 'Admin' : 'Zeroid'}</T>
                </View>
              )}
              {railOpen && <Ionicons name="chevron-up" size={14} color={t.faint} onPress={() => setRailOpen(false)} />}
            </View>
          </ScrollView>
          {/* TOMBOL CIUT/KEMBANG — tepat di bawah sidebar (ala minimize/maximize referensi) */}
          <Pressable
            onPress={() => setRailOpen((v) => !v)}
            accessibilityLabel={railOpen ? 'Ciutkan menu' : 'Kembangkan menu'}
            style={{ position: 'absolute', top: 74, right: -13, width: 26, height: 26, borderRadius: 13, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' } as any}
          >
            <Ionicons name={railOpen ? 'chevron-back' : 'chevron-forward'} size={14} color={t.sub} />
          </Pressable>
        </View>

        {/* ================= KONTEN ================= */}
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* input kota (cuaca) / URL (AM finder) */}
          {(sec === 'cuaca' || sec === 'amfinder') && (
            <View style={{ paddingHorizontal: 14, paddingTop: 10, gap: 10, paddingBottom: 8 }}>
              <NeuInput
                icon={sec === 'cuaca' ? 'partly-sunny' : 'link'}
                placeholder={sec === 'cuaca' ? 'Nama kota (mis. Jakarta, Bandung)…' : 'Tempel URL TikTok/YouTube preset AlightMotion…'}
                value={query}
                onChangeText={setQuery}
                autoCapitalize="none"
              />
              <Btn
                small
                variant="primary"
                icon={sec === 'cuaca' ? 'search' : 'flash'}
                title={sec === 'cuaca' ? 'Cek cuaca sekarang' : 'Cari preset'}
                disabled={!query.trim()}
                loading={loading}
                onPress={() => load(sec === 'cuaca' ? 'cuaca7' : 'amfinder', sec === 'cuaca' ? { kota: query.trim() } : { url: query.trim() })}
              />
            </View>
          )}

          {/* ANIME → buka hub lengkap + FYP */}
          {sec === 'anime' && (
            <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 + insets.bottom }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Neu radius={R.xl} style={{ flex: 1, padding: 14, gap: 8 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#FF7A9C22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="tv" size={22} color="#FF7A9C" />
                  </View>
                  <T v="h3" style={{ fontSize: 15 }}>Anime Hub</T>
                  <T v="caption" color={t.sub}>Terbaru, populer, jadwal, cari, favorit & tonton sub Indo.</T>
                  <Btn small icon="tv" variant="primary" title="Buka Hub" onPress={() => nav.navigate('Anime')} />
                </Neu>
                <Neu radius={R.xl} style={{ flex: 1, padding: 14, gap: 8 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: '#7B61FF22', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="rocket" size={22} color="#7B61FF" />
                  </View>
                  <T v="h3" style={{ fontSize: 15 }}>FYP Anime</T>
                  <T v="caption" color={t.sub}>Yang lagi naik minggu ini (sub Indo).</T>
                  <Btn small icon="flame" variant="neu" title="Muat FYP" onPress={() => load('anime_fyp')} />
                </Neu>
              </View>
              {!!items && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {items.slice(0, 30).map((it: any, i: number) => (
                    <Pressable key={`fy${i}`} onPress={() => (it.id ? nav.navigate('AnimeDetail', { slug: `ain:${it.id}`, title: it.title, poster: it.image }) : it.url && Linking.openURL(it.url).catch(() => {}))} style={{ width: '31%', flexGrow: 1, minWidth: 104 }}>
                      <View style={{ borderRadius: R.lg, overflow: 'hidden', backgroundColor: t.surface }}>
                        {it.image ? (
                          <Image source={{ uri: it.image }} style={{ width: '100%', aspectRatio: 0.72 }} contentFit="cover" />
                        ) : (
                          <View style={{ width: '100%', aspectRatio: 0.72, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg2 }}>
                            <Ionicons name="tv-outline" size={24} color={t.faint} />
                          </View>
                        )}
                        <View style={{ padding: 8, gap: 2 }}>
                          <T v="caption" numberOfLines={2} style={{ fontWeight: '800', minHeight: 28 }}>{it.title}</T>
                          {!!it.subtitle && <T v="caption" color={t.faint} numberOfLines={1}>{it.subtitle}</T>}
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          {loading && sec !== 'anime' && (
            <View style={{ padding: 26, alignItems: 'center' }}>
              <ActivityIndicator color={t.accent} />
            </View>
          )}
          {!loading && !!err && sec !== 'anime' && (
            <ScrollView contentContainerStyle={{ padding: 14 }}>
              <Empty
                icon="cloud-offline"
                title="Gagal memuat"
                body={err}
                action={<Btn title="Coba lagi" onPress={() => (sec === 'berita' || sec === 'quotes' ? load(srcKey) : sec === 'gempa' ? load('gempa') : query.trim() ? load(sec === 'cuaca' ? 'cuaca7' : 'amfinder', sec === 'cuaca' ? { kota: query.trim() } : { url: query.trim() }) : undefined)} />}
              />
            </ScrollView>
          )}

          {/* CUACA — tampilan kaya */}
          {!loading && !err && sec === 'cuaca' && obj?.kind === 'cuaca' && (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
              <CuacaView data={obj.d as CuacaData} />
            </ScrollView>
          )}

          {/* GEMPA — tampilan kaya */}
          {!loading && !err && sec === 'gempa' && obj?.kind === 'gempa' && (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
              <GempaView data={obj.d} />
            </ScrollView>
          )}

          {/* AM FINDER — tampilan kaya */}
          {!loading && !err && sec === 'amfinder' && obj?.kind === 'am' && (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 + insets.bottom }} showsVerticalScrollIndicator={false}>
              <AmFinderView data={obj.d as AmData} />
            </ScrollView>
          )}

          {/* BERITA — daftar */}
          {!loading && !err && sec === 'berita' && !!items?.length && (
            <FlatList
              data={items}
              keyExtractor={(_, i) => `l${i}`}
              contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom }}
              renderItem={({ item }) => (
                <NewsCard item={item} onOpen={() => (item.url || item.extra) && Linking.openURL(item.url || item.extra!).catch(() => {})} />
              )}
            />
          )}

          {/* QUOTES — kartu kutipan rapi */}
          {!loading && !err && sec === 'quotes' && !!items?.length && (
            <FlatList
              data={items}
              keyExtractor={(_, i) => `q${i}`}
              contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom, gap: 10 }}
              renderItem={({ item }) => (
                <Neu radius={R.xl} style={{ padding: 16, gap: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: '#7B61FF18', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="chatbubble-ellipses" size={13} color="#7B61FF" />
                    </View>
                    <T v="sub" style={{ flex: 1, fontStyle: 'italic', lineHeight: 21 }}>"{item.title}"</T>
                  </View>
                  {!!item.subtitle && (
                    <T v="caption" color={t.sub} style={{ fontWeight: '700', paddingLeft: 36 }}>— {item.subtitle}</T>
                  )}
                </Neu>
              )}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}
