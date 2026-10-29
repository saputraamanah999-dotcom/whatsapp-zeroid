/**
 * Chat composer — compact, single-line when empty, grows with content up to a
 * max height (internal scroll), never overlaps the header or the last message,
 * keyboard-safe. Shows a media preview with cancel before upload, upload
 * progress, and a reply/edit strip with a working X button.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, TextInput, Pressable, Platform, ViewStyle, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeOut, useSharedValue, useAnimatedStyle, withRepeat, withTiming } from 'react-native-reanimated';
import { useAudioRecorder, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import * as Location from 'expo-location';
import { T, Segmented, Btn } from './ui';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AppleEmoji, EMOJI_SET, DEFAULT_STICKERS } from './Emoji';
import { Sheet } from './Sheet';
import { Icon } from '../lib/icons';
import { useTheme, font, R } from '../lib/theme';
import { Message, DB, User } from '../lib/types';
import { messagePreview, sendMessage, editMessage, setTyping, clearTyping, retryMessage, OutMsg, stickersFor, createSticker } from '../lib/store';
import { bratSticker } from '../lib/supabase';
import MentionSuggestions, { MentionOption } from './MentionSuggestions';
import { activeMentionQuery, applyMention, mentionCandidates } from '../lib/mentions';
import { ensurePermission } from '../lib/permissions';
import { pickCamera, pickDocument, pickGallery, pickMultipleImages, uploadMedia, Picked, PreparedMedia, prepareForSend, MediaError } from '../lib/media';
import { duration as fmt } from '../lib/format';
import { pushBanner } from '../lib/bus';

const MAX_INPUT_H = 110;
const BTN = 34;
const FAB = 42;

/** polling tersedia di grup, saluran & chat global (ala WhatsApp) */
function chatTypeForPoll(chatId: string, db: DB): boolean {
  const c = db.chats[chatId];
  return !!c && (c.type === 'group' || c.type === 'global' || c.type === 'channel');
}

function RecDot() {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.2, { duration: 600 }), -1, true);
  }, []);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF3B5C' }, st]} />;
}

type PendingMedia = { prepared: PreparedMedia; preview: string; caption: string; progress: number };

/** one-shot per session: web browser notification permission (requested on first send) */
let webNotifAsked = false;

