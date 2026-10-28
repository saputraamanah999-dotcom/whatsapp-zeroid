/**
 * ZEROID MUSIC — global mini player bar (glassmorphism) + layar pemutar penuh.
 *
 * Dipasang SEKALI di App root → lagu tetap nyala di semua halaman.
 *  - Mini bar kaca di atas tab bar: judul, play/pause, next, expand, tombol
 *    sembunyikan (menyusut jadi gelembung melayang — lagu tetap bunyi).
 *  - Di layar chat mini-bar otomatis jadi gelembung kecil (tidak menutupi composer).
 *  - Layar penuh: cover besar, seek bar, lirik (LRCLIB), antrean.
 *  - Mode embed: kalau direct audio tidak tersedia, memakai iframe/WebView
 *    YouTube resmi (tetap tersembunyi & terus bunyi lintas halaman).
 */
import React, { useEffect, useState } from 'react';
import { View, Pressable, Modal, Platform, ScrollView, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInDown, FadeOutDown, FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { usePlayer, toggle, next, prev, seek, close, openFull, closeFull, setBarVisible, play, setEmbedNode, MusicSong } from '../lib/player';
import { musicLyrics } from '../lib/music';
import { useActiveRouteName } from '../lib/bus';
import { useTheme } from '../lib/theme';
import { T } from './ui';

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
};

/** gaya kaca: latar semi transparan + blur + border tipis (web pakai backdrop-filter) */
function glass(dark: boolean, extra: ViewStyle = {}): ViewStyle {
  return {
    backgroundColor: dark ? 'rgba(30,36,46,0.72)' : 'rgba(255,255,255,0.66)',
    borderWidth: 1,
    borderColor: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.55)',
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(18px) saturate(1.5)', WebkitBackdropFilter: 'blur(18px) saturate(1.5)' } as any) : {}),
    ...extra,
  } as ViewStyle;
}

