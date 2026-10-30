/**
 * PENGATURAN TAMPILAN CHAT:
 *  - ChatBubblesScreen : pilih GAYA BALON (gaya balon ala WhatsApp) — tersimpan di
 *    profil, real-time terlihat oleh semua orang di chat pribadi/grup/global/saluran.
 *  - WallpaperScreen   : WALLPAPER chat (default semua chat / per chat dibuka dari
 *    ChatRoom) + TEMA WARNA chat (warna balon milik + aksen).
 */
import React, { useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoute } from '@react-navigation/native';
import { Header, Screen, T, Card, Btn } from '../components/ui';
import { useStore, updateMe } from '../lib/store';
import { pushBanner } from '../lib/bus';
import { useTheme, R } from '../lib/theme';
import { BUBBLE_STYLES, CHAT_THEMES, resolveBubble } from '../lib/bubbles';
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
    const r = await updateMe({ bubble: id as any });
    setSaving(null);
    if (r.ok) pushBanner({ title: 'Gaya balon dipasang', body: 'Semua chatmu sekarang pakai gaya ini — orang lain juga melihatnya real-time.', icon: 'checkmark-circle' });
    else pushBanner({ title: 'Gagal menyimpan', body: r.error ?? 'Coba lagi.', icon: 'alert' });
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
  const wallpapers = me?.wallpapers ?? {};
  const scopeKey = chatId ?? 'default';
  const activeWallpaper = wallpapers[scopeKey] ?? null;
  const activeTheme = me?.chatTheme ?? 'default';

  const pickWallpaper = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return pushBanner({ title: 'Izin galeri ditolak', body: 'Aktifkan izin galeri untuk memasang wallpaper.', icon: 'alert' });
    const p = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
    if (p.canceled || !p.assets?.[0]) return;
    setBusy(true);
    try {
      const asset = p.assets[0];
      const r = await uploadMedia(asset.uri, `wallpapers/${me!.id}/${Date.now()}.jpg`, 'image/jpeg');
      await updateMe({ wallpapers: { ...wallpapers, [scopeKey]: r.url } });
      pushBanner({ title: 'Wallpaper terpasang', body: scopeKey === 'default' ? 'Dipakai di semua chat yang belum punya wallpaper sendiri.' : 'Wallpaper khusus chat ini terpasang.', icon: 'image' });
    } catch (e: any) {
      pushBanner({ title: 'Gagal memasang wallpaper', body: e?.message ?? 'Coba lagi.', icon: 'alert' });
    } finally {
      setBusy(false);
    }
  };

  const clearWallpaper = async () => {
    await updateMe({ wallpapers: { ...wallpapers, [scopeKey]: null } });
    pushBanner({ title: 'Wallpaper dihapus', body: 'Kembali ke latar standar.', icon: 'trash' });
  };

  return (
    <Screen>
      <Header title="Wallpaper & tema chat" />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 40 }}>
        <Card title="Wallpaper">
          <View style={{ gap: 10 }}>
            <View style={{ height: 150, borderRadius: R.md, overflow: 'hidden', backgroundColor: t.bg2, alignItems: 'center', justifyContent: 'center' }}>
              {activeWallpaper ? (
                <Image source={{ uri: activeWallpaper }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} />
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
              {!!activeWallpaper && <Btn small variant="neu" icon="trash" title="Hapus" onPress={clearWallpaper} />}
            </View>
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
                  onPress={() => updateMe({ chatTheme: th.id })}
                  style={({ pressed }) => ({
                    width: 104, borderRadius: R.md, padding: 10, gap: 6, alignItems: 'center',
                    borderWidth: 2, borderColor: active ? t.accent : 'transparent',
                    backgroundColor: pressed ? t.bg2 : t.bg,
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
