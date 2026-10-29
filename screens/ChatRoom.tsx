import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, Screen, IconBtn, Avatar, T, Btn, Empty, Toggle } from '../components/ui';
import MessageBubble from '../components/MessageBubble';
import Composer from '../components/Composer';
import { Sheet } from '../components/Sheet';
import { TypingDots, TypingSubtitle } from '../components/TypingDots';
import { VerifiedBadge } from '../lib/icons';
import ChatBannedScreen from './ChatBannedScreen';
import { useTheme, R } from '../lib/theme';
import { AI_PROVIDERS, listAIModels } from '../lib/ai';
import {
  useStore,
  chatTitle,
  chatPeer,
  isOnline,
  canSee,
  typingUsers,
  markRead,
  react,
  toggleStar,
  deleteForMe,
  deleteForAll,
  forwardMessage,
  reportMessage,
  toggleFollow,
  toggleBlock,
  isMember,
  lastMessage,
  createSticker,
  chatBannedNow,
  chatVerified,
  chatBadge,
  isFullAdmin,
  subscribeMessages,
  unsubscribeMessages,
  loadOlder,
  markDelivered,
  askAssistant,
} from '../lib/store';
import type { AskOpts } from '../lib/store';
import { setActiveChat, pushBanner } from '../lib/bus';
import { ago, dayLabel } from '../lib/format';
import { Message } from '../lib/types';
import { placeCall } from './tabs/CallsTab';
import FirePet from '../components/FirePet';
import { fireState, reviveFire, FIRE_MIN_STREAK, REVIVES_PER_MONTH } from '../lib/streak';

const EMOJIS = ['\u2764\uFE0F', '\u{1F44D}', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}', '\u{1F525}'];

type Item = { kind: 'msg'; m: Message; showName: boolean } | { kind: 'day'; label: string; id: string };

