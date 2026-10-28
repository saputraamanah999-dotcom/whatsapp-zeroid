import React, { useEffect, useMemo, useRef } from 'react';
import { Modal, Pressable, View, ViewStyle, Platform, Vibration } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import Animated, { FadeInUp, FadeOutUp, FadeInDown, FadeOutDown, useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useBanners, dismissBanner, navRef, useActiveRouteName } from '../lib/bus';
import { usePendingPermission, resolvePending, PERM_INFO } from '../lib/permissions';
import { useStore, incomingCallFor, acceptCall, declineCall, adminEndAnnouncement } from '../lib/store';
import { useTheme, R } from '../lib/theme';
import { T, Avatar, Btn, Neu } from './ui';
import { Icon } from '../lib/icons';

export function BannerHost() {
  const banners = useBanners();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  if (!banners.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, gap: 8, zIndex: 999 }}>
      {banners.map((b) => (
        <Animated.View key={b.id} entering={FadeInUp.springify().damping(16)} exiting={FadeOutUp.duration(200)}>
          <Pressable
            onPress={() => {
              dismissBanner(b.id);
              b.onPress?.();
            }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: R.lg, backgroundColor: t.dark ? 'rgba(34,40,51,0.97)' : 'rgba(246,248,251,0.97)', boxShadow: '0px 12px 30px rgba(15,23,42,0.18)', maxWidth: 520, alignSelf: 'center', width: '100%' } as ViewStyle}
          >
            {b.avatar !== undefined && b.avatar !== null ? (
              <Avatar uri={b.avatar} name={b.title} size={40} color={b.color} />
            ) : (
          <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={(b.icon as any) ?? 'chatbubble'} size={20} color="#fff" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <T v="h3" numberOfLines={1} style={{ fontSize: 15 }}>
                {b.title}
              </T>
              <T v="sub" numberOfLines={2}>
                {b.body}
              </T>
            </View>
            <T v="caption" color={t.faint}>
              sekarang
            </T>
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}

export function PermissionHost() {
  const p = usePendingPermission();
  const t = useTheme();
  if (!p) return null;
  const info = PERM_INFO[p.kind];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => resolvePending(false)}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 26 }}>
        <View style={{ width: '100%', maxWidth: 380, backgroundColor: t.bg, borderRadius: R.xl, padding: 26, alignItems: 'center', boxShadow: '0px 20px 40px rgba(0,0,0,0.25)' } as ViewStyle}>
          <Neu radius={36} style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name={info.icon as any} size={32} color={t.accent} />
          </Neu>
          <T v="h3" style={{ fontSize: 19, textAlign: 'center' }}>
            Izinkan akses {info.title}
          </T>
          <T v="sub" style={{ textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
            {info.why}
          </T>
          {p.blocked && (
            <T v="caption" color={t.warning} style={{ textAlign: 'center', marginTop: 10 }}>
              Izin ini ditolak permanen. Buka Pengaturan → Izin untuk mengaktifkannya.
            </T>
          )}
          <T v="caption" color={t.faint} style={{ marginTop: 10, textAlign: 'center' }}>
            {info.android}
          </T>
          <View style={{ width: '100%', gap: 12, marginTop: 20 }}>
            <Btn title={p.blocked ? 'Buka Pengaturan' : 'Lanjutkan'} onPress={() => resolvePending(true)} />
            <Btn title="Nanti saja" variant="ghost" onPress={() => resolvePending(false)} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Pulse({ color }: { color: string }) {
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = withRepeat(withSequence(withTiming(1.35, { duration: 900, easing: Easing.out(Easing.quad) }), withTiming(1, { duration: 0 })), -1);
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: 2 - s.value * 1.4 }));
  return <Animated.View style={[{ position: 'absolute', width: 150, height: 150, borderRadius: 75, backgroundColor: color }, st]} />;
}

