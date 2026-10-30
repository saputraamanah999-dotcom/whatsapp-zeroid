/**
 * PENGATURAN TAMPILAN CHAT:
 *  - ChatBubblesScreen : pilih GAYA BALON (gaya balon ala WhatsApp) — tersimpan di
 *    profil, real-time terlihat oleh semua orang di chat pribadi/grup/global/saluran.
 *  - WallpaperScreen   : WALLPAPER chat (default semua chat / per chat dibuka dari
 *    ChatRoom) + TEMA WARNA chat (warna balon milik + aksen).
 */
import React, { useState } from 'react';
import { View, ScrollView, Pressable, Platform } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoute } from '@react-navigation/native';
import { Header, Screen, T, Card, Btn } from '../components/ui';
import { useStore, updateMe, patchMeLocal } from '../lib/store';
import { pushBanner } from '../lib/bus';
import { useTheme, R } from '../lib/theme';
import { BUBBLE_STYLES, CHAT_THEMES, resolveBubble } from '../lib/bubbles';
import BubbleDecor from '../components/BubbleDecor';
import * as ImagePicker from 'expo-image-picker';
import { uploadMedia } from '../lib/media';

function MiniBubblePreview({ styleId, mine, label }: { styleId: string; mine: boolean; label: string }) {
  const t = useTheme();
  const s = resolveBubble({ styleId, mine, t, dark: t.dark });
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          backgroundColor: s.backgroundColor,
          borderRadius: s.borderRadius,
          borderBottomRightRadius: mine ? s.borderBottomRightRadius : s.borderRadius,
          borderBottomLeftRadius: mine ? s.borderRadius : s.borderBottomLeftRadius,
          borderWidth: s.borderWidth,
          borderColor: s.borderColor,
          opacity: s.opacity,
          paddingHorizontal: 12,
          paddingVertical: 8,
          maxWidth: '100%',
          boxShadow: s.boxShadow,
        } as any}
      >
        {!!s.decor && <BubbleDecor kind={s.decor} bg={s.backgroundColor} mine={mine} />}
        <T v="sub" color={s.color} style={{ fontSize: 12.5 }}>
          {label}
        </T>
      </View>
    </View>
  );
}