export default function ChatRoom() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const chatId: string = route.params?.chatId;
  const { db, me } = useStore();
  const chat = db.chats[chatId];
  const [sel, setSel] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [aiPrefs, setAiPrefs] = useState<{ model: string; thinking: boolean; search: boolean }>({ model: '', thinking: false, search: false });
  const [aiSheet, setAiSheet] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [editing, setEditing] = useState<Message | null>(null);
  const [forwarding, setForwarding] = useState<Message | null>(null);
  const [fwdTargets, setFwdTargets] = useState<string[]>([]);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [petOpen, setPetOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [search, setSearch] = useState(false);
  const [awayFromNewest, setAwayFromNewest] = useState(0);
  const listRef = useRef<FlatList<Item>>(null);

  // Firestore realtime subscription for this room (cleaned up on unmount)
  useEffect(() => {
    subscribeMessages(chatId);
    return () => unsubscribeMessages(chatId);
  }, [chatId]);

  // re-render periodik saat seseorang mengetik — bubble typing muncul/hilang real-time
  const typingNow = Object.entries(chat?.typing ?? {}).some(([u, ts]) => u !== me?.id && (ts as number) > 0 && Date.now() - (ts as number) < 6000);
  const [, tickTick] = useState(0);
  useEffect(() => {
    if (!typingNow) return;
    const iv = setInterval(() => tickTick((x) => x + 1), 1500);
    return () => clearInterval(iv);
  }, [typingNow]);

  useFocusEffect(
    useCallback(() => {
      setActiveChat(chatId);
      return () => setActiveChat(null);
    }, [chatId])
  );

  const msgs = db.messages[chatId];
  useEffect(() => {
    markRead(chatId);
    // mark delivered receipts for incoming messages
    if (me && msgs?.length) markDelivered(chatId, msgs);
  }, [chatId, msgs?.length]);

  const items: Item[] = useMemo(() => {
    if (!me) return [];
    const list = (msgs ?? []).filter((m) => !m.deletedFor.includes(me.id) && !(me.blocked.includes(m.senderId) && chat?.type !== 'direct'));
    const out: Item[] = [];
    let lastDay = '';
    list.forEach((m, i) => {
      const d = new Date(m.createdAt).toDateString();
      if (d !== lastDay) {
        out.push({ kind: 'day', label: dayLabel(m.createdAt), id: 'day' + d });
        lastDay = d;
      }
      const prev = list[i - 1];
      const showName = chat?.type !== 'direct' && chat?.type !== 'ai' && (!prev || prev.senderId !== m.senderId || prev.type === 'system' || new Date(prev.createdAt).toDateString() !== d);
      out.push({ kind: 'msg', m, showName });
    });
    return out.reverse();
  }, [msgs, me, chat?.type]);

  if (!me) return null;
  if (!chat || !isMember(chat, me.id) && chat.type !== 'channel') {
    return (
      <Screen>
        <Header title="Chat" />
        <Empty icon="alert-circle-outline" title="Chat tidak tersedia" body="Kamu bukan anggota chat ini atau chat telah dihapus." />
      </Screen>
    );
  }
  // GRUP/SALURAN DIBANNED → layar tinjauan penuh (alasan + banding), bukan banner.
  // Admin/developer tetap masuk normal untuk moderasi.
  if (chatBannedNow(chat) && !isFullAdmin(me)) {
    return <ChatBannedScreen chat={chat} onBack={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Main'))} />;
  }

  const peer = chatPeer(chat, me.id, db);
  // chat AI: nama/subjudul/avatar ikut profil publik Zeroid AI (config/ai_profile, diubah developer)
  const aiProf = db.aiProfile;
  const title = chat.type === 'ai' ? aiProf?.name?.trim() || chat.name || 'Zeroid AI' : chatTitle(chat, me.id, db);
  const typing = typingUsers(chat, me.id);
  let subtitle = '';
  if (typing.length) subtitle = chat.type === 'direct' || chat.type === 'ai' ? 'mengetik…' : `${db.users[typing[0]]?.name.split(' ')[0]} mengetik…`;
  else if (chat.type === 'direct' && peer) {
    if (me.blocked.includes(peer.id)) subtitle = 'diblokir';
    else if (canSee(me, peer, peer.privacy.lastSeen) && canSee(peer, me, me.privacy.lastSeen)) subtitle = isOnline(peer) ? 'online' : `terakhir dilihat ${ago(peer.lastSeen)}`;
    else subtitle = 'ketuk untuk info kontak';
  } else if (chat.type === 'ai') subtitle = aiProf?.bio?.trim() || 'Asisten AI · selalu online';
  else if (chat.type === 'group') subtitle = chat.members.map((u) => (u === me.id ? 'Kamu' : db.users[u]?.name.split(' ')[0])).join(', ');
  else if (chat.type === 'channel') subtitle = `${chat.members.length} pengikut`;
  else if (chat.type === 'global') subtitle = `${Object.values(db.users).length} anggota · terbuka untuk semua`;

  const canPost = chat.type !== 'channel' || chat.admins.includes(me.id) || me.role === 'admin';
  const blocked = chat.type === 'direct' && peer && me.blocked.includes(peer.id);
  const callable = chat.type === 'direct'; // panggilan WebRTC hanya chat pribadi (infra peer-to-peer)
  const st = fireState(chat, me); // streak api chat ini (rawat bareng semua anggota)

  const jumpTo = (id: string) => {
    const idx = items.findIndex((x) => x.kind === 'msg' && x.m.id === id);
    if (idx >= 0) {
      listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      setHighlight(id);
      setTimeout(() => setHighlight(null), 1600);
    }
  };

  const mine = sel?.senderId === me.id;
  const canEdit = sel && mine && sel.type === 'text' && !sel.deletedForAll && Date.now() - sel.createdAt < 15 * 60000;
  const forwardTargets = Object.values(db.chats)
    .filter((c) => isMember(c, me.id) && c.type !== 'channel' && c.id !== chatId)
    .sort((a, b) => (lastMessage(b.id, me.id)?.createdAt ?? 0) - (lastMessage(a.id, me.id)?.createdAt ?? 0));

  return (
    <Screen>
      <Header
        title={title}
        subtitle={subtitle}
        subtitleNode={typing.length ? <TypingSubtitle name={chat.type === 'direct' || chat.type === 'ai' ? undefined : db.users[typing[0]]?.name.split(' ')[0]} /> : undefined}
        onTitlePress={() => nav.navigate('ChatInfo', { chatId })}
        left={
          <Pressable onPress={() => (chat.type === 'direct' && peer ? nav.navigate('UserProfile', { userId: peer.id }) : nav.navigate('ChatInfo', { chatId }))}>
            <Avatar
              uri={chat.type === 'ai' ? aiProf?.avatar ?? null : chat.type === 'direct' ? (canSee(me, peer, peer?.privacy.profilePhoto ?? 'everyone') ? peer?.avatar : null) : chat.avatar}
              name={title}
              color={peer?.color ?? chat.color}
              size={42}
              online={chat.type === 'direct' && isOnline(peer)}
              icon={chat.type === 'ai' && !aiProf?.avatar ? 'sparkles' : chat.type === 'global' ? 'globe' : chat.type === 'channel' && !chat.avatar ? 'megaphone' : chat.type === 'group' && !chat.avatar ? 'people' : undefined}
            />
          </Pressable>
        }
        right={
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {st.count >= FIRE_MIN_STREAK && (
              <IconBtn
                icon="flame"
                size={40}
                color={st.dead ? t.faint : st.color ?? '#FF8A00'}
                onPress={() => setPetOpen(true)}
                label="Streak api & kucing"
              />
            )}
            {chat.type === 'ai' && (
              <IconBtn
                icon="sparkles"
                size={40}
                color={aiPrefs.thinking || aiPrefs.model || aiPrefs.search ? t.accent2 : t.accent}
                onPress={() => {
                  setAiSheet(true);
                  listAIModels()
                    .then(setModels)
                    .catch(() => setModels([]));
                }}
                label="Pengaturan AI"
              />
            )}
            {callable && !blocked && (
              <>
                <IconBtn icon="videocam" size={40} color={t.accent} onPress={() => placeCall(nav, chatId, true)} label="Video call" />
                <IconBtn icon="call" size={40} color={t.accent} onPress={() => placeCall(nav, chatId, false)} label="Voice call" />
              </>
            )}
            {!callable && <IconBtn icon="information-circle" size={40} onPress={() => nav.navigate('ChatInfo', { chatId })} label="Info" />}
          </View>
        }
      />
      {(chat.type === 'direct' ? !!peer && (peer.blueCheck || peer.developer || peer.role === 'admin' || peer.role === 'developer') : chatBadge(chat, db)) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.md, backgroundColor: 'rgba(0,149,246,0.10)', borderWidth: 1, borderColor: 'rgba(0,149,246,0.25)' }}>
          <VerifiedBadge size={15} animate={false} />
          <T v="caption" color={t.accent} style={{ flex: 1, fontWeight: '700' }}>
            {chat.type === 'direct'
              ? `${title} terverifikasi centang biru — akun resmi, aman untuk chat dan transaksi.`
              : `${title} terverifikasi centang biru${chatBadge(chat, db) && !chatVerified(chat) ? ' (ikut dari pemilik)' : ''}${chat.type === 'channel' ? ' — saluran resmi, aman diikuti' : ' — grup resmi, aman untuk chat'}${(chat.verifiedUntil ?? 0) > Date.now() ? ` (masa aktif ${Math.ceil(((chat.verifiedUntil ?? 0) - Date.now()) / 86400000)} hari lagi)` : ''}.`}
          </T>
        </View>
      )}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}>
        <View style={{ flex: 1, marginHorizontal: 8, borderRadius: R.xl, backgroundColor: t.bg, boxShadow: t.inset, overflow: 'hidden' } as any}>
          <FlatList
            ref={listRef}
            inverted
            data={items}
            keyExtractor={(x) => (x.kind === 'msg' ? x.m.id : x.id)}
            contentContainerStyle={{ paddingVertical: 14 }}
            onScrollToIndexFailed={() => {}}
            ListHeaderComponent={
              typing.length ? (
                <View style={{ paddingHorizontal: 14, paddingVertical: 4, alignItems: 'flex-start' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 18, backgroundColor: t.bubbleOther, boxShadow: t.raisedSm } as any}>
                    <TypingDots size={7} />
                    <T v="caption" color={t.sub} style={{ fontStyle: 'italic' }}>
                      {chat.type === 'direct' || chat.type === 'ai' ? 'sedang mengetik…' : `${db.users[typing[0]]?.name.split(' ')[0]} sedang mengetik…`}
                    </T>
                  </View>
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ transform: [{ scaleY: -1 }] }}>
                <Empty icon={chat.type === 'ai' ? 'sparkles' : 'chatbubble-ellipses-outline'} title={chat.type === 'ai' ? 'Tanya Zeroid AI' : 'Belum ada pesan'} body={chat.type === 'ai' ? 'Tanya apa saja — asisten menjawab lewat layanan AI yang aman.' : 'Kirim pesan pertama untuk memulai percakapan.'} />
              </View>
            }
            onScroll={(e) => setAwayFromNewest(Math.round(e.nativeEvent.contentOffset.y))}
            onEndReachedThreshold={0.4}
            onEndReached={() => loadOlder(chatId)}
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <View style={{ alignItems: 'center', marginVertical: 10 }}>
                  <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: R.pill, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
                    <T v="caption" style={{ fontWeight: '600' }}>
                      {item.label}
                    </T>
                  </View>
                </View>
              ) : (
                <MessageBubble
                  m={item.m}
                  chat={chat}
                  db={db}
                  me={me}
                  showName={item.showName}
                  highlighted={highlight === item.m.id}
                  onLongPress={() => item.m.type !== 'system' && setSel(item.m)}
                  onOpenMedia={(m) => nav.navigate('MediaViewer', { uri: m.uri, type: m.type, caption: m.text })}
                  onReplyPress={jumpTo}
                  onReply={canPost && !blocked ? () => setReplyTo(item.m) : undefined}
                  onOpenUser={(uid) => uid && uid !== me.id && nav.navigate('UserProfile', { userId: uid })}
                />
              )
            }
          />
        </View>
        <View style={{ paddingBottom: insets.bottom }}>
          {awayFromNewest > 260 && (
            <View style={{ position: 'absolute', bottom: 12, right: 14, zIndex: 10 }} pointerEvents="box-none">
              <Pressable
                onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
                accessibilityLabel="Kembali ke pesan terbaru"
                style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.92 : 1 }], boxShadow: '0px 8px 20px rgba(30,107,255,0.4)' } as any)}
              >
                <Ionicons name="chevron-down" size={22} color="#fff" />
              </Pressable>
            </View>
          )}
          {blocked ? (
            <View style={{ padding: 16, alignItems: 'center', gap: 10 }}>
              <T v="sub">Kamu memblokir kontak ini.</T>
              <Btn small title="Buka blokir" icon="lock-open" onPress={() => peer && toggleBlock(peer.id)} />
            </View>
          ) : canPost ? (
            <Composer
              chatId={chatId}
              db={db}
              me={me}
              replyTo={replyTo}
              editing={editing}
              onClearReply={() => setReplyTo(null)}
              onClearEdit={() => setEditing(null)}
              onSend={
                chat.type === 'ai'
                  ? (payload) => {
                      const prompt = payload.text ?? '';
                      if (!prompt && !payload.uri) return;
                      const history = (msgs ?? [])
                        .filter((m) => m.text && !m.deletedForAll && (m.senderId === me.id || m.assistant) && m.text !== '…')
                        .slice(-8)
                        .map((m) => ({ role: (m.assistant ? 'assistant' : 'user') as 'user' | 'assistant', content: m.text! }));
                      setReplyTo(null);
                      const opts: AskOpts = { history, model: aiPrefs.model || undefined, thinking: aiPrefs.thinking, search: aiPrefs.search };
                      if (payload.uri) {
                        // foto dikirim di chat AI → dianalisis lewat endpoint vision
                        opts.imageUrl = payload.uri;
                        opts.imagePrompt = prompt || 'Jelaskan gambar ini secara detail';
                      }
                      void askAssistant(chatId, prompt, opts);
                    }
                  : undefined
              }
            />
          ) : (
            <View style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
              <Ionicons name="megaphone-outline" size={18} color={t.sub} />
              <T v="sub" style={{ flex: 1 }}>
                Hanya admin yang dapat mengirim pesan. Tekan lama untuk bereaksi.
              </T>
              <Btn small variant={chat.members.includes(me.id) ? 'neu' : 'primary'} title={chat.members.includes(me.id) ? 'Berhenti ikuti' : 'Ikuti'} onPress={() => toggleFollow(chatId)} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={aiSheet} onClose={() => setAiSheet(false)} title="Pengaturan AI">
        <View style={{ gap: 14, paddingBottom: 16 }}>
          <View style={{ gap: 8 }}>
            <T v="caption" style={{ fontWeight: '900' }}>Provider (ketik "ke + nama" di chat juga bisa)</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {AI_PROVIDERS.map((p) => {
                const on = aiPrefs.model === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setAiPrefs((x) => ({ ...x, model: on ? '' : p.id }))}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: on ? t.accent : t.bg2, borderWidth: 1, borderColor: on ? t.accent : t.border }}
                  >
                    <T v="caption" color={on ? '#fff' : t.sub} style={{ fontWeight: '800' }}>{p.label}</T>
                  </Pressable>
                );
              })}
            </View>
            {!!models.length && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
                {models.slice(0, 30).map((m) => {
                  const on = aiPrefs.model === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setAiPrefs((x) => ({ ...x, model: on ? '' : m }))}
                      style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: on ? t.accent2 : t.bg2, borderWidth: 1, borderColor: on ? t.accent2 : t.border }}
                    >
                      <T v="caption" color={on ? '#fff' : t.faint} numberOfLines={1}>{m}</T>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="bulb" size={20} color={t.accent} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '800' }}>Thinking mode</T>
              <T v="caption" color={t.faint}>DeepSeek R1 — jawaban lebih dalam, butuh waktu lebih lama</T>
            </View>
            <Toggle value={aiPrefs.thinking} onChange={(v) => setAiPrefs((x) => ({ ...x, thinking: v, search: v ? x.search : false }))} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="globe" size={20} color={t.accent} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '800' }}>Pencarian web</T>
              <T v="caption" color={t.faint}>Jawaban memakai info terbaru dari internet</T>
            </View>
            <Toggle value={aiPrefs.search} onChange={(v) => setAiPrefs((x) => ({ ...x, search: v, thinking: v ? true : x.thinking }))} />
          </View>
          <T v="caption" color={t.faint}>
            Kirim foto di chat ini untuk memicu analisis gambar (vision). Preferensi tersimpan selama sesi chat.
          </T>
        </View>
      </Sheet>

      <Sheet
        visible={!!sel}
        onClose={() => setSel(null)}
        header={
          sel && !sel.deletedForAll ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 8 }}>
              {EMOJIS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => {
                    react(chatId, sel.id, e);
                    setSel(null);
                  }}
                  style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, boxShadow: pressed || sel.reactions[me.id] === e ? t.insetSm : t.raisedSm } as any)}
                >
                  <T v="h3" style={{ fontSize: 22 }}>
                    {e}
                  </T>
                </Pressable>
              ))}
            </View>
          ) : undefined
        }
        options={
          sel
            ? [
                ...(!sel.deletedForAll ? [{ icon: 'arrow-undo' as const, label: 'Balas', onPress: () => setReplyTo(sel) }] : []),
                ...(sel.text && !sel.deletedForAll ? [{ icon: 'copy' as const, label: 'Salin teks', onPress: () => (Clipboard.setStringAsync(sel.text ?? ''), pushBanner({ title: 'Disalin', body: 'Teks pesan disalin ke clipboard', icon: 'copy' })) }] : []),
                ...(!sel.deletedForAll ? [{ icon: 'arrow-redo' as const, label: 'Teruskan', onPress: () => (setFwdTargets([]), setForwarding(sel)) }] : []),
                ...(sel.type === 'image' && sel.uri && !sel.deletedForAll ? [{ icon: 'happy' as const, label: 'Jadikan stiker', onPress: () => (createSticker(sel.uri!), pushBanner({ title: 'Stiker dibuat', body: 'Tersimpan di koleksi stikermu', icon: 'happy' })) }] : []),
                ...(!sel.deletedForAll ? [{ icon: 'star' as const, label: sel.starredBy.includes(me.id) ? 'Hapus bintang' : 'Bintangi', onPress: () => toggleStar(chatId, sel.id) }] : []),
                ...(canEdit ? [{ icon: 'pencil' as const, label: 'Edit', onPress: () => setEditing(sel) }] : []),
                ...(!mine && !sel.deletedForAll ? [{ icon: 'flag' as const, label: 'Laporkan ke admin', onPress: () => setReporting(sel) }] : []),
                { icon: 'trash-outline' as const, label: 'Hapus untuk saya', danger: true, onPress: () => deleteForMe(chatId, sel.id) },
                ...((mine || me.role === 'admin' || chat.admins.includes(me.id)) && !sel.deletedForAll ? [{ icon: 'trash' as const, label: 'Hapus untuk semua', danger: true, onPress: () => deleteForAll(chatId, sel.id) }] : []),
              ]
            : []
        }
      />

      <Sheet visible={!!forwarding} onClose={() => setForwarding(null)} title="Teruskan ke…">
        <ScrollView style={{ maxHeight: 380 }}>
          {forwardTargets.map((c) => {
            const on = fwdTargets.includes(c.id);
            const p = chatPeer(c, me.id, db);
            return (
              <Pressable key={c.id} onPress={() => setFwdTargets(on ? fwdTargets.filter((x) => x !== c.id) : [...fwdTargets, c.id])} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 6 }}>
                <Avatar uri={p?.avatar ?? c.avatar} name={chatTitle(c, me.id, db)} color={p?.color ?? c.color} size={42} icon={c.type === 'global' ? 'globe' : c.type === 'group' && !c.avatar ? 'people' : c.type === 'ai' ? 'sparkles' : undefined} />
                <T v="body" style={{ flex: 1, fontWeight: '500' }} numberOfLines={1}>
                  {chatTitle(c, me.id, db)}
                </T>
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? t.accent : t.faint} />
              </Pressable>
            );
          })}
        </ScrollView>
        <Btn
          title={`Kirim${fwdTargets.length ? ` (${fwdTargets.length})` : ''}`}
          icon="send"
          disabled={!fwdTargets.length}
          style={{ marginTop: 14 }}
          onPress={() => {
            if (forwarding) forwardMessage(forwarding, fwdTargets);
            pushBanner({ title: 'Diteruskan', body: `Pesan diteruskan ke ${fwdTargets.length} chat`, icon: 'arrow-redo' });
            setForwarding(null);
          }}
        />
      </Sheet>

      <Sheet
        visible={petOpen}
        onClose={() => setPetOpen(false)}
        title="Api & kucing streak"
      >
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <FirePet count={st.count} color={st.color} lit={!st.dead} dimmed={st.dimmed} size={120} />
          <T v="h2" style={{ fontWeight: '900' }}>
            {st.dead ? 'Api padam' : st.count >= FIRE_MIN_STREAK ? `${st.count} hari beruntun!` : 'Rawat terus apinya'}
          </T>
          <T v="caption" color={t.sub} style={{ textAlign: 'center', lineHeight: 19 }}>
            Kucing ini dirawat bareng seluruh anggota chat. Kirim pesan tiap hari supaya api terus menyala —
            1 jam kosong apinya melemah, 1 hari penuh kosong apinya padam. Setiap 100 hari warna api berganti.
          </T>
          {st.dead && (
            <T v="caption" color={t.danger} style={{ textAlign: 'center' }}>
              Kesempatan hidupkan lagi: {st.revivesLeft} dari {REVIVES_PER_MONTH}x bulan ini.
            </T>
          )}
          {st.dead && (
            <Btn
              title={st.reviveable ? 'Hidupkan api lagi (1 kesempatan)' : 'Lewat 7 hari — mulai dari awal'}
              icon="flame"
              disabled={!st.reviveable || st.revivesLeft <= 0}
              onPress={async () => {
                const r = await reviveFire(chat, me);
                if (r.ok) {
                  pushBanner({ title: 'Api menyala kembali!', body: 'Kirim pesan hari ini untuk melanjutkan streak.', icon: 'flame' });
                  setPetOpen(false);
                } else pushBanner({ title: 'Gagal', body: r.error ?? 'Coba lagi.', icon: 'alert' });
              }}
            />
          )}
          {!st.dead && st.count >= FIRE_MIN_STREAK && (
            <T v="caption" color={st.dimmed ? t.danger : t.success}>
              {st.dimmed ? 'Api melemah — 1 jam tanpa pesan. Kirim pesan sekarang!' : 'Api menyala penuh — pertahankan!'}
            </T>
          )}
        </View>
      </Sheet>

      <Sheet
        visible={!!reporting}
        onClose={() => setReporting(null)}
        title="Alasan laporan"
        options={['Spam', 'Konten tidak pantas', 'Pelecehan', 'Penipuan'].map((r) => ({
          icon: 'flag' as const,
          label: r,
          onPress: () => {
            if (reporting) reportMessage(reporting, r);
            pushBanner({ title: 'Laporan terkirim', body: 'Terima kasih, admin akan meninjau pesan ini.', icon: 'shield-checkmark' });
          },
        }))}
      />
    </Screen>
  );
}
