import React from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T, Avatar, Badge, UserBadges } from './ui';
import { TypingDots } from './TypingDots';
import { useTheme, R } from '../lib/theme';
import { Chat, DB, User } from '../lib/types';
import { chatTitle, chatPeer, lastMessage, chatLastMsg, messagePreview, unreadCount, isOnline, canSee, typingUsers, messageStatus, chatBadge, aiTypingIn } from '../lib/store';
import { VerifiedBadge } from '../lib/icons';
import { chatTime } from '../lib/format';
import { FireDot } from './FirePet';
import { fireColor, fireState } from '../lib/streak';

export function Ticks({ status, color }: { status: 'sending' | 'failed' | 'sent' | 'delivered' | 'read'; color?: string }) {
  const t = useTheme();
  if (status === 'sending') return <Ionicons name="time" size={15} color={color ?? t.faint} />;
  if (status === 'failed') return <Ionicons name="alert-circle" size={15} color={t.danger} />;
  if (status === 'sent') return <Ionicons name="checkmark" size={16} color={color ?? t.faint} />;
  return <Ionicons name="checkmark-done" size={16} color={status === 'read' ? (color ? '#9BE7FF' : t.accent2) : color ?? t.faint} />;
}

export default function ChatRow({ chat, me, db, onPress, onLongPress }: { chat: Chat; me: User; db: DB; onPress: () => void; onLongPress?: () => void }) {
  const t = useTheme();
  const peer = chatPeer(chat, me.id, db);
  const last = chatLastMsg(chat, me.id);
  const unread = unreadCount(chat, me.id);
  const typing = typingUsers(chat, me.id);
  // AI mengetik: Zeroid AI tak bisa menulis chat.typing — pakai flag lokal
  const aiTyping = chat.type === 'ai' && aiTypingIn(chat.id);
  const title = chatTitle(chat, me.id, db);
  const showPhoto = chat.type === 'direct' ? canSee(me, peer, peer?.privacy.profilePhoto ?? 'everyone') : true;
  const muted = chat.mutedBy.includes(me.id);
  const pinned = chat.pinnedBy.includes(me.id);
  const isGroupish = chat.type === 'group' || chat.type === 'channel' || chat.type === 'global';
  const senderName = last && isGroupish && last.type !== 'system' ? (last.senderId === me.id ? 'Kamu' : db.users[last.senderId]?.name.split(' ')[0]) : null;
  const fst = fireState(chat, me); // api streak chat (muncul mulai 3 hari)
  const fcol = fst.lit ? fireColor(fst.count) : null;
  // chat AI: judul & avatar ikut profil publik Zeroid AI (diubah developer)
  const aiName = chat.type === 'ai' ? db.aiProfile?.name?.trim() || chat.name || 'Zeroid AI' : title;
  const aiAvatar = chat.type === 'ai' ? db.aiProfile?.avatar ?? null : undefined;

  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => ({ marginHorizontal: 14, marginVertical: 5, borderRadius: R.lg, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : undefined } as any)}>
      <Avatar
        uri={chat.type === 'ai' ? aiAvatar : chat.type === 'direct' ? (showPhoto ? peer?.avatar : null) : chat.avatar}
        name={aiName}
        color={peer?.color ?? chat.color}
        online={chat.type === 'direct' && isOnline(peer) && canSee(me, peer, peer?.privacy.lastSeen ?? 'everyone')}
        icon={chat.type === 'ai' && !aiAvatar ? 'sparkles' : chat.type === 'global' ? 'globe' : chat.type === 'channel' && !chat.avatar ? 'megaphone' : chat.type === 'group' && !chat.avatar ? 'people' : undefined}
        size={54}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T v="h3" numberOfLines={1} style={{ flexShrink: 1, fontSize: 16 }}>
            {aiName}
          </T>
          {/* centang biru: SVG resmi yang sama di SEMUA tempat (chat, grup, saluran, AI) */}
          {chat.type === 'direct' ? <UserBadges user={peer} /> : chatBadge(chat, db) && <VerifiedBadge size={15} animate={false} />}
          {/* api streak: angka + api berwarna sesuai tier (contoh: 100🔥) */}
          {fcol && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
              <T v="caption" style={{ color: fcol, fontWeight: '800', fontSize: 12 }}>{fst.count}</T>
              <FireDot color={fcol} dimmed={fst.dimmed} />
            </View>
          )}
          <View style={{ flex: 1 }} />
          <T v="caption" color={unread ? t.accent : t.faint}>
            {last ? chatTime(last.createdAt) : ''}
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {typing.length || aiTyping ? (
            <TypingDots size={5} showText text={isGroupish ? `${db.users[typing[0]]?.name.split(' ')[0]} sedang mengetik…` : chat.type === 'ai' ? `${aiName} sedang mengetik…` : 'sedang mengetik…'} />
          ) : (
            <>
              {last && last.senderId === me.id && last.type !== 'system' && last.type !== 'call' && !last.deletedForAll && <Ticks status={messageStatus(last, chat, me.id)} />}
              <T v="sub" numberOfLines={1} style={{ flex: 1 }} color={unread ? t.text : t.sub}>
                {senderName ? `${senderName}: ` : ''}
                {last ? messagePreview(last) : chat.description ?? 'Mulai percakapan'}
              </T>
            </>
          )}
          {muted && <Ionicons name="volume-mute" size={15} color={t.faint} />}
          {pinned && <Ionicons name="pin" size={15} color={t.faint} />}
          <Badge n={unread} color={muted ? t.faint : undefined} />
        </View>
      </View>
    </Pressable>
  );
}