export default function Composer({
  chatId, db, me, replyTo, editing, onClearReply, onClearEdit, onSend,
}: {
  chatId: string;
  db: DB;
  me: User;
  replyTo: Message | null;
  editing: Message | null;
  onClearReply: () => void;
  onClearEdit: () => void;
  /** Optional send override (e.g. AI assistant chats). Receives the outgoing payload. */
  onSend?: (payload: OutMsg) => void;
}) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(false);
  const [panel, setPanel] = useState<null | 'emoji' | 'sticker'>(null);
  const [inputH, setInputH] = useState(20);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingMedia | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [bratMode, setBratMode] = useState(false);
  const [bratText, setBratText] = useState('');
  const [bratUrl, setBratUrl] = useState<string | null>(null);
  const [bratBusy, setBratBusy] = useState(false);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollQ, setPollQ] = useState('');
  const [pollOpts, setPollOpts] = useState(['', '']);
  const [pollMulti, setPollMulti] = useState(false);
  // mention: query @ aktif (null = tidak sedang mengetik @)
  const [mentionQ, setMentionQ] = useState<string | null>(null);
  const chat = db.chats[chatId];
  const mentionAllowAll = chat?.type === 'group' || chat?.type === 'global';
  const mentionOptions: MentionOption[] =
    mentionQ !== null && (chat?.type === 'group' || chat?.type === 'global' || chat?.type === 'channel')
      ? mentionCandidates(chat?.members, db.users, mentionQ, mentionAllowAll)
      : [];
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (editing) {
      setText(editing.text ?? '');
      inputRef.current?.focus();
    }
  }, [editing?.id]);
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo?.id]);
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const send = (payload: OutMsg) => {
    if (onSend) onSend({ ...payload, replyTo: replyTo?.id });
    else void sendMessage(chatId, { ...payload, replyTo: replyTo?.id });
    onClearReply();
  };

  /** Reset composer to the compact single-line state after sending. */
  const resetInput = () => {
    setText('');
    setInputH(20);
    setMentionQ(null);
    clearTyping(chatId);
  };

  const submit = () => {
    const s = text.trim();
    if (!s) return;
    setMentionQ(null);
    // web: minta izin notifikasi sekali per sesi, dalam konteks gestur pengguna
    if (Platform.OS === 'web' && !webNotifAsked) {
      webNotifAsked = true;
      void ensurePermission('notifications');
    }
    if (editing) {
      editMessage(chatId, editing.id, s);
      onClearEdit();
    } else send({ type: 'text', text: s });
    resetInput();
  };

  // ---------- media send pipeline: prepare → preview → upload → send ----------
  const preparePicked = async (p: Picked | null) => {
    if (!p) return;
    try {
      const prepared = await prepareForSend(p, chatId);
      setPending({ prepared, preview: prepared.uri, caption: '', progress: 0 });
    } catch (e: any) {
      pushBanner({ title: 'Lampiran tidak valid', body: e instanceof MediaError ? e.message : (e?.message ?? 'Gagal menyiapkan media.'), icon: 'alert' });
    }
  };

  const confirmSendMedia = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await pending.prepared.upload!((pct) => setPending((x) => (x ? { ...x, progress: pct } : x)));
      send({
        type: pending.prepared.type,
        uri: res.url,
        mime: res.mime,
        fileSize: res.size,
        width: pending.prepared.width,
        height: pending.prepared.height,
        fileName: pending.prepared.name,
        duration: pending.prepared.duration,
        storagePath: res.path,
        mediaExpiresAt: res.expiresAt,
        text: pending.caption.trim() || undefined,
      });
      setPending(null);
      resetInput();
    } catch (e: any) {
      pushBanner({ title: 'Unggahan gagal', body: e?.message ?? 'Coba lagi.', icon: 'alert' });
    } finally {
      setBusy(false);
    }
  };

  const sendMultiple = async (ps: Picked[]) => {
    for (const p of ps) await preparePicked(p);
  };

  // ---------- location & contact sharing ----------
  const sendLocation = async () => {
    setBusy(true);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        lat = await new Promise<number | null>((res) =>
          navigator.geolocation.getCurrentPosition((pos) => res(pos.coords.latitude), () => res(null), { timeout: 10000 })
        );
        if (lat !== null) {
          lng = await new Promise<number | null>((res) =>
            navigator.geolocation.getCurrentPosition((pos) => res(pos.coords.longitude), () => res(null), { timeout: 10000 })
          );
        }
      } else {
        const req = await Location.requestForegroundPermissionsAsync();
        if (!req.granted) {
          pushBanner({ title: 'Izin lokasi', body: 'Izinkan akses lokasi untuk berbagi posisi.', icon: 'alert' });
          return;
        }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
      if (lat == null || lng == null) {
        pushBanner({ title: 'Lokasi gagal', body: 'Perangkat tidak dapat menentukan posisi saat ini.', icon: 'alert' });
        return;
      }
      send({ type: 'location', lat, lng, locationLabel: 'Posisi saya' });
    } catch (e: any) {
      pushBanner({ title: 'Lokasi gagal', body: e?.message ?? 'Coba lagi.', icon: 'alert' });
    } finally {
      setBusy(false);
    }
  };

  const sendContact = () => {
    const n = cName.trim();
    const p = cPhone.trim();
    if (!n || !p) return;
    send({ type: 'contact', contactName: n, contactPhone: p });
    setContactOpen(false);
    setCName('');
    setCPhone('');
  };

  // ---------- voice notes ----------
  const startRec = async () => {
    if (!(await ensurePermission('microphone'))) return;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      setRecSec(0);
      timer.current = setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch {
      pushBanner({ title: 'Gagal merekam', body: 'Mikrofon tidak tersedia di perangkat ini.', icon: 'mic-off' });
    }
  };

  const stopRec = async (sendIt: boolean) => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const dur = recSec;
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (sendIt && uri && dur >= 1) {
        setBusy(true);
        try {
          // expo-audio: native → .m4a (audio/mp4), web MediaRecorder → .webm (audio/webm)
          const isWebm = /\.webm$/i.test(uri);
          const mime = isWebm ? 'audio/webm' : 'audio/mp4';
          const ext = isWebm ? '.webm' : '.m4a';
          const res = await uploadMedia(uri, `chats/${chatId}/vn_${Date.now()}${ext}`, mime);
          send({ type: 'audio', uri: res.url, duration: dur, mime, fileSize: res.size, storagePath: res.path });
          resetInput();
        } catch (e: any) {
          // DULU: gagal senyap → VN "hilang" tanpa pesan. Sekarang: selalu kasih tahu.
          pushBanner({ title: 'Voice note gagal terkirim', body: e?.message ?? 'Koneksi/unggahan bermasalah — coba rekam ulang.', icon: 'alert' });
        } finally {
          setBusy(false);
        }
      } else if (sendIt) {
        pushBanner({ title: 'Terlalu singkat', body: 'Rekam minimal 1 detik.', icon: 'mic' });
      }
    } catch {
      setBusy(false);
    }
  };

  const failedMsgs = (db.messages[chatId] ?? []).filter((m) => m.senderId === me.id && m.status === 'failed');
  const ctx = editing ?? replyTo;
  const multiline = inputH > 20;

  const sendPoll = () => {
    const q = pollQ.trim();
    const opts = pollOpts.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) return;
    send({ type: 'poll', text: q, poll: { options: opts.slice(0, 6), multi: pollMulti } });
    setPollOpen(false);
    setPollQ('');
    setPollOpts(['', '']);
    setPollMulti(false);
  };

  const canPoll = chatTypeForPoll(chatId, db);

  return (
    <View style={{ paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6, backgroundColor: t.bg }}>
      {failedMsgs.length > 0 && (
        <Pressable onPress={() => failedMsgs.forEach((m) => retryMessage(chatId, m.id))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.md, marginBottom: 6, backgroundColor: pressed ? t.dangerSoft : t.dangerSoft, opacity: pressed ? 0.8 : 1 })}>
          <Icon name="alert" size={15} color={t.danger} />
          <T v="caption" color={t.danger} style={{ flex: 1 }}>{failedMsgs.length} pesan gagal terkirim — ketuk untuk kirim ulang</T>
        </Pressable>
      )}

      {/* media preview (before sending) */}
      {pending && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ marginBottom: 8, borderRadius: R.md, padding: 10, backgroundColor: t.bg, boxShadow: t.insetSm } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {pending.prepared.type === 'image' ? (
              <Image source={{ uri: pending.preview }} style={{ width: 56, height: 56, borderRadius: 10 }} contentFit="cover" />
            ) : (
              <View style={{ width: 56, height: 56, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: t.accentSoft }}>
                <Icon name={pending.prepared.type === 'video' ? 'video' : pending.prepared.type === 'audio' ? 'music' : 'file-text'} size={24} color={t.accent} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <T v="caption" numberOfLines={1} style={{ fontWeight: '700' }}>{pending.prepared.name ?? pending.prepared.type}</T>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: t.bg2, marginTop: 6, overflow: 'hidden' }}>
                <View style={{ width: `${Math.max(4, pending.progress)}%`, height: '100%', borderRadius: 2, backgroundColor: t.accent }} />
              </View>
              <T v="caption" color={t.faint}>{busy ? `Mengunggah ${pending.progress}%` : 'Siap dikirim'}</T>
            </View>
            <Pressable onPress={() => { if (!busy) setPending(null); }} hitSlop={10} accessibilityLabel="Batalkan lampiran">
              <Icon name="x" size={18} color={busy ? t.faint : t.sub} />
            </Pressable>
          </View>
          <TextInput
            value={pending.caption}
            onChangeText={(v) => setPending((x) => (x ? { ...x, caption: v } : x))}
            placeholder="Tambahkan keterangan…"
            placeholderTextColor={t.faint}
            style={[font, { color: t.text, fontSize: 14, paddingVertical: 6, marginTop: 4 }]}
          />
          <Btn small variant="primary" icon="send" title={busy ? 'Mengunggah…' : 'Kirim'} disabled={busy} onPress={confirmSendMedia} />
        </Animated.View>
      )}

      {/* reply / edit strip */}
      {ctx && !pending && (
        <Animated.View entering={FadeIn} exiting={FadeOut} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, marginHorizontal: 2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.md, backgroundColor: t.bg, boxShadow: t.insetSm } as any}>
          <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: t.accent }} />
          <Icon name={editing ? 'edit' : 'reply'} size={14} color={t.accent} />
          <View style={{ flex: 1 }}>
            <T v="caption" color={t.accent} style={{ fontWeight: '700' }} numberOfLines={1}>
              {editing ? 'Edit pesan' : `Membalas ${ctx.senderId === me.id ? 'diri sendiri' : db.users[ctx.senderId]?.name ?? ''}`}
            </T>
            <T v="caption" numberOfLines={1} color={t.sub}>{messagePreview(ctx)}</T>
          </View>
          <Pressable onPress={() => (editing ? (onClearEdit(), setText('')) : onClearReply())} hitSlop={12} accessibilityLabel="Tutup">
            <Icon name="x" size={17} color={t.sub} />
          </Pressable>
        </Animated.View>
      )}

      {/* popup mention @username / @semua — muncul saat mengetik "@" */}
      {mentionOptions.length > 0 && !recording && !pending && (
        <MentionSuggestions
          options={mentionOptions}
          onPick={(o) => {
            setText((x) => applyMention(x, o.insert));
            setMentionQ(null);
            inputRef.current?.focus();
          }}
        />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
        {recording ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: FAB, paddingHorizontal: 14, borderRadius: 22, backgroundColor: t.bg, boxShadow: t.inset } as ViewStyle}>
            <RecDot />
            <T v="body" style={{ fontVariant: ['tabular-nums'], fontWeight: '700' }}>{fmt(recSec)}</T>
            <T v="sub" style={{ flex: 1 }} numberOfLines={1}>Merekam pesan suara…</T>
            <Pressable onPress={() => stopRec(false)} hitSlop={10} accessibilityLabel="Batalkan rekaman">
              <Icon name="trash" size={19} color={t.danger} />
            </Pressable>
          </View>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', minHeight: FAB, paddingLeft: 2, paddingRight: 2, borderRadius: 22, backgroundColor: t.bg, boxShadow: t.inset } as ViewStyle}>
            <Pressable onPress={() => setAttach(true)} style={{ width: BTN, height: FAB, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Lampirkan berkas">
              <Icon name="paperclip" size={19} color={t.accent} />
            </Pressable>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={(s) => {
                setText(s);
                setMentionQ(activeMentionQuery(s));
                if (s) setTyping(chatId);
              }}
              placeholder={editing ? 'Edit pesan…' : 'Ketik pesan…'}
              placeholderTextColor={t.faint}
              multiline
              scrollEnabled={inputH > MAX_INPUT_H - 20}
              onContentSizeChange={(e) => setInputH(Math.min(e.nativeEvent.contentSize.height, MAX_INPUT_H))}
              maxLength={4000}
              onKeyPress={(e: any) => {
                if (Platform.OS === 'web' && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
                  e.preventDefault?.();
                  submit();
                }
              }}
              style={[
                font,
                {
                  flex: 1,
                  color: t.text,
                  fontSize: 15,
                  lineHeight: 20,
                  minHeight: FAB,
                  paddingTop: 9,
                  paddingBottom: 9,
                  textAlignVertical: 'center',
                  ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', resize: 'none' } as object) : {}),
                },
              ]}
            />
            <Pressable onPress={() => setPanel(panel === 'emoji' ? null : 'emoji')} style={{ width: BTN, height: FAB, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Emoji dan stiker">
              <Icon name={panel === 'emoji' ? 'type' : 'smile'} size={19} color={text ? t.sub : t.accent} />
            </Pressable>
            {!text && !editing && (
              <Pressable onPress={async () => preparePicked(await pickCamera())} style={{ width: BTN, height: FAB, alignItems: 'center', justifyContent: 'center', marginRight: 4 }} accessibilityLabel="Kamera">
                <Icon name="camera" size={19} color={t.sub} />
              </Pressable>
            )}
          </View>
        )}
        <Pressable
          disabled={busy}
          onPress={() => (recording ? stopRec(true) : text.trim() ? submit() : startRec())}
          accessibilityLabel={recording ? 'Kirim pesan suara' : text.trim() ? 'Kirim pesan' : 'Rekam pesan suara'}
          style={({ pressed }) =>
            ({
              width: FAB,
              height: FAB,
              borderRadius: FAB / 2,
              backgroundColor: t.accent,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.93 : 1 }],
              boxShadow: pressed ? 'inset 2px 2px 6px rgba(0,0,0,0.25)' : '0px 6px 14px rgba(30,107,255,0.35)',
              opacity: busy ? 0.6 : 1,
            } as ViewStyle)
          }
        >
          {busy ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Icon
              name={recording ? 'send' : text.trim() ? (editing ? 'check' : 'send') : 'mic'}
              size={18}
              color="#fff"
              style={{ marginLeft: !recording && text.trim() && !editing ? 2 : 0 }}
            />
          )}
        </Pressable>
      </View>

      {/* inline emoji panel (kept mounted for quick switching) */}
      {panel === 'emoji' && !recording && (
        <View style={{ marginTop: 6, borderRadius: R.md, backgroundColor: t.bg, boxShadow: t.insetSm, padding: 8 } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <View style={{ flex: 1 }}>
              <Segmented
                value="emoji"
                onChange={() => setPanel('sticker')}
                options={[{ value: 'emoji', label: 'Emoji' }, { value: 'sticker', label: 'Stiker' }]}
              />
            </View>
            <Pressable onPress={() => setPanel(null)} hitSlop={10} style={{ marginLeft: 8 }} accessibilityLabel="Tutup panel emoji">
              <Icon name="x" size={17} color={t.sub} />
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
            {EMOJI_SET.map((e: string) => (
              <Pressable key={e} onPress={() => setText((x) => (x + e).slice(0, 4000))} style={({ pressed }) => ({ width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: pressed ? t.accentSoft : 'transparent' })}>
                <AppleEmoji e={e} size={27} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <Sheet
        visible={attach}
        onClose={() => setAttach(false)}
        title="Kirim lampiran"
        options={[
          { icon: 'camera', label: 'Kamera', onPress: async () => preparePicked(await pickCamera()) },
          { icon: 'images', label: 'Galeri foto & video', color: '#7B61FF', onPress: async () => preparePicked(await pickGallery('all')) },
          { icon: 'images', label: 'Beberapa foto (maks 4)', color: '#7B61FF', onPress: async () => sendMultiple(await pickMultipleImages(4)) },
          { icon: 'document-text', label: 'Dokumen', color: '#FF9F0A', onPress: async () => preparePicked(await pickDocument(false)) },
          { icon: 'musical-notes', label: 'Audio', color: '#FF5A8A', onPress: async () => preparePicked(await pickDocument(true)) },
          { icon: 'location', label: 'Lokasi', color: '#14C47A', onPress: sendLocation },
          { icon: 'person', label: 'Kontak', color: '#1E6BFF', onPress: () => setContactOpen(true) },
          { icon: 'mic', label: 'Pesan suara', color: '#14C47A', onPress: startRec },
          ...(canPoll ? [{ icon: 'stats-chart' as const, label: 'Polling / Vote', color: '#FF7A9C', onPress: () => setPollOpen(true) }] : []),
        ]}
      />
      {/* Sheet polling / vote ala WhatsApp */}
      <Sheet visible={pollOpen} onClose={() => setPollOpen(false)} title="Buat polling">
        <View style={{ gap: 12 }}>
          <TextInput
            value={pollQ}
            onChangeText={setPollQ}
            placeholder="Pertanyaan polling…"
            placeholderTextColor={t.faint}
            maxLength={120}
            style={[font, { color: t.text, fontSize: 15, paddingVertical: 11, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: t.bg2 }]}
          />
          {pollOpts.map((o, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={o}
                onChangeText={(v) => setPollOpts((x) => x.map((y, j) => (j === i ? v : y)))}
                placeholder={`Pilihan ${i + 1}`}
                placeholderTextColor={t.faint}
                maxLength={60}
                style={[font, { flex: 1, color: t.text, fontSize: 15, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: t.bg2 }]}
              />
              {pollOpts.length > 2 && i >= 2 && (
                <Pressable onPress={() => setPollOpts((x) => x.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel="Hapus pilihan">
                  <Icon name="x" size={18} color={t.danger} />
                </Pressable>
              )}
            </View>
          ))}
          {pollOpts.length < 6 && (
            <Btn small variant="ghost" icon="add" title="Tambah pilihan" onPress={() => setPollOpts((x) => [...x, ''])} />
          )}
          <Pressable onPress={() => setPollMulti(!pollMulti)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
            <Ionicons name={pollMulti ? 'checkbox' : 'square-outline'} size={20} color={t.accent} />
            <T v="sub" style={{ flex: 1 }}>Boleh pilih beberapa jawaban</T>
          </Pressable>
          <Btn small title="Kirim polling" icon="stats-chart" disabled={!pollQ.trim() || pollOpts.filter((o) => o.trim()).length < 2} onPress={sendPoll} />
        </View>
      </Sheet>
      <Sheet visible={contactOpen} onClose={() => setContactOpen(false)} title="Kirim kontak">
        <View style={{ gap: 10 }}>
          <TextInput
            value={cName}
            onChangeText={setCName}
            placeholder="Nama kontak"
            placeholderTextColor={t.faint}
            style={[font, { color: t.text, fontSize: 15, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: t.bg2 }]}
            maxLength={80}
          />
          <TextInput
            value={cPhone}
            onChangeText={setCPhone}
            placeholder="Nomor telepon (mis. +62812…)"
            placeholderTextColor={t.faint}
            keyboardType="phone-pad"
            style={[font, { color: t.text, fontSize: 15, paddingVertical: 10, paddingHorizontal: 12, borderRadius: R.md, backgroundColor: t.bg2 }]}
            maxLength={24}
          />
          <Btn small variant="primary" icon="send" title="Kirim kontak" disabled={!cName.trim() || !cPhone.trim()} onPress={sendContact} />
        </View>
      </Sheet>
      <Sheet
        visible={panel === 'sticker'}
        onClose={() => setPanel(null)}
      >
        <View style={{ marginBottom: 12 }}>
          <Segmented
            value="sticker"
            onChange={() => setPanel('emoji')}
            options={[{ value: 'emoji', label: 'Emoji' }, { value: 'sticker', label: 'Stiker' }]}
          />
        </View>
        <View style={{ gap: 12 }}>
          {/* ======== STIKER BRAT — ketik teks → stiker muncul → favorit → kirim ======== */}
          {!bratMode ? (
            <Btn small variant="neu" icon="text" title="Stiker Brat dari teks" onPress={() => (setBratMode(true), setBratUrl(null))} />
          ) : (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TextInput
                  value={bratText}
                  onChangeText={setBratText}
                  placeholder="Ketik teks stiker Brat…"
                  placeholderTextColor={t.faint}
                  maxLength={90}
                  style={{ flex: 1, minHeight: 40, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8, color: t.text, backgroundColor: t.bg2, fontSize: 14 }}
                />
                <Btn
                  small
                  icon="sparkles"
                  title="Buat"
                  loading={bratBusy}
                  disabled={!bratText.trim()}
                  onPress={async () => {
                    setBratBusy(true);
                    try {
                      const r = await bratSticker(bratText.trim());
                      setBratUrl(r.url ?? r.dataUrl ?? null);
                    } catch (e: any) {
                      pushBanner({ title: 'Stiker Brat gagal', body: String(e?.message ?? 'Coba lagi.').slice(0, 140), icon: 'alert' });
                    } finally {
                      setBratBusy(false);
                    }
                  }}
                />
              </View>
              {!!bratUrl && (
                <View style={{ alignItems: 'center', gap: 10 }}>
                  <Image source={{ uri: bratUrl }} style={{ width: 150, height: 150, borderRadius: 14, backgroundColor: t.bg2 }} contentFit="contain" />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Btn
                      small
                      icon="star"
                      title="Tambah ke favorit"
                      onPress={() => {
                        const s = createSticker(bratUrl);
                        if (s) pushBanner({ title: 'Masuk favorit', body: 'Ketuk stiker di bawah untuk mengirim.', icon: 'star' });
                      }}
                    />
                    <Btn
                      small
                      variant="primary"
                      icon="send"
                      title="Kirim"
                      onPress={() => {
                        send({ type: 'sticker', uri: bratUrl });
                        setPanel(null);
                        setBratMode(false);
                        setBratUrl(null);
                        setBratText('');
                      }}
                    />
                  </View>
                </View>
              )}
              <Btn small variant="ghost" title="Tutup Brat" onPress={() => (setBratMode(false), setBratUrl(null))} />
            </View>
          )}
          {!bratMode && (
            <Btn
              small
              variant="neu"
              icon="add-circle"
              title="Buat stiker dari foto"
              onPress={async () => {
                const p = await pickGallery('images');
                if (!p) return;
                try {
                  setBusy(true);
                  const prepared = await prepareForSend(p, chatId);
                  const res = await prepared.upload!();
                  createSticker(res.url, me.role === 'admin' || !!me.developer);
                  pushBanner({ title: 'Stiker dibuat', body: 'Ketuk untuk mengirim', icon: 'sticker' });
                } catch (e: any) {
                  pushBanner({ title: 'Gagal membuat stiker', body: e?.message ?? 'Coba lagi.', icon: 'alert' });
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
          {!bratMode && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
              {[...stickersFor(me.id, db), ...DEFAULT_STICKERS].map((st: any) => (
                <Pressable
                  key={st.id}
                  onPress={() => {
                    send({ type: 'sticker', uri: st.uri });
                    setPanel(null);
                  }}
                  style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.accentSoft : 'transparent' })}
                >
                  <Image source={{ uri: st.uri }} style={{ width: 64, height: 64 }} contentFit="contain" />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </Sheet>
    </View>
  );
}
