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

import { useStore, initStore, acceptCall, declineCall, sendMessage, markRead, adminEndAnnouncement, bannedNow, myAppeal } from './lib/store';
import { useTheme, R } from './lib/theme';
import { navRef, setActiveRouteName } from './lib/bus';
import { setupNotifications, registerPushToken } from './lib/notify';
import { registerWebFcm } from './lib/fcm';
import { isFirebaseConfigured } from './lib/firebase';
import { ZeroidLogo, Icon } from './lib/icons';
import { T } from './components/ui';
import { BannerHost, PermissionHost, IncomingCallHost, AnnouncementBanner, InstallBanner } from './components/Hosts';
import MusicBar from './components/MusicBar';
import ErrorBoundary from './components/ErrorBoundary';
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
import SearchScreen from './screens/SearchScreen';
import AuditScreen from './screens/AuditScreen';

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

export default function App() {
  const [fontsLoaded] = useFonts({ ...Ionicons.font });
  const { ready, me, locked, config } = useStore();
  const t = useTheme();
  const tokenFor = useRef<string | null>(null);
  const [dismissedNotices, setDismissedNotices] = useState<string[]>([]);
  const onNavStateChange = useWebHistorySync();
  useAntiCopy();

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
                </Stack.Navigator>
                <AnnouncementBanner dismissed={dismissedNotices} onDismiss={(id) => setDismissedNotices((x) => [...x, id])} />
                <MusicBar />
              </>
            )}
          </MaintenanceGate>
          {me && !locked && isFirebaseConfigured && <IncomingCallHost />}
          <PermissionHost />
          <BannerHost />
          <InstallBanner />
          <StatusBar style={t.dark ? 'light' : 'dark'} />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
