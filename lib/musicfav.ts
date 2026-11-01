/**
 * ZEROID MUSIC — FAVORIT (v26).
 * Disimpan di STORAGE HP SENDIRI (AsyncStorage) sesuai permintaan: daftar lagu
 * yang disukai tersimpan di perangkat, tidak butuh server, instan & privat.
 */
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MusicSong } from './music';

const KEY = 'zeroid_music_favs_v1';

let favs: MusicSong[] = [];
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribeFavs(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
export const getFavs = () => favs;
export function useMusicFavs(): MusicSong[] {
  return useSyncExternalStore(subscribeFavs, getFavs, getFavs);
}

/** Muat sekali dari storage HP — dipanggil MusicScreen saat mount. */
export async function loadFavs(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr)) favs = arr.filter((s: any) => s && s.videoId && s.title).slice(0, 500);
  } catch { /* storage rusak → mulai kosong */ }
  emit();
}

export const isFav = (videoId: string) => favs.some((s) => s.videoId === videoId);

/** Tambah/hapus favorit → true = sekarang favorit. Tersimpan langsung ke HP. */
export async function toggleFav(song: MusicSong): Promise<boolean> {
  const exists = isFav(song.videoId);
  favs = exists ? favs.filter((s) => s.videoId !== song.videoId) : [{ ...song }, ...favs].slice(0, 500);
  emit();
  try { await AsyncStorage.setItem(KEY, JSON.stringify(favs)); } catch { /* penuh → biar situ */ }
  return !exists;
}

/** Hapus satu favorit (tap panjang). */
export async function removeFav(videoId: string): Promise<void> {
  favs = favs.filter((s) => s.videoId !== videoId);
  emit();
  try { await AsyncStorage.setItem(KEY, JSON.stringify(favs)); } catch { /* noop */ }
}
