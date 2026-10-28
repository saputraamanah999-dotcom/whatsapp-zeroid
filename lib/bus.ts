import { useSyncExternalStore } from 'react';

export type Banner = { id: string; title: string; body: string; icon?: string; avatar?: string | null; color?: string; onPress?: () => void };

let banners: Banner[] = [];
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
const sub = (l: () => void) => {
  ls.add(l);
  return () => ls.delete(l);
};

export function pushBanner(b: Omit<Banner, 'id'>) {
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
