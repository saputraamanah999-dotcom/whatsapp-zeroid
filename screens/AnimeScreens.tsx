/**
 * Anime — powered by the Jerexd anime endpoints through the /api/jere proxy.
 * Hub (terbaru / populer / jadwal / quotes / berita / cari / favorit)
 *  → detail (sinopsis, genre, episode, unduhan, favorit)
 *  → nonton (pemain langsung bila sumber direct video tersedia).
 * Favorit tersimpan di Firestore (anime_favs) sehingga sinkron antar perangkat.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, ScrollView, Pressable, ActivityIndicator, Linking, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { T, Btn, Card, Empty, Header, IconBtn, Neu, NeuInput, Row, Screen, Segmented } from '../components/ui';
import VideoPlayer from '../components/VideoPlayer';
import { Sheet } from '../components/Sheet';
import { useTheme, R } from '../lib/theme';
import { isAnimeFav, toggleAnimeFav, useStore } from '../lib/store';
import { animeDetail, animeHot, animeLatest, animeSchedule, animeSearch, animeQuotes, animeNews, AnimeCard, AnimeDetail, AnimeQuote, AnimeNews } from '../lib/jere';

function Poster({ uri, style }: { uri?: string; style?: any }) {
  return (
    <View style={[{ backgroundColor: 'rgba(127,127,127,0.15)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: R.md }, ...(Array.isArray(style) ? style : [style ?? {}])]}>
      {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" recyclingKey={uri} /> : <Ionicons name="tv-outline" size={26} color="rgba(127,127,127,0.6)" />}
    </View>
  );
}

function AnimeCardItem({ a, onPress }: { a: AnimeCard; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, margin: 5, borderRadius: R.lg, overflow: 'hidden', backgroundColor: t.surface, boxShadow: pressed ? t.insetSm : t.raisedSm, transform: [{ scale: pressed ? 0.98 : 1 }] } as any)}>
      <Poster uri={a.poster} style={{ width: '100%', aspectRatio: 0.7 }} />
      <View style={{ padding: 9, gap: 3 }}>
        <T v="caption" numberOfLines={2} style={{ fontWeight: '700', minHeight: 30 }}>
          {a.title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {!!a.episode && (
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: t.accentSoft }}>
              <T v="caption" color={t.accent} style={{ fontWeight: '800' }}>EP {a.episode}</T>
            </View>
          )}
          {!!a.rating && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Ionicons name="star" size={11} color="#F5A623" />
              <T v="caption" color={t.sub} style={{ fontWeight: '700' }}>{a.rating}</T>
            </View>
          )}
        </View>
        {!!a.releaseDay && <T v="caption" color={t.faint} numberOfLines={1}>{a.releaseDay}</T>}
      </View>
    </Pressable>
  );
}

type HubTab = 'latest' | 'hot' | 'schedule' | 'quotes' | 'news' | 'fav';

const TABS: { value: HubTab; label: string }[] = [
  { value: 'latest', label: 'Terbaru' },
  { value: 'hot', label: 'Populer' },
  { value: 'schedule', label: 'Jadwal' },
  { value: 'quotes', label: 'Quotes' },
  { value: 'news', label: 'Berita' },
  { value: 'fav', label: 'Favorit' },
];

export function AnimeScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { db } = useStore();
  const [tab, setTab] = useState<HubTab>('latest');
  const [query, setQuery] = useState('');
  const [searchRes, setSearchRes] = useState<AnimeCard[] | null>(null);
  const [lists, setLists] = useState<Partial<Record<HubTab, AnimeCard[]>>>({});
  const [quotes, setQuotes] = useState<AnimeQuote[] | null>(null);
  const [news, setNews] = useState<AnimeNews[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);

  const load = useCallback(
    async (which: HubTab) => {
      if (which === 'fav') return; // favs come from the store subscription
      if (lists[which]) return;
      setLoading(true);
      setErr('');
      try {
        const list = which === 'latest' ? await animeLatest() : which === 'hot' ? await animeHot() : await animeSchedule();
        setLists((x) => ({ ...x, [which]: list }));
        if (!list.length) setErr('Daftar kosong dari layanan. Coba lagi nanti.');
      } catch (e: any) {
        setErr(e?.message ?? 'Gagal memuat.');
      } finally {
        setLoading(false);
      }
    },
    [lists]
  );

  const loadQuotes = useCallback(async () => {
    if (quotes) return;
    setLoading(true);
    setErr('');
    try {
      setQuotes(await animeQuotes());
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memuat kutipan.');
    } finally {
      setLoading(false);
    }
  }, [quotes]);

  const loadNews = useCallback(async () => {
    if (news) return;
    setLoading(true);
    setErr('');
    try {
      setNews(await animeNews());
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memuat berita.');
    } finally {
      setLoading(false);
    }
  }, [news]);

  useEffect(() => {
    if (searchRes) return;
    setErr('');
    if (tab === 'quotes') loadQuotes();
    else if (tab === 'news') loadNews();
    else load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, searchRes]);

  const doSearch = (q: string) => {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) {
      setSearchRes(null);
      setErr('');
      return;
    }
    debounce.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      setLoading(true);
      setErr('');
      try {
        const res = await animeSearch(q.trim());
        if (seq !== searchSeq.current) return;
        setSearchRes(res);
        if (!res.length) setErr(`Tidak ada hasil untuk "${q.trim()}".`);
      } catch (e: any) {
        if (seq !== searchSeq.current) return;
        setErr(e?.message ?? 'Pencarian gagal.');
        setSearchRes([]);
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, 450);
  };

  const shown = searchRes ?? (tab === 'fav' ? db.animeFavs.map((f) => ({ slug: f.slug, title: f.title, poster: f.poster })) : lists[tab] ?? []);
  const { width } = useWindowDimensions();
  const cols = Math.max(2, Math.min(4, Math.floor(width / 165)));

  return (
    <Screen>
      <Header title="Anime" subtitle="OtakuDesu via Jerexd · cari, tonton, favorit, unduh" back />
      <View style={{ paddingHorizontal: 14, gap: 10 }}>
        <NeuInput icon="search" placeholder="Cari anime… (mis. one piece)" value={query} onChangeText={doSearch} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          {TABS.map((x) => {
            const on = searchRes ? false : tab === x.value;
            return (
              <Pressable
                key={x.value}
                onPress={() => {
                  setSearchRes(null);
                  setQuery('');
                  setTab(x.value);
                }}
                style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? t.accent : t.surface, borderWidth: 1, borderColor: on ? t.accent : t.border }}
              >
                <T v="caption" color={on ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{x.label}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading && (
        <View style={{ padding: 26, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}
      {!loading && !!err && <Empty icon="cloud-offline" title="Gagal memuat" body={err} action={<Btn title="Coba lagi" onPress={() => { setSearchRes(null); setQuery(''); setLists((x) => ({ ...x, [tab]: undefined as any })); if (tab === 'quotes') setQuotes(null); if (tab === 'news') setNews(null); }} />} />}

      {!loading && !err && tab === 'quotes' && (
        <FlatList
          data={quotes ?? []}
          keyExtractor={(_, i) => `q${i}`}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom, gap: 10 }}
          ListEmptyComponent={<Empty icon="chatbubbles" title="Belum ada kutipan" />}
          renderItem={({ item }) => (
            <Neu style={{ padding: 14, gap: 8 }}>
              <T style={{ fontStyle: 'italic' }}>"{item.quote}"</T>
              <T v="caption" color={t.sub} style={{ fontWeight: '700' }}>
                — {item.character ?? 'Tidak diketahui'}
                {item.anime ? ` · ${item.anime}` : ''}
              </T>
            </Neu>
          )}
        />
      )}

      {!loading && !err && tab === 'news' && (
        <FlatList
          data={news ?? []}
          keyExtractor={(_, i) => `n${i}`}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom, gap: 10 }}
          ListEmptyComponent={<Empty icon="newspaper" title="Belum ada berita" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => item.url && Linking.openURL(item.url).catch(() => {})}>
              <Neu style={{ flexDirection: 'row', gap: 10, padding: 10, alignItems: 'center' }}>
                <Poster uri={item.thumb} style={{ width: 86, height: 62 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="caption" numberOfLines={2} style={{ fontWeight: '800' }}>{item.title}</T>
                  {!!item.date && <T v="caption" color={t.faint}>{item.date}</T>}
                  {!!item.snippet && <T v="caption" color={t.sub} numberOfLines={2}>{item.snippet}</T>}
                </View>
                <Ionicons name="open-outline" size={16} color={t.sub} />
              </Neu>
            </Pressable>
          )}
        />
      )}

      {!loading && !err && tab !== 'quotes' && tab !== 'news' && (
        <FlatList
          key={`grid-${cols}`}
          data={shown as AnimeCard[]}
          numColumns={cols}
          keyExtractor={(x, i) => x.slug || `i${i}`}
          contentContainerStyle={{ padding: 9, paddingBottom: 40 + insets.bottom }}
          ListEmptyComponent={
            <Empty
              icon={tab === 'fav' ? 'heart-outline' : 'tv-outline'}
              title={tab === 'fav' ? 'Belum ada favorit' : 'Tidak ada anime'}
              body={tab === 'fav' ? 'Tekan ikon hati di halaman detail anime untuk menyimpannya di sini.' : 'Coba tab lain atau cari judul.'}
            />
          }
          renderItem={({ item }) => <AnimeCardItem a={item as AnimeCard} onPress={() => nav.navigate('AnimeDetail', { slug: (item as AnimeCard).slug, card: item as AnimeCard })} />}
        />
      )}
    </Screen>
  );
}

// ============================== detail ==============================

export function AnimeDetailScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const rt = useRoute<any>();
  const { width } = useWindowDimensions();
  const initial: AnimeCard | undefined = rt.params?.card;
  const slug: string = rt.params?.slug ?? initial?.slug ?? '';
  const [d, setD] = useState<AnimeDetail | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [fav, setFav] = useState(initial ? isAnimeFav(initial.slug) : false);
  const [dl, setDl] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const a = await animeDetail(slug);
        if (!alive) return;
        setD(a);
        setFav(isAnimeFav(a.slug || slug));
      } catch (e: any) {
        if (alive) setErr(e?.message ?? 'Gagal memuat detail.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  const poster = d?.poster ?? initial?.poster;
  const title = d?.title ?? initial?.title ?? 'Anime';

  if (loading)
    return (
      <Screen>
        <Header title={initial?.title ?? 'Anime'} back />
        <View style={{ padding: 30, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      </Screen>
    );

  if (err || !d)
    return (
      <Screen>
        <Header title={title} back />
        <Empty icon="cloud-offline" title="Gagal memuat" body={err || 'Detail tidak tersedia.'} action={<Btn title="Coba lagi" onPress={() => nav.setParams({ t: Date.now() })} />} />
      </Screen>
    );

  return (
    <Screen>
      <Header
        title={title}
        back
        right={
          <IconBtn
            icon={fav ? 'heart' : 'heart-outline'}
            color={fav ? '#FF4D6D' : t.sub}
            onPress={async () => setFav(await toggleAnimeFav({ slug: d.slug || slug, title, poster }))}
          />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 44, gap: 14 }}>
        <View style={{ flexDirection: width > 560 ? 'row' : 'column', gap: 14 }}>
          <Poster uri={poster} style={{ width: width > 560 ? 180 : '100%', aspectRatio: 0.7 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <T style={{ fontWeight: '900', fontSize: 20 }}>{title}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {!!d.rating && <Chip icon="star" text={d.rating} color="#F5A623" />}
              {!!d.status && <Chip text={d.status} />}
              {!!d.episodes?.length && <Chip text={`${d.episodes.length} episode`} />}
              {!!d.duration && <Chip text={d.duration} />}
              {!!d.released && <Chip text={d.released} />}
            </View>
            {!!d.genres?.length && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                {d.genres.map((g) => (
                  <View key={g} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.accentSoft }}>
                    <T v="caption" color={t.accent} style={{ fontWeight: '700' }}>{g}</T>
                  </View>
                ))}
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Btn icon="play" title="Tonton" onPress={() => nav.navigate('AnimeWatch', { slug: d.slug || slug, title })} disabled={!d.episodes?.length} />
              <Btn icon="download" title="Unduh" variant="neu" onPress={() => setDl(true)} disabled={!d.downloads?.length} />
            </View>
          </View>
        </View>

        {!!d.synopsis && (
          <Card title="Sinopsis">
            <T color={t.sub}>{d.synopsis}</T>
          </Card>
        )}

        <Card title={`Episode (${d.episodes?.length ?? 0})`}>
          {d.episodes?.length ? (
            <View style={{ gap: 6 }}>
              {d.episodes.slice(0, 60).map((e) => (
                <Row key={e.slug} icon="play-circle" title={e.title} subtitle={e.date} onPress={() => nav.navigate('AnimeWatch', { slug: e.slug, title: `${title} — ${e.title}` })} />
              ))}
              {(d.episodes.length ?? 0) > 60 && <T v="caption" color={t.faint}>… dan {d.episodes.length - 60} episode lain (buka lewat unduhan)</T>}
            </View>
          ) : (
            <T color={t.faint}>Daftar episode tidak tersedia.</T>
          )}
        </Card>
      </ScrollView>

      <Sheet visible={dl} onClose={() => setDl(false)} title="Unduh">
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
          {d.downloads?.length ? (
            d.downloads.map((grp, i) => (
              <View key={`g${i}`} style={{ gap: 5 }}>
                <T v="caption" style={{ fontWeight: '900' }}>{grp.label}</T>
                {grp.urls.map((u, j) => (
                  <Btn key={`u${i}-${j}`} icon="download" title={u.label} variant="neu" small onPress={() => Linking.openURL(u.url).catch(() => {})} />
                ))}
              </View>
            ))
          ) : (
            <T color={t.faint}>Tautan unduhan tidak tersedia.</T>
          )}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

function Chip({ icon, text, color }: { icon?: keyof typeof Ionicons.glyphMap; text: string; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: t.bg2 }}>
      {icon && <Ionicons name={icon} size={12} color={color ?? t.sub} />}
      <T v="caption" color={color ?? t.sub} style={{ fontWeight: '800' }}>{text}</T>
    </View>
  );
}

// ============================== watch ==============================

export function AnimeWatchScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const rt = useRoute<any>();
  const slug: string = rt.params?.slug ?? '';
  const label: string = rt.params?.title ?? 'Tonton';
  const [err, setErr] = useState('');
  const [video, setVideo] = useState<string | null>(null);
  const [links, setLinks] = useState<{ label: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await animeDetail(slug);
        if (!alive) return;
        const found: { label: string; url: string }[] = [];
        for (const grp of d.downloads ?? []) for (const u of grp.urls ?? []) found.push({ label: `${grp.label} · ${u.label}`, url: u.url });
        const playable = found.find((x) => /\.(mp4|webm|m3u8)(\?|$)/i.test(x.url));
        setVideo(playable?.url ?? null);
        setLinks(found);
        if (!playable && !found.length) setErr('Tidak ada sumber video/unduhan untuk episode ini.');
      } catch (e: any) {
        if (alive) setErr(e?.message ?? 'Gagal memuat sumber video.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  return (
    <Screen>
      <Header title={label} back />
      {loading && (
        <View style={{ padding: 30, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}
      {!loading && video && (
        <View style={{ padding: 16, gap: 14 }}>
          <VideoPlayer uri={video} height={230} />
          <T v="caption" color={t.faint}>Memutar sumber langsung: {video.slice(0, 60)}…</T>
        </View>
      )}
      {!loading && !video && !err && (
        <View style={{ padding: 16, gap: 8 }}>
          <Empty icon="videocam-off" title="Pemain langsung tidak tersedia" body="Unduh lewat tautan di bawah, atau buka di browser." />
        </View>
      )}
      {!loading && !!err && <Empty icon="cloud-offline" title="Gagal memuat" body={err} />}
      {!loading && !!links.length && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8, paddingBottom: 40 }}>
          <T v="caption" style={{ fontWeight: '900' }}>Tautan unduhan / pemutar eksternal</T>
          {links.slice(0, 24).map((l, i) => (
            <Btn key={i} icon="download" title={l.label} variant="neu" small onPress={() => Linking.openURL(l.url).catch(() => {})} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