/** seek bar sederhana: tap / geser untuk melompat */
function SeekBar({ position, duration, accent, onSeek }: { position: number; duration: number; accent: string; onSeek: (s: number) => void }) {
  const [w, setW] = useState(1);
  const [drag, setDrag] = useState<number | null>(null);
  const ratio = duration > 0 ? Math.min(1, (drag ?? position) / duration) : 0;
  const posFrom = (x: number) => {
    const r = Math.max(0, Math.min(1, x / Math.max(1, w)));
    setDrag(r * duration);
  };
  return (
    <View style={{ gap: 5 }}>
      <Pressable
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        onPress={(e) => { posFrom(e.nativeEvent.locationX); setTimeout(() => setDrag(null), 120); }}
        onMoveShouldSetResponder={() => true}
        onResponderMove={(e) => posFrom(e.nativeEvent.locationX)}
        onResponderRelease={(e) => { posFrom(e.nativeEvent.locationX); onSeek(Math.max(0, drag ?? 0)); setDrag(null); }}
        style={{ height: 26, justifyContent: 'center' }}
        hitSlop={{ top: 8, bottom: 8 }}
      >
        <View style={{ height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
          <View style={{ width: `${ratio * 100}%`, height: '100%', borderRadius: 3, backgroundColor: accent }} />
        </View>
        <View style={{ position: 'absolute', left: `calc(${ratio * 100}% - 7px)`, width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', boxShadow: '0px 2px 6px rgba(0,0,0,0.35)' } as any} />
      </Pressable>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="caption" color="rgba(255,255,255,0.75)">{fmt(drag ?? position)}</T>
        <T v="caption" color="rgba(255,255,255,0.75)">{fmt(duration)}</T>
      </View>
    </View>
  );
}

export default function MusicBar() {
  const st = usePlayer();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // layar dengan elemen penting di bawah (composer chat / player lain) →
  // mini-bar otomatis menyusut jadi gelembung melayang.
  // CATATAN: JANGAN pakai useNavigationState di sini — MusicBar dipasang di
  // root App (di luar Stack.Navigator) sehingga hook itu THROW "Couldn't get
  // the navigation state" dan bikin seluruh aplikasi WHITE SCREEN.
  // Gunakan nama route yang dipublikasikan App lewat onStateChange.
  const activeRoute = useActiveRouteName();
  const collapseToBubble = !!activeRoute && ['ChatRoom', 'Call', 'MediaViewer', 'StoryViewer', 'StoryCreate', 'AnimeWatch', 'Music'].includes(activeRoute);
  const [hidden, setHidden] = useState(false);
  const [lyr, setLyr] = useState<{ for: string; text: string; loading: boolean }>({ for: '', text: '', loading: false });
  const [tab, setTab] = useState<'player' | 'lyrics' | 'queue'>('player');
  const song = st.current;
  const embedRef = React.useRef<any>(null);
  useEffect(() => { setEmbedNode(embedRef.current); }, [st.embed, song?.videoId]);

  const loadLyrics = async (s: MusicSong) => {
    if (lyr.for === s.videoId && lyr.text) { setTab('lyrics'); return; }
    setLyr({ for: s.videoId, text: '', loading: true });
    setTab('lyrics');
    try {
      const text = await musicLyrics(s.title, s.artist ?? '', s.videoId);
      setLyr({ for: s.videoId, text: text || 'Lirik tidak ditemukan untuk lagu ini.', loading: false });
    } catch {
      setLyr({ for: s.videoId, text: 'Lirik gagal dimuat. Coba lagi.', loading: false });
    }
  };

  if (!song) return null;

  const embedSrc = `https://www.youtube-nocookie.com/embed/${song.videoId}?enablejsapi=1&autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1`;
  const embedVisible = st.embed && st.fullOpen;

  /** node embed TUNGGAL: tersembunyi 1px saat mode bar, tampil di layar penuh */
  const embedNodeEl = st.embed ? (
    <View
      pointerEvents={embedVisible ? 'auto' : 'none'}
      style={embedVisible
        ? { alignSelf: 'stretch', width: '100%', aspectRatio: 16 / 9, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000' }
        : { position: 'absolute', width: 1, height: 1, opacity: 0.01, overflow: 'hidden', bottom: -5, right: -5 } as any}
    >
      {Platform.OS === 'web' ? (
        React.createElement('iframe', {
          key: song.videoId,
          ref: (n: any) => { embedRef.current = n; setEmbedNode(n); },
          src: embedSrc,
          allow: 'autoplay; encrypted-media; picture-in-picture',
          title: 'Zeroid Music',
          frameBorder: '0',
          style: { width: '100%', height: '100%', border: 0, borderRadius: embedVisible ? 18 : 0, pointerEvents: embedVisible ? 'auto' : 'none' } as any,
        })
      ) : (
        React.createElement(require('react-native-webview').WebView, {
          key: song.videoId,
          ref: (n: any) => { embedRef.current = n; setEmbedNode(n); },
          source: { uri: embedSrc },
          javaScriptEnabled: true,
          mediaPlaybackRequiresUserAction: false,
          allowsInlineMediaPlayback: true,
          style: { width: '100%', height: '100%', backgroundColor: '#000' },
        })
      )}
    </View>
  ) : null;

  // gelembung melayang (disembunyikan manual ATAU otomatis di layar chat/dll)
  if ((hidden && !st.barVisible) || collapseToBubble) {
    return (
      <>
        {st.embed && !st.fullOpen ? embedNodeEl : null}
        <Animated.View entering={FadeIn.springify()} exiting={FadeOut} pointerEvents="box-none" style={{ position: 'absolute', right: 14, bottom: insets.bottom + (collapseToBubble ? 136 : 104), zIndex: 900 }}>
          <Pressable
            onPress={() => { setHidden(false); setBarVisible(true); openFull(); }}
            onLongPress={() => { close(); setHidden(false); setBarVisible(true); }}
            style={({ pressed }) => [glass(t.dark, { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 10px 26px rgba(0,0,0,0.35)', opacity: pressed ? 0.9 : 1, overflow: 'hidden' } as ViewStyle)]}
          >
            {song.thumb ? (
              <Image source={{ uri: song.thumb }} style={{ width: 56, height: 56 }} contentFit="cover" />
            ) : (
              <Ionicons name="musical-notes" size={24} color={t.accent} />
            )}
            <View style={{ position: 'absolute', bottom: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: st.playing ? t.success : t.faint, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.dark ? '#1D222B' : '#E9EDF3' }}>
              <Ionicons name={st.playing ? 'play' : 'pause'} size={9} color="#fff" />
            </View>
          </Pressable>
        </Animated.View>
      </>
    );
  }
  if (!st.barVisible) return <>{st.embed && !st.fullOpen ? embedNodeEl : null}</>;

  return (
    <>
      {st.embed && !st.fullOpen ? embedNodeEl : null}
      {/* ---------- MINI BAR (glass) ---------- */}
      <Animated.View
        entering={FadeInDown.springify().damping(16)}
        exiting={FadeOutDown.duration(180)}
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 84, zIndex: 900 }}
      >
        <Pressable
          onPress={openFull}
          style={({ pressed }) => [glass(t.dark, { borderRadius: 20, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 10, boxShadow: '0px 12px 30px rgba(0,0,0,0.28)', opacity: pressed ? 0.97 : 1, maxWidth: 520, alignSelf: 'center', width: '100%' } as ViewStyle)]}
        >
          {song.thumb ? (
            <Image source={{ uri: song.thumb }} style={{ width: 44, height: 44, borderRadius: 14 }} contentFit="cover" />
          ) : (
            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="musical-note" size={20} color={t.accent} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <T v="sub" numberOfLines={1} style={{ fontWeight: '800', fontSize: 13.5 }}>{song.title}</T>
            <T v="caption" color={t.dark ? 'rgba(255,255,255,0.6)' : t.sub} numberOfLines={1}>
              {st.loading ? 'Menyiapkan audio…' : st.embed ? 'Mode pemutar cadangan' : song.artist ?? 'ZEROID MUSIC'}
            </T>
          </View>
          <Pressable onPress={() => toggle()} hitSlop={8} accessibilityLabel={st.playing ? 'Jeda' : 'Putar'}>
            {st.loading ? (
              <Ionicons name="hourglass" size={22} color={t.accent} />
            ) : (
              <Ionicons name={st.playing ? 'pause-circle' : 'play-circle'} size={32} color={t.accent} />
            )}
          </Pressable>
          <Pressable onPress={() => next()} hitSlop={8} accessibilityLabel="Lagu berikutnya">
            <Ionicons name="play-skip-forward" size={20} color={t.sub} />
          </Pressable>
          <Pressable
            onPress={() => { setHidden(true); setBarVisible(false); }}
            hitSlop={8}
            accessibilityLabel="Sembunyikan pemutar"
          >
            <Ionicons name="chevron-down" size={18} color={t.faint} />
          </Pressable>
        </Pressable>
      </Animated.View>

      {/* ---------- FULL PLAYER ---------- */}
      <Modal visible={st.fullOpen} transparent animationType="slide" onRequestClose={closeFull}>
        <View style={{ flex: 1, backgroundColor: t.dark ? 'rgba(10,13,20,0.97)' : 'rgba(24,28,38,0.97)' }}>
          <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 18, paddingBottom: insets.bottom + 18, flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable onPress={closeFull} hitSlop={10} accessibilityLabel="Tutup">
                <Ionicons name="chevron-down" size={26} color="#fff" />
              </Pressable>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <T v="caption" color="rgba(255,255,255,0.6)" style={{ fontWeight: '800', letterSpacing: 2 }}>ZEROID MUSIC</T>
              </View>
              <Pressable onPress={() => { close(); setTab('player'); }} hitSlop={10} accessibilityLabel="Hentikan dan tutup">
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 20, flexGrow: 1, justifyContent: 'center' }} showsVerticalScrollIndicator={false}>
              {tab === 'player' && (
                <View style={{ gap: 18, alignItems: 'center', marginTop: 10 }}>
                  {st.embed ? (
                    <>
                      {embedNodeEl}
                      <T v="caption" color="rgba(255,255,255,0.6)" style={{ textAlign: 'center' }}>
                        Sumber audio langsung sedang tidak tersedia — memutar lewat pemutar resmi YouTube.
                      </T>
                    </>
                  ) : (
                    <View style={[glass(true, { borderRadius: 28, padding: 8, overflow: 'hidden' }), { boxShadow: '0px 24px 60px rgba(0,0,0,0.5)' } as any]}>
                      {song.thumb ? (
                        <Image source={{ uri: song.thumb }} style={{ width: 260, height: 260, borderRadius: 22 }} contentFit="cover" />
                      ) : (
                        <View style={{ width: 260, height: 260, borderRadius: 22, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="musical-notes" size={72} color={t.accent} />
                        </View>
                      )}
                    </View>
                  )}
                  <View style={{ alignItems: 'center', gap: 4, paddingHorizontal: 12 }}>
                    <T v="h2" color="#fff" style={{ textAlign: 'center' }} numberOfLines={2}>{song.title}</T>
                    <T v="sub" color="rgba(255,255,255,0.65)" numberOfLines={1}>{song.artist ?? 'ZEROID MUSIC'}</T>
                  </View>
                  {!st.embed && (
                    <View style={{ alignSelf: 'stretch', paddingHorizontal: 10 }}>
                      <SeekBar position={st.position} duration={st.duration} accent={t.accent2} onSeek={seek} />
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 30 }}>
                    <Pressable onPress={prev} hitSlop={10}><Ionicons name="play-skip-back" size={30} color="#fff" /></Pressable>
                    <Pressable
                      onPress={() => toggle()}
                      style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 38, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }], boxShadow: '0px 12px 30px rgba(61,134,255,0.45)' } as any)}
                      accessibilityLabel={st.playing ? 'Jeda' : 'Putar'}
                    >
                      {st.loading ? (
                        <Ionicons name="hourglass" size={32} color="#fff" />
                      ) : (
                        <Ionicons name={st.playing ? 'pause' : 'play'} size={34} color="#fff" style={{ marginLeft: st.playing ? 0 : 3 }} />
                      )}
                    </Pressable>
                    <Pressable onPress={next} hitSlop={10}><Ionicons name="play-skip-forward" size={30} color="#fff" /></Pressable>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => void loadLyrics(song)} style={[glass(true, { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 })]}>
                      <Ionicons name="document-text" size={15} color="#fff" />
                      <T v="caption" color="#fff" style={{ fontWeight: '700' }}>Lirik</T>
                    </Pressable>
                    {st.queue.length > 1 && (
                      <Pressable onPress={() => setTab('queue')} style={[glass(true, { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 })]}>
                        <Ionicons name="list" size={15} color="#fff" />
                        <T v="caption" color="#fff" style={{ fontWeight: '700' }}>Antrean · {st.queue.length}</T>
                      </Pressable>
                    )}
                  </View>
                </View>
              )}

              {tab === 'lyrics' && (
                <View style={{ gap: 14, marginTop: 10 }}>
                  <Pressable onPress={() => setTab('player')} style={{ alignSelf: 'flex-start' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="chevron-back" size={16} color="#fff" />
                      <T v="caption" color="#fff">Kembali ke pemutar</T>
                    </View>
                  </Pressable>
                  <T v="h3" color="#fff">{song.title}</T>
                  {lyr.loading ? (
                    <T v="sub" color="rgba(255,255,255,0.7)">Memuat lirik…</T>
                  ) : (
                    <T color="rgba(255,255,255,0.88)" style={{ lineHeight: 26, fontSize: 15.5 }}>{lyr.text || 'Lirik belum tersedia.'}</T>
                  )}
                </View>
              )}

              {tab === 'queue' && (
                <View style={{ gap: 6, marginTop: 10 }}>
                  <Pressable onPress={() => setTab('player')} style={{ alignSelf: 'flex-start', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="chevron-back" size={16} color="#fff" />
                      <T v="caption" color="#fff">Kembali ke pemutar</T>
                    </View>
                  </Pressable>
                  {st.queue.map((s) => {
                    const on = s.videoId === song.videoId;
                    return (
                      <Pressable key={s.videoId} onPress={() => void play(s, st.queue)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 14, backgroundColor: on ? 'rgba(61,134,255,0.18)' : 'transparent' }}>
                        {s.thumb ? <Image source={{ uri: s.thumb }} style={{ width: 42, height: 42, borderRadius: 10 }} contentFit="cover" /> : <View style={{ width: 42, height: 42, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.1)' }} />}
                        <View style={{ flex: 1 }}>
                          <T color={on ? '#8FC0FF' : '#fff'} numberOfLines={1} style={{ fontWeight: '700' }}>{s.title}</T>
                          <T v="caption" color="rgba(255,255,255,0.55)" numberOfLines={1}>{s.artist ?? ''}</T>
                        </View>
                        {on && <Ionicons name="volume-high" size={16} color="#8FC0FF" />}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
