import { Linking, Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';

export type PermKind = 'camera' | 'microphone' | 'notifications' | 'media';
export type PermState = 'granted' | 'denied' | 'blocked' | 'undetermined' | 'unavailable';

export const PERM_INFO: Record<PermKind, { title: string; icon: string; why: string; android: string }> = {
  camera: { title: 'Kamera', icon: 'camera', why: 'Untuk video call, memotret foto, dan membuat Story.', android: 'android.permission.CAMERA' },
  microphone: { title: 'Mikrofon', icon: 'mic', why: 'Untuk voice note, voice call, dan video call.', android: 'android.permission.RECORD_AUDIO' },
  notifications: { title: 'Notifikasi', icon: 'notifications', why: 'Agar kamu tahu ada pesan baru, Story, dan panggilan masuk walau aplikasi tertutup.', android: 'android.permission.POST_NOTIFICATIONS' },
  media: { title: 'Foto & Video', icon: 'images', why: 'Untuk mengirim foto, video, dan mengganti foto profil.', android: 'android.permission.READ_MEDIA_IMAGES / READ_MEDIA_VIDEO' },
};

// ---------- rationale dialog store (rendered by <PermissionHost/>) ----------
type Pending = { kind: PermKind; blocked: boolean; resolve: (ok: boolean) => void } | null;
let pending: Pending = null;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
export function usePendingPermission() {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => pending,
    () => pending
  );
}
export function resolvePending(ok: boolean) {
  const p = pending;
  pending = null;
  emit();
  p?.resolve(ok);
}
function askRationale(kind: PermKind, blocked: boolean) {
  return new Promise<boolean>((resolve) => {
    pending = { kind, blocked, resolve };
    emit();
  });
}

// ---------- status / request per platform ----------
const map = (granted: boolean, canAskAgain: boolean, status: string): PermState =>
  granted ? 'granted' : status === 'undetermined' ? 'undetermined' : canAskAgain ? 'denied' : 'blocked';

async function webMedia(kind: 'camera' | 'microphone', request: boolean): Promise<PermState> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return 'unavailable';
  try {
    const q = await (navigator as any).permissions?.query({ name: kind });
    if (q?.state === 'granted') return 'granted';
    if (q?.state === 'denied') return 'blocked';
  } catch {}
  if (!request) return 'undetermined';
  try {
    const s = await navigator.mediaDevices.getUserMedia(kind === 'camera' ? { video: true } : { audio: true });
    s.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch {
    return 'blocked';
  }
}

export async function getPermission(kind: PermKind): Promise<PermState> {
  try {
    if (Platform.OS === 'web') {
      if (kind === 'camera' || kind === 'microphone') return webMedia(kind, false);
      if (kind === 'notifications') {
        if (typeof window === 'undefined' || !('Notification' in window)) return 'unavailable';
        return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'blocked' : 'undetermined';
      }
      return 'granted';
    }
    if (kind === 'camera') {
      const r = await ImagePicker.getCameraPermissionsAsync();
      return map(r.granted, r.canAskAgain, r.status);
    }
    if (kind === 'microphone') {
      const r = await getRecordingPermissionsAsync();
      return map(r.granted, r.canAskAgain, r.status);
    }
    if (kind === 'notifications') {
      const r = await Notifications.getPermissionsAsync();
      return map(r.granted, r.canAskAgain, r.status);
    }
    const r = await ImagePicker.getMediaLibraryPermissionsAsync();
    return map(r.granted, r.canAskAgain, r.status);
  } catch {
    return 'unavailable';
  }
}

async function systemRequest(kind: PermKind): Promise<PermState> {
  if (Platform.OS === 'web') {
    if (kind === 'camera' || kind === 'microphone') return webMedia(kind, true);
    if (kind === 'notifications') {
      if (!('Notification' in window)) return 'unavailable';
      const r = await Notification.requestPermission();
      return r === 'granted' ? 'granted' : 'blocked';
    }
    return 'granted';
  }
  if (kind === 'camera') {
    const r = await ImagePicker.requestCameraPermissionsAsync();
    return map(r.granted, r.canAskAgain, r.status);
  }
  if (kind === 'microphone') {
    const r = await requestRecordingPermissionsAsync();
    return map(r.granted, r.canAskAgain, r.status);
  }
  if (kind === 'notifications') {
    const r = await Notifications.requestPermissionsAsync({ android: {}, ios: { allowAlert: true, allowBadge: true, allowSound: true } });
    return map(r.granted, r.canAskAgain, r.status);
  }
  const r = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return map(r.granted, r.canAskAgain, r.status);
}

/**
 * Permission Manager: shows an in-app rationale first (Android guideline),
 * then the system runtime popup. If permanently denied, offers to open Settings.
 */
export async function ensurePermission(kind: PermKind): Promise<boolean> {
  const cur = await getPermission(kind);
  if (cur === 'granted') return true;
  if (cur === 'unavailable') return kind === 'media';
  const proceed = await askRationale(kind, cur === 'blocked' && Platform.OS !== 'web');
  if (!proceed) return false;
  if (cur === 'blocked' && Platform.OS !== 'web') {
    Linking.openSettings().catch(() => {});
    return false;
  }
  const r = await systemRequest(kind);
  return r === 'granted';
}

export async function ensureAll(kinds: PermKind[]) {
  for (const k of kinds) {
    const ok = await ensurePermission(k);
    if (!ok) return false;
  }
  return true;
}

export const openAppSettings = () => Linking.openSettings().catch(() => {});
