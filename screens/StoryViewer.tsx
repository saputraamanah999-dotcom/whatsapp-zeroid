import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T, Avatar } from '../components/ui';
import { Sheet, Confirm } from '../components/Sheet';
import { font } from '../lib/theme';
import { useStore, activeStories, viewStory, likeStory, deleteStory, replyStory } from '../lib/store';
import { ago } from '../lib/format';
import { pushBanner } from '../lib/bus';
import { VerifiedBadge } from '../lib/icons';

const DURATION = 5500;

export default function StoryViewer() {
  const nav = useNavigation<any>();
  const { params } = useRoute<any>();
  const insets = useSafeAreaInsets();
  const { db, me } = useStore();
  const userId: string = params?.userId;
  const stories = useMemo(() => activeStories(db).filter((s) => s.userId === userId).sort((a, b) => a.createdAt - b.createdAt), [db, userId]);
  const firstUnseen = Math.max(0, stories.findIndex((s) => !s.viewers.includes(me?.id ?? '')));
  const [idx, setIdx] = useState(userId === me?.id ? 0 : firstUnseen);
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState('');
  const [viewersOpen, setViewersOpen] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const lastTick = useRef(Date.now());

  const story = stories[Math.min(idx, stories.length - 1)];
  const owner = db.users[userId];
  const mine = userId === me?.id;
  const hold = paused || viewersOpen || askDelete || reply.length > 0;

  useEffect(() => {
    if (story && !mine) viewStory(story.id);
    setElapsed(0);
  }, [story?.id]);

  useEffect(() => {
    lastTick.current = Date.now();
    const iv = setInterval(() => {
      const n = Date.now();
      const d = n - lastTick.current;
      lastTick.current = n;
      if (hold) return;
      setElapsed((e) => e + d);
    }, 50);
    return () => clearInterval(iv);
  }, [hold]);

  useEffect(() => {
    if (elapsed >= DURATION) next();
  }, [elapsed]);

  const next = () => {
    if (idx < stories.length - 1) setIdx(idx + 1);
    else nav.goBack();
  };
  const prev = () => {
    if (idx > 0) setIdx(idx - 1);
    else setElapsed(0);
  };

  useEffect(() => {
    if (!stories.length) nav.goBack();
  }, [stories.length]);

  if (!story || !owner || !me) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  const liked = story.likes.includes(me.id);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, backgroundColor: story.bg ?? '#000' }}>
        {story.type === 'image' && story.uri ? (
          <Image source={{ uri: story.uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" transition={250} />
        ) : story.type === 'video' && story.uri ? (
          <StoryVideo uri={story.uri} paused={paused} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 36 }}>
            <T v="h1" color="#fff" style={{ textAlign: 'center', fontSize: 30, lineHeight: 40 }}>
              {story.text ?? ''}
            </T>
          </View>
        )}
        {(story.type === 'image' || story.type === 'video') && !!story.text && (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 120, alignItems: 'center', paddingHorizontal: 24 }}>
            <View style={{ backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16 }}>
              <T v="body" color="#fff" style={{ textAlign: 'center', fontWeight: '600' }}>
                {story.text}
              </T>
            </View>
          </View>
        )}

        {/* tap zones */}
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, flexDirection: 'row' }}>
          <Pressable style={{ flex: 1 }} onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} accessibilityLabel="Sebelumnya" />
          <Pressable style={{ flex: 2 }} onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} accessibilityLabel="Berikutnya" />
        </View>

        {/* top bar */}
        <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12 }}>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            {stories.map((s, i) => (
              <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' }}>
                <View style={{ height: 3, backgroundColor: '#fff', width: `${i < idx ? 100 : i === idx ? Math.min(100, (elapsed / DURATION) * 100) : 0}%` }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
            <Avatar uri={owner.avatar} name={owner.name} color={owner.color} size={40} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T v="h3" color="#fff">
                  {mine ? 'Story saya' : owner.name}
                </T>
                {/* centang biru di nama pembuat SW (pembeli centang biru & developer) */}
                {(owner.blueCheck || owner.developer || owner.role === 'admin' || owner.role === 'developer') && <VerifiedBadge size={14} animate={false} />}
              </View>
              <T v="caption" color="rgba(255,255,255,0.8)">
                {ago(story.createdAt)}
              </T>
            </View>
            {mine && (
              <Pressable onPress={() => setAskDelete(true)} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Hapus story">
                <Ionicons name="trash-outline" size={22} color="#fff" />
              </Pressable>
            )}
            <Pressable onPress={() => nav.goBack()} hitSlop={10} style={{ padding: 6 }} accessibilityLabel="Tutup">
              <Ionicons name="close" size={28} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* footer */}
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: insets.bottom + 16 }}>
          {mine ? (
            <Pressable onPress={() => setViewersOpen(true)} style={{ alignSelf: 'center', alignItems: 'center', gap: 4, padding: 10 }}>
              <Ionicons name="chevron-up" size={20} color="#fff" />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="eye" size={18} color="#fff" />
                  <T v="body" color="#fff" style={{ fontWeight: '600' }}>
                    {story.viewers.length}
                  </T>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="heart" size={18} color="#FF5A8A" />
                  <T v="body" color="#fff" style={{ fontWeight: '600' }}>
                    {story.likes.length}
                  </T>
                </View>
              </View>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 26, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.7)', paddingHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder={owner.privacy.storyReplies ? 'Balas Story…' : 'Balasan dinonaktifkan'}
                  editable={owner.privacy.storyReplies}
                  placeholderTextColor="rgba(255,255,255,0.75)"
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    if (!reply.trim()) return;
                    replyStory(story, reply.trim());
                    setReply('');
                    pushBanner({ title: 'Terkirim', body: `Balasan dikirim ke ${owner.name}`, icon: 'paper-plane' });
                  }}
                  style={[font, { flex: 1, color: '#fff', fontSize: 16, paddingVertical: 13, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }]}
                />
                {!!reply.trim() && (
                  <Pressable
                    onPress={() => {
                      replyStory(story, reply.trim());
                      setReply('');
                      pushBanner({ title: 'Terkirim', body: `Balasan dikirim ke ${owner.name}`, icon: 'paper-plane' });
                    }}
                  >
                    <Ionicons name="send" size={20} color="#fff" />
                  </Pressable>
                )}
              </View>
              <Pressable onPress={() => likeStory(story.id)} style={{ width: 50, height: 50, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Suka">
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#FF5A8A' : '#fff'} />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <Sheet visible={viewersOpen} onClose={() => setViewersOpen(false)} title={`Dilihat oleh ${story.viewers.length}`}>
        <ScrollView style={{ maxHeight: 360 }}>
          {story.viewers.length === 0 && <T v="sub">Belum ada yang melihat.</T>}
          {story.viewers.map((v) => {
            const u = db.users[v];
            if (!u) return null;
            return (
              <View key={v} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
                <Avatar uri={u.avatar} name={u.name} color={u.color} size={42} />
                <T v="body" style={{ flex: 1, fontWeight: '500' }}>
                  {u.name}
                </T>
                {story.likes.includes(v) && <Ionicons name="heart" size={18} color="#FF5A8A" />}
              </View>
            );
          })}
        </ScrollView>
      </Sheet>
      <Confirm visible={askDelete} title="Hapus Story ini?" confirm="Hapus" danger onConfirm={() => deleteStory(story.id)} onClose={() => setAskDelete(false)} />
    </KeyboardAvoidingView>
  );
}

/** looping fullscreen video story (expo-video; native + web) */
function StoryVideo({ uri, paused }: { uri: string; paused: boolean }) {
  const { VideoView, useVideoPlayer } = require('expo-video');
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = true;
    p.muted = false;
    p.play();
  });
  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [paused]);
  return <VideoView player={player} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />;
}
