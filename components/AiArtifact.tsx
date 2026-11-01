/**
 * AiArtifact (v26) — MODE AGENT EKSEKUSI NYATA.
 * AI Zeroid mampu MEMBUAT website/HTML sungguhan. Blok ```html dalam jawaban
 * diubah jadi KARTU ARTIFAK: pratinjau situs jalan penuh (iframe web / WebView
 * APK), unduh file .html, dan salin kode — bukan sekadar teks yang dianalisis.
 */
import React, { useMemo, useState } from 'react';
import { Platform, Modal, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T, Btn } from './ui';
import { useTheme, R } from '../lib/theme';

const NativeWebView = Platform.OS === 'web' ? null : (require('react-native-webview').WebView as any);

/** Ambil blok html pertama dari teks AI (```html ... ``` / ``` ... ```). */
export function extractHtml(text: string): string {
  if (!text) return '';
  const m = /```(?:html|htm)?\s*\n([\s\S]+?)```/i.exec(text);
  const raw = m?.[1]?.trim() ?? '';
  if (!raw) return '';
  const looksHtml = /<html|<!doctype|<body|<div|<section|<h1|<style|<script/i.test(raw);
  return looksHtml ? raw.slice(0, 200000) : '';
}

export function hasHtmlArtifact(text: string): boolean {
  return !!extractHtml(text);
}

export default function AiArtifact({ html, title }: { html: string; title?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const doc = useMemo(() => {
    const full = /<html[\s>]/i.test(html) ? html : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:16px;background:#fff;color:#111}</style></head><body>${html}</body></html>`;
    return full;
  }, [html]);

  const download = () => {
    const name = (title ?? 'zeroid-artifact').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '.html';
    if (Platform.OS === 'web') {
      try {
        const blob = new Blob([doc], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch { /* noop */ }
    } else {
      // native: salin penuh ke clipboard (tanpa dependency tambahan)
      import('expo-clipboard').then((c) => c.setStringAsync(doc)).catch(() => {});
    }
  };

  return (
    <View style={{ marginTop: 8, borderRadius: R.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.bg2, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10 }}>
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="code-slash" size={17} color={t.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="caption" style={{ fontWeight: '900' }}>Artifak dibuat agent — siap dibuka</T>
          <T v="caption" color={t.faint} numberOfLines={1}>Website hasil eksekusi AI Zeroid ({Platform.OS === 'web' ? 'pratinjau langsung' : 'buka in-app'})</T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, padding: 10, paddingTop: 0 }}>
        <Btn small icon="play" title="Pratinjau" onPress={() => setOpen(true)} style={{ flex: 1 }} />
        {Platform.OS === 'web' && <Btn small variant="neu" icon="download" title="Unduh .html" onPress={download} />}
        <Btn small variant="neu" icon="copy" title="Salin" onPress={() => { import('expo-clipboard').then((c) => c.setStringAsync(doc)).catch(() => {}); }} />
      </View>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#0b0f14', paddingTop: Platform.OS === 'web' ? 0 : 34 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
            <Pressable onPress={() => setOpen(false)} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
            <T style={{ color: '#fff', fontWeight: '800', flex: 1 }} numberOfLines={1}>Pratinjau artifak</T>
            {Platform.OS === 'web' && (
              <Btn small variant="neu" icon="download" title="Unduh" onPress={download} />
            )}
          </View>
          {Platform.OS === 'web' ? (
            <View style={{ flex: 1 }}>
              {React.createElement('iframe', {
                srcDoc: doc,
                title: 'Pratinjau artifak AI',
                sandbox: 'allow-scripts allow-forms allow-popups',
                style: { width: '100%', height: '100%', border: 0, background: '#fff' },
              })}
            </View>
          ) : (
            <NativeWebView source={{ html: doc }} style={{ flex: 1, backgroundColor: '#fff' }} javaScriptEnabled domStorageEnabled />
          )}
        </View>
      </Modal>
    </View>
  );
}
