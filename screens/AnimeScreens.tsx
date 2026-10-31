/**
 * ANIME — mesin BARU (animein via /api/vanzz). Sumber lama (otakudesu/samehadaku/
 * anichin siputzx) MATI di hulu — detail selalu "tidak dapat dibaca". Sekarang:
 *   Terbaru : otakudesu_latest (thumb+judul, via Vanzz) → ketuk = cari animein
 *   Populer : anime_fyp (poster asli + id movie) → detail langsung
 *   Jadwal  : /api/jere (fallback Jikan resmi — masih hidup)
 *   Quotes/Berita: /api/jere (Jikan/ANN)
 *   Cari    : animein search → movie (sinopsis, poster, tahun)
 *   Detail  : animein info(id) — sinopsis ASLI + daftar episode
 *   Nonton  : animein streams(idEpisode) — server kualitas, direct mp4 diputar
 *             di dalam app, embed dibuka eksternal + tombol episode berikutnya.
 * Slug detail: "ain:<idMovie>" (langsung) / "q:<judul>" (cari dulu) / URL lama
 * (dicoba dicari via judul).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, ScrollView, Pressable, ActivityIndicator, Linking, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { T, Btn, Card, Empty, Header, IconBtn, Neu, NeuInput, Row, Screen } from '../components/ui';
import VideoPlayer from '../components/VideoPlayer';
import { useTheme, R } from '../lib/theme';
import { isAnimeFav, toggleAnimeFav, useStore } from '../lib/store';
import { animeSchedule, animeQuotes, animeNews, animeLatest as jereLatest, animeHot as jereHot, animeSearch as jereSearch, animeDetail as jereDetail, AnimeCard, AnimeQuote, AnimeNews, AnimeDetail as JereDetail } from '../lib/jere';
import { animeInSearch, animeInInfo, animeInStreams, animeFyp, otakudesuLatest, AnimeInMovie, AnimeInEpisode } from '../lib/vanzz';

/** Cache poster fallback per judul (Jikan/MyAnimeList — CORS publik). */
const posterFallback = new Map<string, string>();

function Poster({ uri, title, style }: { uri?: string; title?: string; style?: any }) {
  const [src, setSrc] = React.useState<string | undefined>(uri);
  React.useEffect(() => { setSrc(uri); }, [uri]);
  const onErr = React.useCallback(() => {
    // poster sumber kadang mati → cari poster asli via Jikan sekali per judul (cache)
    const t = String(title ?? '').trim();
    if (!t) return;
    if (posterFallback.has(t)) { setSrc(posterFallback.get(t)); return; }
    if (posterFallback.has('__busy__' + t)) return;
    posterFallback.set('__busy__' + t, '');
    fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(t.slice(0, 80))}&limit=1&sfw=true`)
      .then((r) => r.json())
      .then((j) => {
        const p = j?.data?.[0]?.images?.jpg?.large_image_url ?? j?.data?.[0]?.images?.jpg?.image_url;
        if (p) { posterFallback.set(t, p); setSrc(p); }
      })
      .catch(() => {})
      .finally(() => posterFallback.delete('__busy__' + t));
  }, [title]);
  return (
    <View style={[{ backgroundColor: 'rgba(127,127,127,0.15)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: R.md }, ...(Array.isArray(style) ? style : [style ?? {}])]}>
      {src ? <Image source={{ uri: src }} style={{ width: '100%', height: '100%' }} contentFit="cover" recyclingKey={src} transition={150} onError={onErr} /> : <Ionicons name="tv-outline" size={26} color="rgba(127,127,127,0.6)" />}
    </View>
  );
}

type Card = { slug: string; title: string; poster?: string; sub?: string; id?: string };

function AnimeCardItem({ a, onPress }: { a: Card; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, margin: 5, borderRadius: R.lg, overflow: 'hidden', backgroundColor: t.surface, boxShadow: pressed ? t.insetSm : t.raisedSm, transform: [{ scale: pressed ? 0.98 : 1 }] } as any)}>
      <Poster uri={a.poster} title={a.title} style={{ width: '100%', aspectRatio: 0.7 }} />
      <View style={{ padding: 9, gap: 3 }}>
        <T v="caption" numberOfLines={2} style={{ fontWeight: '700', minHeight: 30 }}>{a.title}</T>
        {!!a.sub && <T v="caption" color={t.faint} numberOfLines={1}>{a.sub}</T>}
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

/** bersihkan judul otakudesu → kata kunci pencarian (buang "Episode … Subtitle Indonesia"). */
const cleanTitle = (s: string) => s.replace(/episode\s+\d+.*$/i, '').replace(/subtitle\s+indonesia/i, '').replace(/\s{2,}/g, ' ').trim();

/** Pencarian JIKAN langsung (MyAnimeList, CORS terbuka, tanpa kunci) —
 *  scraper sumber sering buta-query (balik list terbaru walau dicari apa pun). */
async function jikanSearch(q: string): Promise<Card[]> {
  const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=24&sfw=true`).then((x) => x.json());
  return (r?.data ?? []).map((a: any) => ({
    slug: `jikan:${a.mal_id}`,
    title: a.title,
    poster: a.images?.jpg?.large_image_url ?? a.images?.jpg?.image_url,
    sub: a.score ? `★ ${a.score}` : [a.type, a.year].filter(Boolean).join(' · '),
  })).filter((c: Card) => c.title && c.slug !== 'jikan:undefined');
}