/** Full-screen incoming call UI (in-app counterpart of the FCM full-screen-intent notification). */
export function IncomingCallHost() {
  const { db, me } = useStore();
  const t = useTheme();
  const call = me ? incomingCallFor(me.id, db) : undefined;
  const ringing = useRef(false);
  // looped ringtone (bundled asset; web falls back to the same bundled URI)
  const ringSource = useMemo(() => require('../assets/ringtone.wav'), []);
  const player = useAudioPlayer(ringSource);
  useEffect(() => {
    if (call && !ringing.current) {
      ringing.current = true;
      if (Platform.OS !== 'web') Vibration.vibrate([0, 800, 600], true);
      try {
        player.loop = true;
        player.volume = 0.9;
        player.seekTo(0);
        player.play();
      } catch {}
    }
    if (!call && ringing.current) {
      ringing.current = false;
      if (Platform.OS !== 'web') Vibration.cancel();
      try {
        player.loop = false;
        player.pause();
      } catch {}
    }
  }, [call?.id]);
  if (!call || !me) return null;
  const caller = db.users[call.callerId];
  const chat = db.chats[call.chatId];
  const isGroup = chat?.type === 'group';
  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => declineCall(call.id)}>
      <View style={{ flex: 1, backgroundColor: t.dark ? '#121722' : '#E4E9F1', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 80, paddingHorizontal: 30 }}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="lock-closed" size={12} color={t.sub} />
            <T v="caption">Terenkripsi end-to-end · Zeroid</T>
          </View>
          <T v="sub" style={{ marginTop: 8 }}>
            {call.video ? 'Panggilan video masuk' : 'Panggilan suara masuk'}
            {isGroup ? ` · ${chat.name}` : ''}
          </T>
        </View>
        <View style={{ alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center', width: 170, height: 170 }}>
            <Pulse color={t.accentSoft} />
            <Avatar uri={caller?.avatar} name={caller?.name ?? '?'} color={caller?.color} size={130} />
          </View>
          <T v="h1" style={{ textAlign: 'center' }}>
            {caller?.name}
          </T>
          <T v="sub">Berdering…</T>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', width: '100%', maxWidth: 360 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => declineCall(call.id)} style={({ pressed }) => ({ width: 74, height: 74, borderRadius: 37, backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }], boxShadow: '0px 10px 24px rgba(255,59,92,0.45)' } as ViewStyle)}>
              <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
            <T v="sub">Tolak</T>
          </View>
          <View style={{ alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={() => {
                acceptCall(call.id);
                navRef.navigate?.('Call', { callId: call.id });
              }}
              style={({ pressed }) => ({ width: 74, height: 74, borderRadius: 37, backgroundColor: t.success, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.94 : 1 }], boxShadow: '0px 10px 24px rgba(20,196,122,0.45)' } as ViewStyle)}
            >
              <Ionicons name={call.video ? 'videocam' : 'call'} size={32} color="#fff" />
            </Pressable>
            <T v="sub">Terima</T>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------- Admin announcement banner (top of app) ----------------
export function AnnouncementBanner({ dismissed, onDismiss }: { dismissed: string[]; onDismiss: (id: string) => void }) {
  const { db, me } = useStore();
  const t = useTheme();
  const now = Date.now();
  const active = (db.announcements ?? [])
    .filter((a) => a.activeUntil > now && !dismissed.includes(a.id))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!active || !me) return null;
  const canManage = me.role === 'admin' || me.role === 'developer';
  const levelColor = active.level === 'critical' ? t.danger : active.level === 'warning' ? t.warning : t.accent;
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOutDown.duration(180)} pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 998 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: levelColor }}>
        <Icon name="megaphone" size={18} color="#fff" />
        <View style={{ flex: 1 }}>
          <T v="caption" color="#fff" style={{ fontWeight: '800' }} numberOfLines={1}>{active.title}</T>
          <T v="caption" color="rgba(255,255,255,0.92)" numberOfLines={2}>{active.body}</T>
        </View>
        <Pressable onPress={() => onDismiss(active.id)} hitSlop={12} accessibilityLabel="Tutup pengumuman">
          <Icon name="x" size={18} color="#fff" />
        </Pressable>
        {canManage && (
          <Pressable onPress={() => adminEndAnnouncement(active.id)} hitSlop={12} accessibilityLabel="Akhiri pengumuman">
            <Icon name="power" size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

// ---------------- PWA install prompt (web only) ----------------
let deferredPrompt: any = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

export function InstallBanner() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [show, setShow] = React.useState(false);
  // Jangan tampil di atas layar auth/lock — banner bisa MENUTUPI tombol Masuk
  // di layar pendek (hp). Hanya tampil setelah benar-benar masuk aplikasi.
  const route = useActiveRouteName();
  const onGateScreen = !route || ['Config', 'Login', 'Register', 'Forgot', 'Verify', 'Banned', 'Lock', 'SetUsername'].includes(route);
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    // standalone check: hide when already installed
    const standalone = (window.navigator as any).standalone || window.matchMedia('(display-mode: standalone)').matches;
    const dismissed = window.sessionStorage.getItem('zeroid-install-dismissed');
    const timer = setTimeout(() => {
      if (deferredPrompt && !standalone && !dismissed) setShow(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, []);
  if (!show || onGateScreen) return null;
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOutDown.duration(180)} style={{ position: 'absolute', bottom: insets.bottom + 70, left: 14, right: 14, zIndex: 997 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: R.lg, backgroundColor: t.dark ? 'rgba(34,40,51,0.97)' : 'rgba(246,248,251,0.98)', boxShadow: '0px 14px 34px rgba(15,23,42,0.22)', maxWidth: 460, alignSelf: 'center', width: '100%' } as ViewStyle}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="download" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <T v="h3" style={{ fontSize: 15 }}>Pasang Zeroid</T>
          <T v="caption">Tambahkan ke layar utama untuk pengalaman penuh</T>
        </View>
        <Btn small title="Pasang" onPress={async () => {
          deferredPrompt?.prompt();
          await deferredPrompt?.userChoice?.catch(() => {});
          deferredPrompt = null;
          setShow(false);
        }} />
        <Pressable onPress={() => (setShow(false), window.sessionStorage.setItem('zeroid-install-dismissed', '1'))} hitSlop={10} accessibilityLabel="Tutup">
          <Ionicons name="close" size={18} color={t.sub} />
        </Pressable>
      </View>
    </Animated.View>
  );
}
