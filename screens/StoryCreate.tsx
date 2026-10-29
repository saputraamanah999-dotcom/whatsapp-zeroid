import React, { useEffect, useState } from 'react';
import { View, Pressable, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, Btn } from '../components/ui';
import { font, STORY_BGS } from '../lib/theme';
import { postStory, getMe, useStore } from '../lib/store';
import { pickCamera, pickGallery, pickVideo, uploadMedia, compressImage, MediaError, UPLOAD_MAX_MB, mb } from '../lib/media';
import { pushBanner } from '../lib/bus';
import MentionSuggestions from '../components/MentionSuggestions';
import { activeMentionQuery, applyMention, mentionCandidates } from '../lib/mentions';

export default function StoryCreate() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'text' | 'image' | 'video'>(params?.mode === 'text' ? 'text' : params?.mode === 'video' ? 'video' : 'image');
  const [bg, setBg] = useState(STORY_BGS[0]);
  const [text, setText] = useState('');
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { db } = useStore();
  // SW mention: ketik @username → saran dari semua pengguna (tanpa @semua)
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const mentionOptions = mentionQ !== null ? mentionCandidates(Object.keys(db.users), db.users, mentionQ, false) : [];

  const pick = async (cam: boolean) => {
    const p = cam ? await pickCamera() : await pickGallery('images');
    if (p) setUri(p.uri);
  };

  const pickVid = async () => {
    const p = await pickVideo();
    if (!p) return;
    if (p.size && p.size > mb(UPLOAD_MAX_MB)) {
      pushBanner({ title: 'Video terlalu besar', body: `Maks ${UPLOAD_MAX_MB} MB di server unggah ini — pilih video lebih pendek.`, icon: 'alert' });
      return;
    }
    setUri(p.uri);
    setMode('video');
  };

  useEffect(() => {
    if (mode === 'image' && !uri) pick(false);
  }, []);

  const share = async () => {
    if (mode === 'text' && !text.trim()) return;
    if (mode !== 'text' && !uri) return;
    setBusy(true);
    const myId = getMe()?.id ?? 'anon';
    try {
      let u: string | undefined;
      if (mode === 'image' && uri) {
        // kompres dulu (story picker memberi JPEG mentah yang bisa >3MB)
        const { blob, mime } = await compressImage(uri, { maxDim: 1440, quality: 0.82 });
        u = (await uploadMedia(blob, `stories/${myId}/${Date.now()}.${mime === 'image/png' ? 'png' : 'webp'}`, mime)).url;
      }
      if (mode === 'video' && uri) u = (await uploadMedia(uri, `stories/${myId}/${Date.now()}.mp4`, 'video/mp4')).url;
      await postStory(mode === 'text' ? { type: 'text', text: text.trim(), bg } : mode === 'video' ? { type: 'video', uri: u, text: text.trim() || undefined } : { type: 'image', uri: u, text: text.trim() || undefined });
      pushBanner({ title: 'Story dibagikan', body: 'Kontakmu akan diberi tahu. Story hilang dalam 24 jam.', icon: 'aperture' });
      nav.goBack();
    } catch (e: any) {
      pushBanner({ title: 'Story gagal dikirim', body: e instanceof MediaError ? e.message : (e?.message ?? 'Coba lagi.'), icon: 'alert' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: mode === 'text' ? bg : '#0B1220' }}>
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => nav.goBack()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Tutup">
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => setMode(mode === 'text' ? 'image' : 'text')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)' }}>
          <Ionicons name={mode === 'text' ? 'image' : 'text'} size={18} color="#fff" />
          <T v="sub" color="#fff" style={{ fontWeight: '600' }}>
            {mode === 'text' ? 'Foto' : 'Teks'}
          </T>
        </Pressable>
        {mode === 'text' && (
          <Pressable onPress={() => setBg(STORY_BGS[(STORY_BGS.indexOf(bg) + 1) % STORY_BGS.length])} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Ganti warna">
            <Ionicons name="color-palette" size={22} color="#fff" />
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        {mode === 'text' ? (
          <TextInput
            value={text}
            onChangeText={(s) => { setText(s); setMentionQ(activeMentionQuery(s)); }}
            placeholder="Ketik status…"
            placeholderTextColor="rgba(255,255,255,0.6)"
            multiline
            autoFocus
            maxLength={280}
            style={[font, { color: '#fff', fontSize: 30, fontWeight: '700', textAlign: 'center', width: '100%', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }]}
          />
        ) : mode === 'video' && uri ? (
          <VideoPreview uri={uri} />
        ) : uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%', borderRadius: 24 }} contentFit="contain" />
        ) : (
          <View style={{ gap: 14, width: '100%', maxWidth: 320 }}>
            <Btn title="Pilih dari galeri" icon="images" onPress={() => pick(false)} />
            <Btn title="Ambil foto" icon="camera" variant="neu" onPress={() => pick(true)} />
            <Btn title="Pilih video" icon="videocam" variant="neu" onPress={pickVid} />
          </View>
        )}
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {mode === 'text' ? (
          <T v="caption" color="rgba(255,255,255,0.8)" style={{ flex: 1 }}>
            {text.length}/280 · pakai @username untuk menyebut teman
          </T>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.14)', paddingHorizontal: 16 }}>
            <TextInput value={text} onChangeText={(s) => { setText(s); setMentionQ(activeMentionQuery(s)); }} placeholder="Tambahkan keterangan… (@username untuk menyebut)" placeholderTextColor="rgba(255,255,255,0.6)" maxLength={200} style={[font, { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 14, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }]} />
            {uri && (
              <Pressable onPress={() => (mode === 'video' ? pickVid() : pick(false))} hitSlop={8}>
                <Ionicons name="swap-horizontal" size={20} color="#fff" />
              </Pressable>
            )}
          </View>
        )}
        <Pressable onPress={share} disabled={busy} style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: (mode === 'text' ? text.trim() : uri) ? 1 : 0.5 }} accessibilityLabel="Bagikan">
          {busy ? <ActivityIndicator color="#1E6BFF" /> : <Ionicons name="send" size={24} color="#1E6BFF" style={{ marginLeft: 3 }} />}
        </Pressable>
      </View>

      {/* saran @username untuk SW */}
      {mentionOptions.length > 0 && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 4 }}>
          <MentionSuggestions
            options={mentionOptions}
            onPick={(o) => {
              setText((x) => applyMention(x, o.insert));
              setMentionQ(null);
            }}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** inline looping video preview for video stories */
function VideoPreview({ uri }: { uri: string }) {
  const { VideoView, useVideoPlayer } = require('expo-video');
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={{ width: '100%', height: '100%', borderRadius: 24 }} contentFit="contain" />;
}
