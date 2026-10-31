import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, View, ActivityIndicator, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { useStore, initStore, acceptCall, declineCall, sendMessage, markRead, adminEndAnnouncement, bannedNow, myAppeal, recheckDeviceBan } from './lib/store';
import { useTheme, R } from './lib/theme';
import { navRef, setActiveRouteName, pushBanner } from './lib/bus';
import { setupNotifications, registerPushToken } from './lib/notify';
import { registerWebFcm } from './lib/fcm';
import { isFirebaseConfigured } from './lib/firebase';
import { ZeroidLogo, Icon } from './lib/icons';
import { T, Btn } from './components/ui';
import { BannerHost, PermissionHost, IncomingCallHost, AnnouncementBanner, InstallBanner } from './components/Hosts';
import MusicBar from './components/MusicBar';
import VoiceBar from './components/VoiceBar';
import CallBar from './components/CallBar';
import ErrorBoundary from './components/ErrorBoundary';
import BanGlyph from './components/BanGlyph';
import BannedScreen from './screens/BannedScreen';
import { LoginScreen, RegisterScreen, ForgotScreen, VerifyEmailScreen } from './screens/AuthScreens';
import MainScreen from './screens/MainScreen';
import ChatRoom from './screens/ChatRoom';
import ChatInfo from './screens/ChatInfo';
import NewChat from './screens/NewChat';
import NewGroup from './screens/NewGroup';
import CallScreen from './screens/CallScreen';
import StoryViewer from './screens/StoryViewer';
import StoryCreate from './screens/StoryCreate';
import MediaViewer from './screens/MediaViewer';
import AdminScreen from './screens/AdminScreen';
import ApiStatus from './screens/ApiStatus';
import { UserProfile, PremiumScreen, SecurityScreen, MusicScreen, StickersScreen, SetUsernameScreen, LockScreen } from './screens/ExtraScreens';
import { AnimeScreen, AnimeDetailScreen, AnimeWatchScreen } from './screens/AnimeScreens';
import { EditProfile, PrivacyScreen, NotifSettings, PermissionsScreen, NotificationsScreen, StarredScreen } from './screens/SettingsScreens';
import { ChatBubblesScreen, WallpaperScreen } from './screens/ChatCustomScreens';
import FeedbackScreen from './screens/FeedbackScreen';
import SearchScreen from './screens/SearchScreen';
import AuditScreen from './screens/AuditScreen';
import { RewardsScreen, LeaderboardScreen } from './screens/RewardsScreens';
import DevGuard from './components/DevGuard';
import { captureRefFromUrl } from './lib/points';

SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator();
const nav = createNavigationContainerRef<any>();
navRef.navigate = (name, params) => {
  if (nav.isReady()) (nav.navigate as any)(name, params);
};

/**
 * Web history sync — the Android back GESTURE / browser back button must
 * navigate INSIDE the app (chat → list → …) instead of leaving the website.
 *
 * How it works:
 *  - every in-app navigation that goes DEEPER pushes a history entry;
 *  - popstate (swipe-back / back button) calls nav.goBack() in-app;
 *  - programmatic back (UI buttons) consumes the matching history entries;
 *  - a re-armed GUARD entry at the root swallows stray back gestures so the
 *    site never closes — just like a native app (back on root = no-op).
 */
