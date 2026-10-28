import { useSyncExternalStore } from 'react';

export type Banner = { id: string; title: string; body: string; icon?: string; avatar?: string | null; color?: string; onPress?: () => void };

let banners: Banner[] = [];
let lastPush: { key: string; at: number } | null = null;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
const sub = (l: () => void) => {
  ls.add(l);
  return () => ls.delete(l);
};

export function pushBanner(b: Omit<Banner, 'id'>) {
  // dedupe: saat Firestore/rules error, beberapa listener bisa memicu banner
  // yang sama dalam waktu bersamaan — cukup satu yang tampil.
  const key = `${b.title}::${b.body}`;
  const now = Date.now();
  if (lastPush && lastPush.key === key && now - lastPush.at < 4000) return;
  lastPush = { key, at: now };
  const id = Math.random().toString(36).slice(2);
  banners = [...banners.slice(-2), { ...b, id }];
  emit();
  setTimeout(() => dismissBanner(id), 4200);
}
export function dismissBanner(id: string) {
  banners = banners.filter((b) => b.id !== id);
  emit();
}
export function useBanners() {
  return useSyncExternalStore(sub, () => banners, () => banners);
}

// Currently opened chat (to suppress notifications for the visible conversation)
export let activeChatId: string | null = null;
export function setActiveChat(id: string | null) {
  activeChatId = id;
}

// Navigation hook-in (set by App)
export const navRef: { navigate: ((name: string, params?: object) => void) | null } = { navigate: null };

// ---------------------------------------------------------------------------
// Active route name — dipublish App lewat onStateChange (BUKAN useNavigationState).
// PENTING: useNavigationState akan THROW "Couldn't get the navigation state"
// bila dipanggil di luar navigator (mis. MusicBar yang dipasang di root App)
// dan membuat seluruh aplikasi WHITE SCREEN. Hook aman di bawah ini tidak
// pernah throw — cukup mengembalikan undefined sebelum navigasi siap.
// ---------------------------------------------------------------------------
let activeRouteName: string | undefined;
const routeSubs = new Set<() => void>();
export function setActiveRouteName(n: string | undefined) {
  if (n === activeRouteName) return;
  activeRouteName = n;
  routeSubs.forEach((l) => l());
}
export function getActiveRouteName() {
  return activeRouteName;
}
export function useActiveRouteName(): string | undefined {
  return useSyncExternalStore(
    (l) => {
      routeSubs.add(l);
      return () => routeSubs.delete(l);
    },
    () => activeRouteName,
    () => activeRouteName,
  );
}
