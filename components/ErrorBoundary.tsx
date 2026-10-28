/**
 * ErrorBoundary global — jaring pengaman terakhir.
 *
 * Sebelumnya: satu error render (mis. hook navigasi di luar navigator)
 * membuat React MENGUNMOUNT seluruh tree → layar PUTIH total tanpa pesan.
 * Sekarang: crash apa pun ditangkap, ditampilkan jelas, dan bisa dipulihkan
 * dengan satu tombol (reload web / reset aplikasi native).
 */
import React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { T } from './ui';
import { ZeroidLogo } from '../lib/icons';

type Props = { children: React.ReactNode };
type State = { error: Error | null; info: string };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({ info: String(info?.componentStack ?? '').slice(0, 1200) });
    // log ke console supaya bisa dibaca via remote debugging
    console.warn('[Zeroid] Render crash ditangkap ErrorBoundary:', error?.message, info?.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#0F1216', paddingTop: Platform.OS === 'web' ? 40 : 80, paddingHorizontal: 22 }}>
        <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center', gap: 14 }}>
          <ZeroidLogo size={56} />
          <T v="h2" color="#FFFFFF">Terjadi kesalahan tampilan</T>
          <T v="sub" color="rgba(255,255,255,0.75)">
            Aplikasi menangkap sebuah error render sehingga layar tidak bisa digambar.
            Tekan muat ulang — data akunmu aman di server. Jika terus terjadi, keluar lalu masuk kembali.
          </T>
          <View style={{ borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' }}>
            <ScrollView style={{ maxHeight: 190 }}>
              <T v="caption" color="#FF8FA3" style={{ fontFamily: Platform.OS === 'web' ? 'monospace' : undefined } as any}>
                {error?.message ?? String(error)}
              </T>
              {!!info && (
                <T v="caption" color="rgba(255,255,255,0.5)" style={{ fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, marginTop: 8 } as any}>
                  {info}
                </T>
              )}
            </ScrollView>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <Pressable
              onPress={() => {
                if (Platform.OS === 'web') window.location.reload();
                else this.setState({ error: null, info: '' });
              }}
              style={{ flex: 1, backgroundColor: '#1E6BFF', borderRadius: 16, paddingVertical: 14, alignItems: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Muat ulang aplikasi"
            >
              <T v="sub" color="#FFFFFF" style={{ fontWeight: '800' }}>Muat ulang aplikasi</T>
            </Pressable>
            {Platform.OS === 'web' && (
              <Pressable
                onPress={() => {
                  try { window.sessionStorage.clear(); window.localStorage.removeItem('zeroid-unlocked'); } catch {}
                  window.location.href = '/';
                }}
                style={{ flex: 1, borderRadius: 16, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' }}
                accessibilityRole="button"
                accessibilityLabel="Segarkan sesi"
              >
                <T v="sub" color="#FFFFFF">Segarkan sesi</T>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    );
  }
}