function useWebHistorySync() {
  const aligning = useRef(false);  // our own history.go() is in flight
  const skipAlign = useRef(false); // popstate-triggered goBack already applied
  const lastDepth = useRef(-1);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const armGuard = () => { try { history.pushState({ zw: 'guard' }, ''); } catch {} };
    armGuard();
    const onPop = () => {
      if (aligning.current) { aligning.current = false; return; }
      if (!nav.isReady() || !nav.canGoBack()) { armGuard(); return; } // root: swallow, never exit
      skipAlign.current = true;
      nav.goBack();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return useCallback(() => {
    if (Platform.OS !== 'web' || !nav.isReady()) return;
    const st = nav.getState();
    const depth = (st?.index ?? 0) + 1;
    if (lastDepth.current === -1) { lastDepth.current = depth; return; }
    if (skipAlign.current) { skipAlign.current = false; lastDepth.current = depth; return; }
    if (depth > lastDepth.current) {
      try { history.pushState({ zw: depth }, ''); } catch {}
    } else if (depth < lastDepth.current) {
      const diff = lastDepth.current - depth;
      if (diff > 0) {
        aligning.current = true;
        try { history.go(-diff); } catch { aligning.current = false; }
      }
    }
    lastDepth.current = depth;
  }, []);
}

/**
 * Anti-copy (web) — blok seleksi teks + klik-kanan + salin di seluruh aplikasi
 * KECUALI di input/textarea (biar tetap bisa ketik/tempel saat chat).
 * Disuntikkan sekali sebagai <style> global.
 */
function useAntiCopy() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.id = 'zeroid-anticopy';
    style.textContent = `
      * { -webkit-user-select: none; -moz-user-select: none; user-select: none; -webkit-touch-callout: none; }
      input, textarea, [contenteditable="true"], [data-selectable="true"] {
        -webkit-user-select: text !important; user-select: text !important; -webkit-touch-callout: default;
      }
    `;
    document.head.appendChild(style);
    const isEditable = (el: EventTarget | null) => {
      const n = el as HTMLElement | null;
      if (!n || !(n instanceof HTMLElement)) return true;
      return !!n.closest('input, textarea, [contenteditable="true"]');
    };
    const noCtx = (e: MouseEvent) => { if (!isEditable(e.target)) e.preventDefault(); };
    const noCopy = (e: ClipboardEvent) => { if (!isEditable(e.target)) e.preventDefault(); };
    const noDrag = (e: DragEvent) => { if (!isEditable(e.target)) e.preventDefault(); };
    document.addEventListener('contextmenu', noCtx);
    document.addEventListener('copy', noCopy);
    document.addEventListener('cut', noCopy);
    document.addEventListener('dragstart', noDrag);
    return () => {
      document.removeEventListener('contextmenu', noCtx);
      document.removeEventListener('copy', noCopy);
      document.removeEventListener('cut', noCopy);
      document.removeEventListener('dragstart', noDrag);
      style.remove();
    };
  }, []);
}

/**
 * UKURAN PAS LAYAR (web) + ANTI-ZOOM ala APK:
 *  - paksa meta viewport device-width, skala 1, TIDAK BISA di-zoom/pinch/geser —
 *    layar selalu penuh 1:1 sesuai perangkat (tidak lagi "kekecilan");
 *  - blokir pinch (gesturestart), double-tap zoom, dan Ctrl/Cmd + scroll zoom;
 *  - overscroll-behavior:none → halaman tidak ikut "tertarik"/memantul;
 *  - #root setinggi layar nyata (100dvh) → Story/Call/Media menempel penuh HP.
 */
function useViewportLock() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    try {
      let meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head.appendChild(meta);
      }
      meta.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

      const style = document.createElement('style');
      style.id = 'zeroid-viewport-lock';
      style.textContent = `
        html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden;
          overscroll-behavior:none; touch-action:pan-x pan-y;
          -webkit-tap-highlight-color:transparent; -webkit-text-size-adjust:100%; }
        #root { width:100%; height:100%; height:100dvh; }
        /* gandakan blokir pinch di level CSS (Safari/iOS) */
        html { -webkit-user-zoom: fixed; }
      `;
      document.head.appendChild(style);

      const prevent = (e: Event) => e.preventDefault();
      // pinch zoom (iOS Safari & Chrome Android)
      document.addEventListener('gesturestart', prevent as EventListener, { passive: false });
      document.addEventListener('gesturechange', prevent as EventListener, { passive: false });
      // double-tap zoom
      let lastTouch = 0;
      const onTouchEnd = (e: TouchEvent) => {
        const now = Date.now();
        if (now - lastTouch < 320) e.preventDefault();
        lastTouch = now;
      };
      document.addEventListener('touchend', onTouchEnd, { passive: false });
      // Ctrl/Cmd + wheel zoom (desktop)
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) e.preventDefault();
      };
      document.addEventListener('wheel', onWheel, { passive: false });
      // keyboard zoom (desktop): +, -, Ctrl+0
      const onKey = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault();
      };
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('gesturestart', prevent as EventListener);
        document.removeEventListener('gesturechange', prevent as EventListener);
        document.removeEventListener('touchend', onTouchEnd);
        document.removeEventListener('wheel', onWheel);
        document.removeEventListener('keydown', onKey);
        style.remove();
      };
    } catch { /* lama: biarkan default */ }
  }, []);
}

