/**
 * VIEW-ONCE LOKAL (ala WhatsApp) — bukti "sudah dibuka 1x" dicatat DI PERANGKAT
 * selain di server (viewedBy). Kalau tulisan server ditolak (rules lama / offline),
 * media TETAP terkunci di perangkat ini — tidak bisa dibuka berkali-kali lagi.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'zeroid-vo-opened';
/** chatId_msgId yang sudah dibuka di perangkat ini */
const opened = new Set<string>();
let hydrated = false;

export function voLocalOpened(chatId: string, msgId: string): boolean {
  return opened.has(`${chatId}_${msgId}`);
}

export async function voMarkOpened(chatId: string, msgId: string): Promise<void> {
  const k = `${chatId}_${msgId}`;
  if (opened.has(k)) return;
  opened.add(k);
  if (!hydrated) { hydrate(); hydrated = true; }
  try {
    if (typeof window !== 'undefined' && (window as any).localStorage) {
      window.localStorage.setItem(KEY, JSON.stringify([...opened].slice(-2000)));
      return;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify([...opened].slice(-2000)));
  } catch { /* penuh / private mode — set memori tetap jalan */ }
}

function hydrate() {
  (async () => {
    try {
      const raw = typeof window !== 'undefined' && (window as any).localStorage
        ? window.localStorage.getItem(KEY)
        : await AsyncStorage.getItem(KEY);
      if (raw) for (const k of JSON.parse(raw) as string[]) opened.add(k);
    } catch { /* abaikan */ }
  })();
}
hydrate();
