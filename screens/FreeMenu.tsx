/**
 * MENU GRATIS (Menu List) — satu tempat untuk semua fitur GRATIS via Vanzz API:
 *   Anime (hub lengkap), Berita (6 sumber), Quotes (motivasi/galau/gombal),
 *   Cek Cuaca, Cek Gempa (BMKG), AlightMotion Finder.
 * Semua dipanggil lewat proxy server /api/vanzz — apikey TIDAK pernah di client.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Linking, FlatList, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { T, Btn, Empty, Header, Neu, NeuInput, Screen } from '../components/ui';
import { useTheme, R } from '../lib/theme';
import { vanzzCall, toItems, FreeItem } from '../lib/vanzz';

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

function NewsCard({ item, onOpen }: { item: FreeItem; onOpen?: () => void }) {
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

export function FreeMenuScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [sec, setSec] = useState<Section>('berita');
  const [srcKey, setSrcKey] = useState('berita_kompas');
  const [items, setItems] = useState<FreeItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [query, setQuery] = useState('');
  const seq = useRef(0);

  const load = useCallback(async (key: string, params: Record<string, string> = {}) => {
    const my = ++seq.current;
    setLoading(true);
    setErr('');
    try {
      const r = await vanzzCall(key, params, 50000);
      if (my !== seq.current) return;
      if (!r.ok) throw new Error(r.error ?? 'Gagal memuat.');
      const list = toItems(r.data);
      setItems(list);
      if (!list.length) setErr('Daftar kosong — coba lagi nanti.');
    } catch (e: any) {
      if (my !== seq.current) return;
      setErr(e?.message ?? 'Gagal memuat.');
      setItems([]);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  // Muat otomatis untuk tab tanpa input (berita/gempa/quotes)
  useEffect(() => {
    if (sec === 'berita') load(srcKey);
    else if (sec === 'gempa') load('gempa');
    else if (sec === 'quotes') load(srcKey);
    else { setItems(null); setErr(''); }
  }, [sec, srcKey, load]);

  const { width } = useWindowDimensions();

  return (
    <Screen>
      <Header title="Menu Gratis" subtitle="Anime · Berita · Cuaca · Gempa · Quotes · AM Finder" back />
      {/* pilih bagian */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
        {SECTIONS.map((s) => {
          const on = sec === s.key;
          return (
            <Pressable
              key={s.key}
              onPress={() => { setSec(s.key); setItems(null); setErr(''); setQuery(''); if (s.key === 'berita') { setSrcKey('berita_kompas'); } if (s.key === 'quotes') { setSrcKey('quotes_motivasi'); } }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, backgroundColor: on ? s.color : t.surface, borderWidth: 1, borderColor: on ? s.color : t.border }}
            >
              <Ionicons name={s.icon} size={14} color={on ? '#fff' : s.color} />
              <T v="caption" color={on ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{s.label}</T>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* sub-sumber berita / quotes */}
      {(sec === 'berita' || sec === 'quotes') && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingHorizontal: 14, paddingBottom: 8 }}>
          {(sec === 'berita' ? BERITA_SRC : QUOTES_SRC).map((x) => {
            const on = srcKey === x.key;
            return (
              <Pressable
                key={x.key}
                onPress={() => setSrcKey(x.key)}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? t.accent2 : t.surface, borderWidth: 1, borderColor: on ? t.accent2 : t.border }}
              >
                <T v="caption" color={on ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{x.label}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* input kota (cuaca) / URL tiktok (AM finder) */}
      {(sec === 'cuaca' || sec === 'amfinder') && (
        <View style={{ paddingHorizontal: 14, gap: 10, paddingBottom: 8 }}>
          <NeuInput
            icon={sec === 'cuaca' ? 'partly-sunny' : 'link'}
            placeholder={sec === 'cuaca' ? 'Nama kota (mis. Jakarta, Bandung)…' : 'Tempel URL TikTok preset AlightMotion…'}
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
            onPress={() => load(sec === 'cuaca' ? 'cuaca' : 'amfinder', sec === 'cuaca' ? { kota: query.trim() } : { url: query.trim() })}
          />
        </View>
      )}

      {/* ANIME → buka hub lengkap */}
      {sec === 'anime' && (
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 40 + insets.bottom }}>
          <Neu radius={R.xl} style={{ padding: 18, gap: 12, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#FF7A9C22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="tv" size={28} color="#FF7A9C" />
            </View>
            <T v="h3">Anime Hub</T>
            <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>Terbaru, populer, jadwal, cari, favorit & tonton — sumber OtakuDesu + anime sub Indo lengkap.</T>
            <Btn icon="tv" variant="primary" title="Buka Anime Hub" onPress={() => nav.navigate('Anime')} />
          </Neu>
          <Neu radius={R.xl} style={{ padding: 18, gap: 12, alignItems: 'center' }}>
            <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: '#7B61FF22', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="rocket" size={28} color="#7B61FF" />
            </View>
            <T v="h3">FYP Anime Sub Indo</T>
            <T v="caption" color={t.sub} style={{ textAlign: 'center' }}>Anime yang lagi naik dari Animein (sub Indo) — langsung tonton.</T>
            <Btn icon="flame" variant="neu" title="Lihat FYP Anime" onPress={() => load('anime_fyp')} />
          </Neu>
          {sec === 'anime' && !!items && (
            <View style={{ gap: 10 }}>
              {items.slice(0, 40).map((it, i) => (
                <NewsCard key={`fy${i}`} item={it} onOpen={() => it.url && Linking.openURL(it.url).catch(() => {})} />
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
        <Empty
          icon="cloud-offline"
          title="Gagal memuat"
          body={err}
          action={<Btn title="Coba lagi" onPress={() => (sec === 'berita' || sec === 'quotes' ? load(srcKey) : sec === 'gempa' ? load('gempa') : query.trim() ? load(sec === 'cuaca' ? 'cuaca' : 'amfinder', sec === 'cuaca' ? { kota: query.trim() } : { url: query.trim() }) : undefined)} />}
        />
      )}

      {/* CUACA — kartu besar */}
      {!loading && !err && sec === 'cuaca' && !!items?.length && (
        <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom, gap: 12 }}>
          {items.map((it, i) => (
            <Neu key={`c${i}`} radius={R.xl} style={{ padding: 18, alignItems: 'center', gap: 8 }}>
              <Ionicons name="partly-sunny" size={44} color="#FFB300" />
              <T style={{ fontWeight: '900', fontSize: 22 }}>{it.extra ?? it.title}</T>
              <T v="sub" color={t.sub}>{it.title}</T>
              <View style={{ flexDirection: width > 480 ? 'row' : 'column', gap: 10, marginTop: 6 }}>
                {[it.subtitle, it.snippet].filter(Boolean).map((s, j) => (
                  <View key={j} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.md, backgroundColor: t.bg2 }}>
                    <T v="caption" style={{ fontWeight: '700' }}>{s}</T>
                  </View>
                ))}
              </View>
            </Neu>
          ))}
        </ScrollView>
      )}

      {/* BERITA / GEMPA / QUOTES / AM FINDER — daftar */}
      {!loading && !err && (sec === 'berita' || sec === 'gempa' || sec === 'amfinder') && !!items?.length && (
        <FlatList
          data={items}
          keyExtractor={(_, i) => `l${i}`}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom }}
          renderItem={({ item }) => (
            <NewsCard item={item} onOpen={() => (item.url || item.extra) && Linking.openURL(item.url || item.extra!).catch(() => {})} />
          )}
        />
      )}

      {/* QUOTES — kartu kutipan */}
      {!loading && !err && sec === 'quotes' && !!items?.length && (
        <FlatList
          data={items}
          keyExtractor={(_, i) => `q${i}`}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom, gap: 10 }}
          renderItem={({ item }) => (
            <Neu style={{ padding: 14, gap: 8 }}>
              <T style={{ fontStyle: 'italic' }}>"{item.title}"</T>
              {!!item.subtitle && <T v="caption" color={t.sub} style={{ fontWeight: '700' }}>— {item.subtitle}</T>}
            </Neu>
          )}
        />
      )}
    </Screen>
  );
}