function useNotificationResponses(ready: boolean) {
  useEffect(() => {
    if (Platform.OS === 'web' || !ready) return;
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
      const data = resp.notification.request.content.data as Record<string, string>;
      const action = resp.actionIdentifier;
      if (data?.callId) {
        if (action === 'DECLINE') declineCall(data.callId);
        else {
          acceptCall(data.callId);
          navRef.navigate?.('Call', { callId: data.callId });
        }
        return;
      }
      if (data?.chatId) {
        if (action === 'REPLY' && (resp as any).userText) {
          void sendMessage(data.chatId, { text: (resp as any).userText });
          return;
        }
        if (action === 'MARK_READ') {
          markRead(data.chatId);
          return;
        }
        navRef.navigate?.('ChatRoom', { chatId: data.chatId });
      }
    });
    return () => sub.remove();
  }, [ready]);
}

/** Shown when EXPO_PUBLIC_FIREBASE_* env vars are missing — no demo mode exists. */
function ConfigScreen() {
  const t = useTheme();
  const steps = [
    'Salin .env.example menjadi .env di root project.',
    'Buka Firebase console → Project settings → General → Your apps → Web app.',
    'Salin nilai apiKey, authDomain, storageBucket, messagingSenderId, appId ke .env.',
    'Jalankan npm install, lalu npx expo start --web (atau deploy ke Vercel).',
  ];
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 28 }}>
      <View style={{ width: '100%', maxWidth: 520, gap: 16, alignItems: 'center' }}>
        <ZeroidLogo size={76} />
        <T v="h2" style={{ textAlign: 'center' }}>Konfigurasi dibutuhkan</T>
        <T v="sub" style={{ textAlign: 'center' }}>
          Zeroid WhatsApp terhubung langsung ke Firebase (Authentication, Firestore, Storage).
          Tidak ada mode demo — semua data tersimpan aman di cloud.
        </T>
        <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 6 }}>
          {steps.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: t.bg, borderRadius: R.md, padding: 14, boxShadow: t.raisedSm } as any}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <T v="caption" color="#fff" style={{ fontWeight: '800' }}>{i + 1}</T>
              </View>
              <T v="sub" style={{ flex: 1, lineHeight: 20 }}>{s}</T>
            </View>
          ))}
        </View>
        <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
          Panduan lengkap: docs/FIREBASE_SETUP.md · Deployment: docs/DEPLOYMENT.md
        </T>
      </View>
    </View>
  );
}

function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { me, config } = useStore();
  const t = useTheme();
  const isStaff = me && ['admin', 'developer', 'moderator'].includes(me.role);
  if (!config?.maintenance?.enabled || isStaff) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 32, gap: 16 }}>
      <ZeroidLogo size={64} />
      <T v="h2">Pemeliharaan</T>
      <T v="sub" style={{ textAlign: 'center', maxWidth: 380 }}>{config.maintenance.message ?? 'Sedang dalam pemeliharaan. Segera kembali.'}</T>
    </View>
  );
}

/**
 * Kunci perangkat saat ban aktif — TAMPIL SEBELUM login: membuat akun baru /
 * ganti akun / login Google TIDAK membantu sampai masa blokir selesai.
 * SATU-SATUNYA pengecualian: Gmail yang dibanned sendiri tetap bisa masuk
 * (lihat info ban + tulis banding ke developer) — tombol khusus tersedia,
 * dan gerbang login hanya meloloskan email itu.
 * (Ban evasion guard — sesuai aturan moderasi Zeroid.)
 */