export function ChatBubblesScreen() {
  const t = useTheme();
  const { me } = useStore();
  const [saving, setSaving] = useState<string | null>(null);
  const current = me?.bubble ?? 'default';

  const pick = async (id: string) => {
    setSaving(id);
    // TERAPKAN LOKAL DETIK INI (optimis) — dulu harus nunggu Firestore balik,
    // seakan "pencet gak muncul apa-apa". Kalau server gagal, dikembalikan.
    const prev = me?.bubble ?? 'default';
    patchMeLocal({ bubble: id as any });
    const r = await updateMe({ bubble: id as any });
    setSaving(null);
    if (r.ok) pushBanner({ title: 'Gaya balon dipasang', body: 'Semua chatmu sekarang pakai gaya ini — orang lain juga melihatnya real-time.', icon: 'checkmark-circle' });
    else {
      patchMeLocal({ bubble: prev as any });
      pushBanner({ title: 'Gagal menyimpan', body: r.error ?? 'Coba lagi.', icon: 'alert' });
    }
  };

  return (
    <Screen>
      <Header title="Gaya balon obrolan" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 40 }}>
        <T v="sub" color={t.sub}>
          Pilih gaya balon kesukaanmu — langsung dipakai di chat pribadi, grup, obrolan global, dan saluran. Pengguna lain melihat gaya balonmu secara real-time.
        </T>
        {BUBBLE_STYLES.map((s) => {
          const active = (me?.bubble ?? 'default') === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => pick(s.id)}
              disabled={saving !== null}
              style={({ pressed }) => ({
                borderRadius: R.lg,
                padding: 14,
                gap: 10,
                borderWidth: 2,
                borderColor: active ? t.accent : 'transparent',
                backgroundColor: pressed ? t.bg2 : t.bg2,
                opacity: saving && saving !== s.id ? 0.6 : 1,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T v="label" style={{ flex: 1 }}>
                  {s.label}
                </T>
                {active ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.accent }}>
                    <Ionicons name="checkmark" size={13} color="#fff" />
                    <T v="caption" color="#fff" style={{ fontWeight: '800' }}>Aktif</T>
                  </View>
                ) : (
                  !!saving && saving === s.id && <T v="caption" color={t.faint}>menyimpan…</T>
                )}
              </View>
              <View style={{ gap: 8, backgroundColor: t.bg2, borderRadius: R.md, padding: 12 }}>
                <MiniBubblePreview styleId={s.id} mine={false} label="halo, ini gaya balonku 👋" />
                <MiniBubblePreview styleId={s.id} mine label="keren banget dah ✨" />
              </View>
              <T v="caption" color={t.faint}>{s.desc}</T>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

export function WallpaperScreen({ chatId: chatIdProp }: { chatId?: string }) {
  const t = useTheme();
  const { me } = useStore();
  const route = useRoute<any>();
  const chatId = chatIdProp ?? route.params?.chatId;
  const [busy, setBusy] = useState(false);
  const [fxOpen, setFxOpen] = useState(false);
  const wallpapers = me?.wallpapers ?? {};
  const wallpaperFx = me?.wallpaperFx ?? {};
  const scopeKey = chatId ?? 'default';
  const activeWallpaper = wallpapers[scopeKey] ?? null;
  const activeFx = wallpaperFx[scopeKey] ?? null;
  const _opRaw = activeFx?.opacity;
  const activeOpacity = Number.isFinite(Number(_opRaw)) ? Math.min(0.85, Math.max(0.05, Number(_opRaw))) : 0.32;
  const activeTheme = me?.chatTheme ?? 'default';

  const pickWallpaper = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return pushBanner({ title: 'Izin galeri ditolak', body: 'Aktifkan izin galeri untuk memasang wallpaper.', icon: 'alert' });
    // ATUR/CROP: di Android/iOS picker sistem langsung menyediakan POTONG + ZOOM
    // (allowsEditing). Di web crop sistem tidak ada — gambar dipasang utuh lalu
    // bisa diatur OPACITY di bawah.
    const p = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: Platform.OS !== 'web',
    });
    if (p.canceled || !p.assets?.[0]) return;
    setBusy(true);
    try {
      const asset = p.assets[0];
      const r = await uploadMedia(asset.uri, `wallpapers/${me!.id}/${Date.now()}.jpg`, 'image/jpeg');
      const rr = await updateMe({ wallpapers: { ...wallpapers, [scopeKey]: r.url } });
      if (rr.ok) {
        patchMeLocal({ wallpapers: { ...wallpapers, [scopeKey]: r.url } } as any);
        pushBanner({ title: 'Wallpaper terpasang', body: scopeKey === 'default' ? 'Dipakai di semua chat yang belum punya wallpaper sendiri.' : 'Wallpaper khusus chat ini terpasang.', icon: 'image' });
      } else pushBanner({ title: 'Gagal memasang wallpaper', body: rr.error ?? 'Coba lagi.', icon: 'alert' });
    } catch (e: any) {
      pushBanner({ title: 'Gagal memasang wallpaper', body: e?.message ?? 'Coba lagi.', icon: 'alert' });
    } finally {
      setBusy(false);
    }
  };

  const clearWallpaper = async () => {
    const next = { ...wallpapers, [scopeKey]: null };
    const nextFx = { ...wallpaperFx, [scopeKey]: null };
    const r = await updateMe({ wallpapers: next, wallpaperFx: nextFx } as any);
    if (r.ok) patchMeLocal({ wallpapers: next, wallpaperFx: nextFx } as any);
    pushBanner({ title: 'Wallpaper dihapus', body: 'Kembali ke latar standar.', icon: 'trash' });
  };

  /** Geser OPASITAS wallpaper (redup ↔ jelas) — tersimpan per chat/default. */
  const setOpacity = async (op: number) => {
    const nextFx = { ...wallpaperFx, [scopeKey]: { ...(activeFx ?? {}), opacity: op } };
    patchMeLocal({ wallpaperFx: nextFx } as any); // pratinjau real-time di slider
    clearTimeout((setOpacity as any)._t);
    (setOpacity as any)._t = setTimeout(async () => {
      const r = await updateMe({ wallpaperFx: nextFx } as any);
      if (!r.ok) pushBanner({ title: 'Gagal menyimpan efek', body: r.error ?? 'Coba lagi.', icon: 'alert' });
    }, 600);
  };

  return (
    <Screen>
      <Header title="Wallpaper & tema chat" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 40 }}>
        <Card title="Wallpaper">
          <View style={{ gap: 10 }}>
            <View style={{ height: 150, borderRadius: R.md, overflow: 'hidden', backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}>
              {activeWallpaper ? (
                <Image source={{ uri: activeWallpaper }} style={{ width: '100%', height: '100%', opacity: activeOpacity }} contentFit="cover" transition={150} />
              ) : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Ionicons name="image-outline" size={30} color={t.faint} />
                  <T v="caption" color={t.faint}>Belum ada wallpaper {chatId ? 'di chat ini' : 'default'}</T>
                </View>
              )}
              <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <T v="caption" color="#fff" style={{ fontSize: 10 }}>{chatId ? 'khusus chat ini' : 'default semua chat'}</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Btn small icon="image" title="Pilih dari galeri" loading={busy} onPress={pickWallpaper} style={{ flex: 1 }} />
              {!!activeWallpaper && <Btn small variant="neu" icon="color-filter" title={fxOpen ? 'Tutup' : 'Atur'} onPress={() => setFxOpen((v) => !v)} />}
              {!!activeWallpaper && <Btn small variant="neu" icon="trash" title="Hapus" onPress={clearWallpaper} />}
            </View>
            {fxOpen && !!activeWallpaper && (
              <View style={{ gap: 8, backgroundColor: t.bg2, borderRadius: R.md, padding: 12 }}>
                <T v="caption" color={t.sub}>Opasitas — geser: makin kiri makin redup (teks tetap mudah dibaca)</T>
                <View style={{ height: 26, justifyContent: 'center' }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: t.bg, overflow: 'hidden' }}>
                    <View style={{ height: 8, borderRadius: 4, width: `${Math.round(activeOpacity * 100)}%`, backgroundColor: t.accent }} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {[0.15, 0.25, 0.32, 0.45, 0.6].map((v) => (
                    <Pressable
                      key={v}
                      onPress={() => void setOpacity(v)}
                      style={({ pressed }) => ({
                        flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 10,
                        backgroundColor: Math.abs(activeOpacity - v) < 0.01 ? t.accent : pressed ? t.accentSoft : t.bg,
                      })}
                    >
                      <T v="caption" color={Math.abs(activeOpacity - v) < 0.01 ? '#fff' : t.sub} style={{ fontWeight: '700' }}>{Math.round(v * 100)}%</T>
                    </Pressable>
                  ))}
                </View>
                <T v="caption" color={t.faint}>
                  {Platform.OS === 'web' ? 'Crop/potong memakai alat galeri sebelum unggah — di HP, potong langsung muncul saat memilih foto.' : 'Saat memilih foto kamu bisa potong (crop) & atur dulu di layar galeri.'}
                </T>
              </View>
            )}
            {!chatId && (
              <T v="caption" color={t.faint}>
                Untuk wallpaper KHUSUS satu chat: buka chat itu → menu ⋮ → "Wallpaper & tema".
              </T>
            )}
          </View>
        </Card>

        <Card title="Tema warna chat">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {CHAT_THEMES.map((th) => {
              const active = activeTheme === th.id;
              return (
                <Pressable
                  key={th.id}
                  onPress={async () => {
                    // BALASAN INSTAN: warna aktif langsung pindah detik ini, lalu
                    // disimpan ke profil (real-time ke perangkat lain). Gagal → dikembalikan.
                    if (active) return;
                    const prev = activeTheme;
                    patchMeLocal({ chatTheme: th.id } as any);
                    const r = await updateMe({ chatTheme: th.id } as any);
                    if (!r.ok) {
                      patchMeLocal({ chatTheme: prev } as any);
                      pushBanner({ title: 'Gagal menyimpan tema', body: r.error ?? 'Coba lagi.', icon: 'alert' });
                    }
                  }}
                  style={({ pressed }) => ({
                    width: 104, borderRadius: R.md, padding: 10, gap: 6, alignItems: 'center',
                    borderWidth: 2, borderColor: active ? t.accent : 'transparent',
                    backgroundColor: pressed ? t.accentSoft : t.bg,
                    opacity: pressed ? 0.9 : 1,
                  })}
                >
                  <View style={{ width: 74, height: 30, borderRadius: 12, backgroundColor: th.mine }} />
                  <T v="caption" numberOfLines={1} style={{ fontWeight: active ? '800' : '500' }}>{th.label}</T>
                  {active && <Ionicons name="checkmark-circle" size={16} color={t.accent} />}
                </Pressable>
              );
            })}
          </View>
          <T v="caption" color={t.faint} style={{ marginTop: 8 }}>
            Tema mengubah warna balon pesanmu sendiri — gaya balon yang dipilih tetap berlaku.
          </T>
        </Card>
      </ScrollView>
    </Screen>
  );
}