export function AnimeScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const rt = useRoute<any>();
  const { db } = useStore();
  const [tab, setTab] = useState<HubTab>('latest');
  const [query, setQuery] = useState('');
  const [searchRes, setSearchRes] = useState<Card[] | null>(null);
  const [lists, setLists] = useState<Partial<Record<HubTab, Card[]>>>({});
  const [quotes, setQuotes] = useState<AnimeQuote[] | null>(null);
  const [news, setNews] = useState<AnimeNews[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeq = useRef(0);
  const [tick, setTick] = useState(0);

  const openDetail = useCallback((c: Card) => {
    nav.navigate('AnimeDetail', { slug: c.slug, title: c.title, poster: c.poster });
  }, [nav]);

  const fetchTab = useCallback(async (which: HubTab) => {
    if (which === 'fav') return;
    setLoading(true); setErr('');
    try {
      let cards: Card[] = [];
      if (which === 'latest') {
        // animein dulu; upstream mati (Vanzz DEPLOYMENT_NOT_FOUND terbukti) → Jikan
        try {
          const rows = await otakudesuLatest();
          cards = rows.map((r) => ({ slug: `q:${cleanTitle(r.title)}`, title: r.title, poster: r.thumb, sub: r.episode ? `EP ${r.episode}` : undefined }));
        } catch {
          const list = await jereLatest();
          cards = list.map((a: AnimeCard) => ({ slug: a.slug, title: a.title, poster: a.poster, sub: a.episode ? `EP ${a.episode}` : a.releaseDay }));
        }
      } else if (which === 'hot') {
        try {
          const rows = await animeFyp();
          cards = rows.map((r) => ({ slug: r.id_movie ? `ain:${r.id_movie}` : `q:${r.anime}`, title: r.anime, poster: r.poster, sub: r.episode ? `EP ${r.episode}` : undefined }));
        } catch {
          const list = await jereHot();
          cards = list.map((a: AnimeCard) => ({ slug: a.slug, title: a.title, poster: a.poster, sub: a.rating ? `★ ${a.rating}` : undefined }));
        }
      } else {
        const list = await animeSchedule(); // jere — fallback Jikan resmi masih hidup
        cards = list.map((a: AnimeCard) => ({ slug: a.slug, title: a.title, poster: a.poster, sub: a.episode ? `EP ${a.episode}` : a.releaseDay }));
      }
      setLists((x) => ({ ...x, [which]: cards }));
      if (!cards.length) setErr('Daftar kosong dari layanan. Coba lagi nanti.');
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal memuat.');
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(
    async (which: HubTab) => {
      if (which === 'fav') return;
      if (lists[which]) return;
      await fetchTab(which);
    },
    [lists, fetchTab]
  );

  const loadQuotes = useCallback(async () => {
    if (quotes) return;
    setLoading(true); setErr('');
    try { setQuotes(await animeQuotes()); } catch (e: any) { setErr(e?.message ?? 'Gagal memuat kutipan.'); } finally { setLoading(false); }
  }, [quotes]);

  const loadNews = useCallback(async () => {
    if (news) return;
    setLoading(true); setErr('');
    try { setNews(await animeNews()); } catch (e: any) { setErr(e?.message ?? 'Gagal memuat berita.'); } finally { setLoading(false); }
  }, [news]);

  useEffect(() => {
    if (searchRes) return;
    setErr('');
    if (tab === 'quotes') loadQuotes();
    else if (tab === 'news') loadNews();
    else load(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, searchRes, tick]);

  // param q dari layar lain (Menu Gratis FYP) → langsung cari
  useEffect(() => {
    const q = rt.params?.q;
    if (q) { setTab('latest'); doSearch(String(q)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.params?.q]);

  const doSearch = (q: string) => {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) { setSearchRes(null); setErr(''); return; }
    debounce.current = setTimeout(async () => {
      const seq = ++searchSeq.current;
      setLoading(true); setErr('');
      try {
        let cards: Card[] = [];
        try {
          const movies = await animeInSearch(q.trim());
          cards = movies.map((m: AnimeInMovie) => ({ slug: `ain:${m.id}`, title: m.title, poster: m.image_poster, sub: [m.type, m.year].filter(Boolean).join(' · ') }));
        } catch {
          // animein mati → JIKAN langsung (hasil pencarian beneran) → jere
          try { cards = await jikanSearch(q.trim()); }
          catch { const list = await jereSearch(q.trim()); cards = list.map((a: AnimeCard) => ({ slug: a.slug, title: a.title, poster: a.poster, sub: a.rating ? `★ ${a.rating}` : undefined })); }
        }
        if (seq !== searchSeq.current) return;
        setSearchRes(cards);
        if (!cards.length) setErr(`Tidak ada hasil untuk "${q.trim()}".`);
      } catch (e: any) {
        if (seq !== searchSeq.current) return;
        setErr(e?.message ?? 'Pencarian gagal.');
        setSearchRes([]);
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, 450);
  };

  const shown: Card[] = searchRes ?? (tab === 'fav'
    ? db.animeFavs.map((f) => ({ slug: f.slug, title: f.title, poster: f.poster }))
    : lists[tab] ?? []);
  const { width } = useWindowDimensions();
  const cols = Math.max(2, Math.min(4, Math.floor(width / 165)));

  return (
    <Screen>
      <Header title="Anime" subtitle="Cari, tonton & favorit — sub Indo" back />
      <View style={{ paddingHorizontal: 14, gap: 10 }}>
        <NeuInput icon="search" placeholder="Cari anime… (mis. one piece)" value={query} onChangeText={doSearch} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
          {TABS.map((x) => {
            const on = searchRes ? false : tab === x.value;
            return (
              <Pressable
                key={x.value}
                onPress={() => { setSearchRes(null); setQuery(''); setTab(x.value); }}
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
      {!loading && !!err && <Empty icon="cloud-offline" title="Gagal memuat" body={err} action={<Btn title="Coba lagi" onPress={() => { setSearchRes(null); setQuery(''); setLists((x) => ({ ...x, [tab]: undefined as any })); if (tab === 'quotes') setQuotes(null); if (tab === 'news') setNews(null); setTick((x) => x + 1); }} />} />}

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
          contentContainerStyle={{ padding: 14, paddingBottom: 40 + insets.bottom }}
          ListEmptyComponent={<Empty icon="newspaper" title="Belum ada berita" />}
          renderItem={({ item }) => (
            <Pressable onPress={() => item.url && Linking.openURL(item.url).catch(() => {})}>
              <Neu style={{ flexDirection: 'row', gap: 10, padding: 10, alignItems: 'center' }}>
                <Poster uri={item.thumb} title={item.title} style={{ width: 86, height: 62 }} />
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
          data={shown}
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
          renderItem={({ item }) => <AnimeCardItem a={item} onPress={() => openDetail(item)} />}
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
  const slug: string = rt.params?.slug ?? '';
  const [d, setD] = useState<{ movie: AnimeInMovie; episodes: AnimeInEpisode[]; jikan?: boolean } | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [fav, setFav] = useState(isAnimeFav(slug));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let id = '';
        let posterHint = rt.params?.poster;
        let titleHint = rt.params?.title ?? '';
        if (slug.startsWith('ain:')) {
          id = slug.slice(4);
        } else if (slug.startsWith('jikan:')) {
          // favorit/kartu dari Jikan — detail resmi via /api/jere (sinopsis + episode)
          const j = await jereDetail(slug);
          if (!alive) return;
          if (!j) throw new Error('Detail tidak tersedia.');
          const jd = j as JereDetail;
          setD({
            movie: {
              id: slug,
              title: jd.title || titleHint,
              synopsis: jd.synopsis,
              image_poster: jd.poster ?? posterHint,
              status: jd.status,
              type: 'TV',
              year: (jd.released ?? '').slice(0, 4),
              genre: (jd.genres ?? []).join(', '),
              studio: jd.studio,
            } as AnimeInMovie,
            episodes: (jd.episodes ?? []).map((e) => ({ id: e.slug, index: '', title: e.title, id_movie: slug, key_time: e.date } as AnimeInEpisode)),
            jikan: true,
          });
          setFav(isAnimeFav(slug));
          setLoading(false);
          return;
        } else {
          // URL otakudesu lama / "q:" → cari dulu (animein dulu, lalu Jikan)
          const kw = slug.startsWith('q:') ? slug.slice(2) : decodeURIComponent(slug).replace(/^https?:\/\/[^/]+\/anime\//, '').replace(/\/$/, '').replace(/-/g, ' ');
          try {
            const m = await animeInSearch(kw.slice(0, 70));
            if (m[0]?.id) { id = m[0].id; titleHint = m[0].title; posterHint = m[0].image_poster ?? posterHint; }
          } catch {
            try {
              const jc = await jikanSearch(kw.slice(0, 70));
              if (jc[0]?.slug) { nav.replace('AnimeDetail', { slug: jc[0].slug, title: jc[0].title, poster: jc[0].poster }); return; }
            } catch {
              const list = await jereSearch(kw.slice(0, 70));
              if (list[0]?.slug) { nav.replace('AnimeDetail', { slug: list[0].slug, title: list[0].title, poster: list[0].poster }); return; }
            }
          }
        }
        if (!id) throw new Error('Judul tidak ditemukan di katalog — coba cari manual.');
        const info = await animeInInfo(id);
        if (!alive) return;
        setD({ movie: { ...info.movie, image_poster: info.movie.image_poster ?? posterHint, title: info.movie.title || titleHint }, episodes: info.episodes });
        setFav(isAnimeFav(`ain:${id}`));
      } catch (e: any) {
        if (alive) setErr(e?.message ?? 'Gagal memuat detail.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [slug, tick]);

  const movie = d?.movie;
  const poster = movie?.image_poster ?? rt.params?.poster;
  const title = movie?.title || rt.params?.title || 'Anime';
  const isJikan = !!d?.jikan;

  if (loading)
    return (
      <Screen>
        <Header title={rt.params?.title ?? 'Anime'} back />
        <View style={{ padding: 30, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      </Screen>
    );

  if (err || !d || !movie)
    return (
      <Screen>
        <Header title={title} back />
        <Empty
          icon="cloud-offline"
          title="Detail tidak tersedia"
          body={`${err || 'Coba lagi.'}`}
          action={
            <View style={{ gap: 8, alignItems: 'center' }}>
              <Btn title="Coba lagi" onPress={() => { setErr(''); setLoading(true); setTick((x) => x + 1); }} />
              <Btn variant="neu" icon="search" title="Cari judul ini" onPress={() => nav.navigate('Anime')} />
            </View>
          }
        />
      </Screen>
    );

  const favSlug = slug.startsWith('ain:') ? slug : movie.id ? `ain:${movie.id}` : slug;
  const genres = String(movie.genre ?? '').split(',').map((g) => g.trim()).filter(Boolean);

  return (
    <Screen>
      <Header
        title={title}
        back
        right={
          <IconBtn
            icon={fav ? 'heart' : 'heart-outline'}
            color={fav ? '#FF4D6D' : t.sub}
            onPress={async () => setFav(await toggleAnimeFav({ slug: favSlug, title, poster }))}
          />
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 44, gap: 14 }}>
        <View style={{ flexDirection: width > 560 ? 'row' : 'column', gap: 14 }}>
          <Poster uri={poster} title={title} style={{ width: width > 560 ? 180 : '100%', aspectRatio: 0.7 }} />
          <View style={{ flex: 1, gap: 6 }}>
            <T style={{ fontWeight: '900', fontSize: 20 }}>{title}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {!!movie.status && <Chip text={movie.status} />}
              {!!movie.type && <Chip text={movie.type} />}
              {!!movie.year && <Chip text={String(movie.year)} />}
              {!!d.episodes?.length && <Chip text={`${d.episodes.length} episode`} />}
              {!!movie.studio && <Chip text={movie.studio} />}
            </View>
            {!!genres.length && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                {genres.slice(0, 8).map((g) => (
                  <View key={g} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.accentSoft }}>
                    <T v="caption" color={t.accent} style={{ fontWeight: '700' }}>{g}</T>
                  </View>
                ))}
              </View>
            )}
            {!!movie.views && (
              <T v="caption" color={t.faint}>
                {Number(movie.views).toLocaleString('id-ID')} tayangan{movie.favorites ? ` · ${Number(movie.favorites).toLocaleString('id-ID')} favorit` : ''}
              </T>
            )}
          </View>
        </View>

        {!!movie.synopsis && (
          <Card title="Sinopsis">
            <T color={t.sub}>{movie.synopsis}</T>
          </Card>
        )}

        <Card title={`Episode (${d.episodes?.length ?? 0})`}>
          {d.episodes?.length ? (
            <View style={{ gap: 6 }}>
              {d.episodes.slice(0, 80).map((e) => (
                <Row
                  key={e.id}
                  icon="play-circle"
                  title={e.title}
                  subtitle={[e.key_time, e.views ? `${Number(e.views).toLocaleString('id-ID')}x ditonton` : ''].filter(Boolean).join(' · ')}
                  onPress={() => nav.navigate('AnimeWatch', { epId: e.id, title: `${title} — ${e.title}` })}
                />
              ))}
              {isJikan && (
                <T v="caption" color={t.faint} style={{ marginTop: 6 }}>
                  Streaming sumber utama sedang maintenance — daftar episode dari MyAnimeList. Coba lagi nanti untuk pemutar langsung.
                </T>
              )}
            </View>
          ) : (
            <T color={t.faint}>Daftar episode tidak tersedia.</T>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

function Chip({ text, icon, color }: { text: string; icon?: keyof typeof Ionicons.glyphMap; color?: string }) {
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
  const epId: string = rt.params?.epId ?? '';
  const label: string = rt.params?.title ?? 'Tonton';
  const [err, setErr] = useState('');
  const [servers, setServers] = useState<{ link: string; quality?: string; name?: string; type?: string }[]>([]);
  const [next, setNext] = useState<{ id: string; title?: string } | null>(null);
  const [sel, setSel] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (epId.startsWith('jikan:')) {
          // episode dari sumber Jikan (upstream utama mati) — tidak ada server langsung
          if (alive) { setErr('Pemutar langsung sedang tidak tersedia (sumber utama maintenance). Coba lagi nanti.'); setLoading(false); }
          return;
        }
        const r = await animeInStreams(epId);
        if (!alive) return;
        setServers(r.servers);
        setNext(r.next ?? null);
        setSel(0);
        if (!r.servers.length) setErr('Tidak ada server untuk episode ini — coba lagi nanti.');
      } catch (e: any) {
        if (alive) setErr(e?.message ?? 'Gagal memuat sumber video.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [epId, tick]);

  const direct = servers.filter((s) => /\.(mp4|webm|m3u8)(\?|$)/i.test(s.link) || s.type === 'direct');
  const embed = servers.filter((s) => !direct.includes(s));
  const cur = direct[sel];

  return (
    <Screen>
      <Header title={label} back />
      {loading && (
        <View style={{ padding: 30, alignItems: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}
      {!loading && cur && (
        <View style={{ padding: 16, gap: 12 }}>
          <VideoPlayer uri={cur.link} height={230} />
          {/* pilih kualitas/server */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>
            {direct.map((s, i) => (
              <Pressable
                key={`${s.link}${i}`}
                onPress={() => setSel(i)}
                style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: i === sel ? t.accent : t.surface, borderWidth: 1, borderColor: i === sel ? t.accent : t.border }}
              >
                <T v="caption" color={i === sel ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{[s.quality, s.name].filter(Boolean).join(' · ') || `Server ${i + 1}`}</T>
              </Pressable>
            ))}
          </ScrollView>
          {next && (
            <Btn icon="play-forward" variant="neu" title={`Episode berikutnya${next.title ? ` — ${next.title}` : ''}`} onPress={() => nav.replace('AnimeWatch', { epId: next.id, title: label.replace(/ — .*$/, '') + (next.title ? ` — ${next.title}` : '') })} />
          )}
        </View>
      )}
      {!loading && !cur && !err && (
        <View style={{ padding: 16, gap: 8 }}>
          <Empty icon="videocam-off" title="Pemain langsung tidak tersedia" body="Buka lewat server embed di bawah." />
        </View>
      )}
      {!loading && !!err && (
        <Empty
          icon="cloud-offline"
          title="Gagal memuat sumber"
          body={err}
          action={<Btn title="Coba lagi" onPress={() => { setErr(''); setLoading(true); setTick((x) => x + 1); }} />}
        />
      )}
      {!loading && !!embed.length && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8, paddingBottom: 40 }}>
          <T v="caption" style={{ fontWeight: '900' }}>Server embed (buka browser)</T>
          {embed.slice(0, 12).map((s, i) => (
            <Btn key={`e${i}`} icon="open" title={[s.quality, s.name].filter(Boolean).join(' · ') || `Server ${i + 1}`} variant="neu" small onPress={() => Linking.openURL(s.link).catch(() => {})} />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