function DeviceBanGate({ children }: { children: React.ReactNode }) {
  const { deviceBan, ready, me } = useStore();
  const t = useTheme();
  const [, force] = React.useState(0);
  const [escape, setEscape] = React.useState(false); // tombol "masuk akun yang diblokir"
  React.useEffect(() => {
    if (!deviceBan) return;
    const iv = setInterval(() => force((x) => x + 1), 1000); // hitung mundur hidup
    return () => clearInterval(iv);
  }, [deviceBan?.until]);
  // FIX v20 "unban tapi masih diblokir": recheck TANPA cache ke gerbang server
  // segera saat layar muncul + tiap 15 detik. Begitu admin membuka ban,
  // kunci terangkat dan aplikasi langsung terbuka — tanpa reload, tanpa menunggu.
  React.useEffect(() => {
    if (!deviceBan) return;
    let alive = true;
    const run = () => recheckDeviceBan().catch(() => {});
    run();
    const iv = setInterval(() => { if (alive) run(); }, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);
  // akun yang dibanned sendiri boleh lewat → BannedScreen tampil (info + banding)
  const ownAccount = !!me && (!!deviceBan && (me.email ?? '').toLowerCase() === (deviceBan.ownEmail ?? '').toLowerCase());
  if (!deviceBan || !ready || ownAccount || (escape && !me)) return <>{children}</>;
  const left = deviceBan.until > 0 ? Math.max(0, deviceBan.until - Date.now()) : 0;
  const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000), m = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
  const cd = deviceBan.until > 0 ? (d > 0 ? `${d} hari ${h} jam` : h > 0 ? `${h} jam ${m} menit` : `${m} menit ${s} detik`) : '';
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 30, gap: 14 }}>
      {/* v22 ikon larangan SVG bergaya baru (gradasi + glow) — bukan ikon datar */}
      <BanGlyph size={104} />
      <T v="h1" style={{ textAlign: 'center' }}>Perangkat ini diblokir</T>
      <T v="sub" style={{ textAlign: 'center', maxWidth: 400 }}>
        {deviceBan.reason ?? 'Tercatat pada akun yang diblokir admin.'} Membuat akun baru atau ganti akun TIDAK akan membantu — tidak ada celah akun baru di perangkat/IP ini.
      </T>
      {deviceBan.until > 0 ? (
        <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
          <T v="h2" color={t.danger} style={{ fontVariant: ['tabular-nums'] }}>{cd}</T>
          <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>sisa waktu blokir — otomatis terbuka saat habis</T>
        </View>
      ) : (
        <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
          <T v="h2" color={t.danger} style={{ textAlign: 'center' }}>Blokir permanen</T>
          <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>hanya admin yang bisa membuka blokir ini — kalau sudah dibuka, layar ini hilang sendiri (cek otomatis tiap 15 detik)</T>
        </View>
      )}
      {!!deviceBan.ownEmail && (
        <Btn title={`Saya pemilik akun yang diblokir (${deviceBan.ownEmail})`} icon="log-in" variant="ghost" onPress={() => setEscape(true)} />
      )}
      <T v="caption" color={t.faint} style={{ textAlign: 'center', maxWidth: 380 }}>
        {deviceBan.ownEmail
          ? `Hanya ${deviceBan.ownEmail} yang bisa masuk di sini untuk melihat info blokir & mengirim banding ke developer.`
          : 'Jika merasa ada kekeliruan, hubungi developer melalui WhatsApp resmi Zeroid.'}
      </T>
    </View>
  );
}

/**
 * v22 LAYAR GALAT BOOT — tidak ada lagi loading tanpa batas: kalau aplikasi
 * belum siap juga setelah 12 detik (internet mati / jaringan menggantung /
 * Firebase tak terjangkau), tampilkan layar jelas dengan tombol COBA LAGI.
 */
