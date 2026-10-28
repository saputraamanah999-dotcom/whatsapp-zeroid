import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { firebase, COLLECTIONS } from './firebase';

export const CHANNELS = {
  messages: 'messages',
  groups: 'groups',
  stories: 'stories',
  calls: 'calls',
} as const;

let setupDone = false;

/** Creates Android notification channels + actionable categories (incoming call / reply). */
export async function setupNotifications() {
  if (setupDone || Platform.OS === 'web') return;
  setupDone = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNELS.messages, {
        name: 'Pesan',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 120, 200],
        lightColor: '#1E6BFF',
      });
      await Notifications.setNotificationChannelAsync(CHANNELS.groups, { name: 'Grup', importance: Notifications.AndroidImportance.HIGH });
      await Notifications.setNotificationChannelAsync(CHANNELS.stories, { name: 'Story', importance: Notifications.AndroidImportance.DEFAULT });
      await Notifications.setNotificationChannelAsync(CHANNELS.calls, {
        name: 'Panggilan masuk',
        importance: Notifications.AndroidImportance.MAX,
        bypassDnd: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        vibrationPattern: [0, 1000, 800, 1000, 800, 1000],
        enableVibrate: true,
      });
    }
    await Notifications.setNotificationCategoryAsync('incoming_call', [
      { identifier: 'ACCEPT', buttonTitle: 'Terima', options: { opensAppToForeground: true } },
      { identifier: 'DECLINE', buttonTitle: 'Tolak', options: { opensAppToForeground: false, isDestructive: true } },
    ]);
    await Notifications.setNotificationCategoryAsync('message', [
      { identifier: 'REPLY', buttonTitle: 'Balas', textInput: { submitButtonTitle: 'Kirim', placeholder: 'Ketik balasan…' } },
      { identifier: 'MARK_READ', buttonTitle: 'Tandai dibaca', options: { opensAppToForeground: false } },
    ]);
  } catch (e) {
    console.warn('notif setup', e);
  }
}

export async function presentLocal(opts: {
  title: string;
  body: string;
  channel: keyof typeof CHANNELS;
  data?: Record<string, string>;
  category?: 'incoming_call' | 'message';
}) {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(opts.title, { body: opts.body, icon: '/favicon.ico', tag: opts.data?.chatId ?? opts.data?.callId });
      }
    } catch {}
    return;
  }
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: opts.title,
        body: opts.body,
        data: opts.data ?? {},
        categoryIdentifier: opts.category,
        sound: true,
        priority: opts.channel === 'calls' ? Notifications.AndroidNotificationPriority.MAX : Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: Platform.OS === 'android' ? { channelId: CHANNELS[opts.channel] } : null,
    });
  } catch (e) {
    console.warn('presentLocal', e);
  }
}

/** Registers the native FCM token in Firestore so Cloud Functions can push messages / incoming calls. */
export async function registerPushToken(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return null;
    const token = await Notifications.getDevicePushTokenAsync();
    const tok = String(token.data);
    const fb = firebase();
    if (fb) {
      await setDoc(doc(fb.db, COLLECTIONS.fcmTokens, userId), { token: tok, platform: Platform.OS, updatedAt: Date.now() }, { merge: true });
    }
    // daftarkan ke topic FCM user + all lewat server kita (FCM_SERVER_KEY di sana)
    import('./fcm').then(({ proxySubscribeNative }) => proxySubscribeNative(tok, userId)).catch(() => {});
    return tok;
  } catch (e) {
    console.warn('push token', e);
    return null;
  }
}