function BootError({ onRetry }: { onRetry: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 30, gap: 16 }}>
      <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,159,28,0.14)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="cloud-offline" size={44} color={t.warning} />
      </View>
      <T v="h2" style={{ textAlign: 'center' }}>Aplikasi lambat merespons</T>
      <T v="sub" style={{ textAlign: 'center', maxWidth: 380 }}>
        Koneksi ke server tidak terjangkau. Periksa internet kamu (Wi-Fi/kuota), lalu coba lagi —
        data tidak hilang, akun tetap aman.
      </T>
      <Btn title="Coba lagi" icon="refresh" variant="primary" onPress={onRetry} style={{ minWidth: 220 }} />
      <T v="caption" color={t.faint} style={{ textAlign: 'center' }}>
        Masih gagal? Nyalakan ulang aplikasi atau periksa jaringan kamu.
      </T>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });
  const { ready, me, locked, config } = useStore();
  const t = useTheme();
  const tokenFor = useRef<string | null>(null);
  const [dismissedNotices, setDismissedNotices] = useState<string[]>([]);
  const [bootStuck, setBootStuck] = useState(false);
  const [, forceBoot] = useState(0);
  const onNavStateChange = useWebHistorySync();
  useAntiCopy();
  useViewportLock();

  // v22 ANTI-MACET SPLASH: setelah 12 detik belum siap → splash DITUTUP PAKSA
  // dan layar galat dengan tombol coba lagi tampil (tidak ada loading abadi).
  useEffect(() => {
    const tm = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
      setBootStuck(true);
    }, 12000);
    return () => clearTimeout(tm);
  }, []);

  /** dipanggil setiap navigasi: sinkronkan history web + publikasikan route aktif */
  const handleNavStateChange = useCallback(() => {
    onNavStateChange();
    try {
      const st = nav.getState();
      const name = st?.routes?.[st.index ?? (st.routes.length - 1)]?.name as string | undefined;
      setActiveRouteName(name);
    } catch {
      setActiveRouteName(undefined);
    }
  }, [onNavStateChange]);

  useEffect(() => {
    initStore();
    setupNotifications();
    captureRefFromUrl(); // web: simpan ?ref=CODE dari link ajakan teman
    // LAPORAN GALAT TERAKHIR (anti force close v20): kalau sesi sebelumnya
    // menabrak galat fatal, tampilkan alasannya sebagai banner — pemakai cukup
    // screenshot & kirim ke developer; tidak ada lagi "tiba-tiba tutup sendiri"
    // tanpa petunjuk sama sekali.
    if (Platform.OS !== 'web') {
      import('@react-native-async-storage/async-storage').then(async (AS: any) => {
        const last = await (AS.default ?? AS).getItem('zeroid-last-crash').catch(() => null);
        if (!last) return;
        (AS.default ?? AS).removeItem('zeroid-last-crash').catch(() => {});
        const [stamp, kind, head, stackPart] = last.split('|');
        pushBanner({
          title: `Laporan galat ${kind === 'FATAL' ? 'fatal' : ''} sesi lalu`,
          body: `${(head ?? last).slice(0, 160)}${stackPart ? ' — buka Saya → Bantuan untuk detail & kirim ke developer' : ''}`,
          icon: 'alert',
        });
      }).catch(() => {});
    }
    // MUSIK & PANGGILAN TETAP NYALA DI LATAR BELAKANG (native/Android):
    // tanpa shouldPlayInBackground, expo-audio mematikan pemutaran begitu
    // keluar layar / lock screen. Web tidak terpengaruh (aman dipanggil native saja).
    if (Platform.OS !== 'web') {
      import('expo-audio').then(({ setAudioModeAsync }) =>
        setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'doNotMix' } as any).catch(() => {})
      ).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (ready && fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [ready, fontsLoaded]);

  useEffect(() => {
    if (me && tokenFor.current !== me.id) {
      tokenFor.current = me.id;
      // notifikasi luar app: web → token browser FCM; native → token expo-notifications
      registerWebFcm(me.id);
      registerPushToken(me.id);
    }
  }, [me?.id]);

  useNotificationResponses(ready);

  if (!fontsLoaded || !ready) {
    if (bootStuck) {
      return (
        <BootError
          onRetry={() => {
            setBootStuck(false);
            forceBoot((x) => x + 1);
            if (Platform.OS === 'web') window.location.reload();
            else initStore(); // auth listener sudah terpasang → sesi tersimpan diteruskan
          }}
        />
      );
    }
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9EDF3' }}>
        <ActivityIndicator color="#1E6BFF" />
      </View>
    );
  }

  const navTheme = {
    ...(t.dark ? DarkTheme : DefaultTheme),
    colors: { ...(t.dark ? DarkTheme : DefaultTheme).colors, background: t.bg, card: t.bg, primary: t.accent, text: t.text, border: 'transparent' },
  };

  const activeAnnouncement = config && !isFirebaseConfigured ? null : null; // announcements render inside Hosts
  void activeAnnouncement;

  return (
    <ErrorBoundary>
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={nav} theme={navTheme} onStateChange={handleNavStateChange} documentTitle={{ formatter: () => 'Zeroid WhatsApp' }}>
          <DeviceBanGate>
          <MaintenanceGate>
            {!isFirebaseConfigured ? (
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Config" component={ConfigScreen} />
              </Stack.Navigator>
            ) : !me ? (
              <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: t.bg } }}>
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Register" component={RegisterScreen} />
                <Stack.Screen name="Forgot" component={ForgotScreen} />
              </Stack.Navigator>
            ) : bannedNow(me) ? (
              <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
                <Stack.Screen name="Banned">{() => <BannedScreen me={me} appeal={myAppeal(me.id)} />}</Stack.Screen>
              </Stack.Navigator>
            ) : !me.verified ? (
              <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
                <Stack.Screen name="Verify" component={VerifyEmailScreen} />
              </Stack.Navigator>
            ) : locked ? (
              <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
                <Stack.Screen name="Lock" component={LockScreen} />
              </Stack.Navigator>
            ) : !me.username ? (
              <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
                <Stack.Screen name="SetUsername" component={SetUsernameScreen} />
              </Stack.Navigator>
            ) : (
              <>
                <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: t.bg } }}>
                  <Stack.Screen name="Main" component={MainScreen} />
                  <Stack.Screen name="ChatRoom" component={ChatRoom} />
                  <Stack.Screen name="ChatInfo" component={ChatInfo} />
                  <Stack.Screen name="NewChat" component={NewChat} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="NewGroup" component={NewGroup} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="Call" component={CallScreen} options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
                  <Stack.Screen name="StoryViewer" component={StoryViewer} options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
                  <Stack.Screen name="StoryCreate" component={StoryCreate} options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
                  <Stack.Screen name="MediaViewer" component={MediaViewer} options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
                  <Stack.Screen name="EditProfile" component={EditProfile} />
                  <Stack.Screen name="ChatBubbles" component={ChatBubblesScreen} />
                  <Stack.Screen name="Wallpaper" component={WallpaperScreen} />
                  <Stack.Screen name="Feedback" component={FeedbackScreen} />
                  <Stack.Screen name="Privacy" component={PrivacyScreen} />
                  <Stack.Screen name="NotifSettings" component={NotifSettings} />
                  <Stack.Screen name="Permissions" component={PermissionsScreen} />
                  <Stack.Screen name="Notifications" component={NotificationsScreen} />
                  <Stack.Screen name="Starred" component={StarredScreen} />
                  <Stack.Screen name="Search" component={SearchScreen} />
                  <Stack.Screen name="Audit" component={AuditScreen} />
                  <Stack.Screen name="Admin" component={AdminScreen} />
                  <Stack.Screen name="ApiStatus" component={ApiStatus} />
                  <Stack.Screen name="UserProfile" component={UserProfile} />
                  <Stack.Screen name="Premium" component={PremiumScreen} />
                  <Stack.Screen name="Security" component={SecurityScreen} />
                  <Stack.Screen name="Music" component={MusicScreen} />
                  <Stack.Screen name="Anime" component={AnimeScreen} />
                  <Stack.Screen name="AnimeDetail" component={AnimeDetailScreen} />
                  <Stack.Screen name="AnimeWatch" component={AnimeWatchScreen} />
                  <Stack.Screen name="Stickers" component={StickersScreen} />
                  <Stack.Screen name="Rewards" component={RewardsScreen} />
                  <Stack.Screen name="Leaderboard" component={LeaderboardScreen} />
                </Stack.Navigator>
                <AnnouncementBanner dismissed={dismissedNotices} onDismiss={(id) => setDismissedNotices((x) => [...x, id])} />
                <MusicBar />
                <VoiceBar />
                <CallBar />
              </>
            )}
          </MaintenanceGate>
          </DeviceBanGate>
          {me && !locked && isFirebaseConfigured && <IncomingCallHost />}
          <PermissionHost />
          <BannerHost />
          <DevGuard />
          <InstallBanner />
          <StatusBar style={t.dark ? 'light' : 'dark'} />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
