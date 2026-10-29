import React, { useState } from 'react';
import { View, Pressable, Linking, Platform } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { T, Btn } from './ui';
import SwipeReply from './SwipeReply';
import { productOf, rupiah } from '../lib/products';
import { adminDecideOrder, votePoll } from '../lib/store';
import { ProductIcon, VerifiedBadge } from '../lib/icons';
import VoicePlayer from './VoicePlayer';
import { Ticks } from './ChatRow';
import MentionText from './MentionText';
import { useTheme, R } from '../lib/theme';
import { Chat, DB, Message, User } from '../lib/types';
import { messageStatus, messagePreview } from '../lib/store';
import { timeShort, bytes } from '../lib/format';

export default function MessageBubble({
  m,
  chat,
  db,
  me,
  showName,
  onLongPress,
  onOpenMedia,
  onReplyPress,
  onReply,
  highlighted,
  onOpenUser,
}: {
  m: Message;
  chat: Chat;
  db: DB;
  me: User;
  showName: boolean;
  onLongPress: () => void;
  onOpenMedia: (m: Message) => void;
  onReplyPress: (id: string) => void;
  onReply?: () => void;
  highlighted?: boolean;
  /** tap @username → buka profil orang yang disebut */
  onOpenUser?: (uid: string) => void;
}) {
  const t = useTheme();
  const mine = m.senderId === me.id && !m.assistant;
  const sender = db.users[m.senderId];
  const senderName = m.assistant ? 'Zeroid AI' : sender?.name;
  const senderColor = m.assistant ? '#7B61FF' : sender?.color ?? t.accent;
  const [showThink, setShowThink] = useState(false);

  if (m.type === 'system') {
    return (
      <View style={{ alignItems: 'center', marginVertical: 8, paddingHorizontal: 30 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.bg, paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.pill, boxShadow: t.insetSm } as any}>
          {/* verifikasi centang biru = ikon SVG resmi, bukan emoji */}
          {!!m.verified && <VerifiedBadge size={15} animate={false} />}
          <T v="caption" style={{ textAlign: 'center' }}>
            {m.text}
          </T>
        </View>
      </View>
    );
  }
  if (m.type === 'call') {
    const bad = /tak terjawab|ditolak/.test(m.text ?? '');
    return (
      <View style={{ alignItems: 'center', marginVertical: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.bg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, boxShadow: t.raisedSm } as any}>
          <Ionicons name={/video/i.test(m.text ?? '') ? 'videocam' : 'call'} size={15} color={bad ? t.danger : t.success} />
          <T v="caption">
            {m.text} · {timeShort(m.createdAt)}
          </T>
        </View>
      </View>
    );
  }

  const reply = m.replyTo ? (db.messages[m.chatId] ?? []).find((x) => x.id === m.replyTo) : undefined;  const bg = mine ? t.bubbleMe : t.bubbleOther;
  const fg = mine ? '#fff' : t.text;
  const subFg = mine ? 'rgba(255,255,255,0.75)' : t.faint;
  const reactions = Object.values(m.reactions);
  const grouped = reactions.reduce<Record<string, number>>((a, e) => ((a[e] = (a[e] ?? 0) + 1), a), {});
  const isMedia = (m.type === 'image' || m.type === 'video') && !m.deletedForAll;
  const status = messageStatus(m, chat, me.id);
  const isPoll = m.type === 'poll' && !!m.poll && !m.deletedForAll;
  const retention =
    m.mediaExpiresAt && m.mediaExpiresAt > Date.now()
      ? (m.mediaExpiresAt - Date.now() > 36 * 3600_000
          ? `tersimpan ${Math.round((m.mediaExpiresAt - Date.now()) / 86400000)} hari`
          : `tersimpan ${Math.max(1, Math.round((m.mediaExpiresAt - Date.now()) / 3600000))} jam`)
      : null;

  if (m.type === 'sticker' && !m.deletedForAll) {
    return (
      <SwipeReply onReply={() => onReply?.()} color={t.accent} disabled={!onReply}>
        <View style={{ paddingHorizontal: 12, marginVertical: 4, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          {showName && !mine && (
            <T v="caption" color={senderColor} style={{ fontWeight: '700', marginBottom: 2 }}>
              {senderName}
            </T>
          )}
          <Pressable onLongPress={onLongPress} delayLongPress={300}>
            {m.uri ? <Image source={{ uri: m.uri }} style={{ width: 120, height: 120 }} contentFit="contain" transition={150} /> : null}
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
            <T v="caption" style={{ fontSize: 11 }}>
              {timeShort(m.createdAt)}
            </T>
            {mine && <Ticks status={status} />}
          </View>
          {reactions.length > 0 && (
            <T v="caption" style={{ fontSize: 13, marginTop: 2 }}>
              {Object.keys(grouped).join(' ')}
            </T>
          )}
        </View>
      </SwipeReply>
    );
  }

  if (m.type === 'order') {
    const order = db.orders?.find((o) => o.id === m.orderId);
    const p = order ? productOf(order.product) : null;
    const isAdmin = me.role === 'admin' || me.role === 'developer';
    return (
      <View style={{ paddingHorizontal: 12, marginVertical: 6, alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 270, borderRadius: 22, padding: 16, gap: 8, backgroundColor: t.bg, boxShadow: t.raised } as any}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="receipt" size={18} color={t.accent} />
            <T v="label" color={t.accent}>
              Invoice pesanan
            </T>
          </View>
          {order && p ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {p && <ProductIcon k={p.icon} size={18} />}
                <T v="h3">
                  {p?.title} · {order.plan}
                </T>
              </View>
              <T v="h2" color={p.color}>
                {rupiah(order.price)}
              </T>
              <T v="caption">
                Metode: {order.method} · #{order.id.slice(-6).toUpperCase()}
              </T>
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: order.status === 'paid' ? t.success : order.status === 'rejected' ? t.danger : t.warning }}>
                <T v="caption" color="#fff" style={{ fontWeight: '700' }}>
                  {order.status === 'paid' ? 'Lunas' : order.status === 'rejected' ? 'Ditolak' : 'Menunggu konfirmasi admin'}
                </T>
              </View>
              {isAdmin && order.status === 'pending' && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Btn small title="Konfirmasi" icon="checkmark" onPress={() => adminDecideOrder(order.id, true)} style={{ flex: 1, height: 38 }} />
                  <Btn small variant="neu" title="Tolak" onPress={() => adminDecideOrder(order.id, false)} style={{ flex: 1, height: 38 }} />
                </View>
              )}
            </>
          ) : (
            <T v="sub">{m.text}</T>
          )}
          <T v="caption" color={t.faint} style={{ alignSelf: 'flex-end', fontSize: 11 }}>
            {timeShort(m.createdAt)}
          </T>
        </View>
      </View>
    );
  }

  if (m.type === 'poll' && m.poll && !m.deletedForAll) {
    const poll = m.poll;
    const counts = (poll.options ?? []).map((_o, i) =>
      Object.values(m.votes ?? {}).filter((v) => (Array.isArray(v) ? v : [v]).includes(i)).length
    );
    const totalVotes = counts.reduce((a, b) => a + b, 0);
    const myVote = m.votes?.[me.id];
    const myArr = Array.isArray(myVote) ? myVote : myVote != null && (myVote as number) >= 0 ? [myVote as number] : [];
    return (
      <SwipeReply onReply={() => onReply?.()} color={t.accent} disabled={!onReply}>
        <Animated.View entering={FadeInUp.duration(220)} style={{ paddingHorizontal: 12, marginVertical: 4, alignItems: mine ? 'flex-end' : 'flex-start' }}>
          {showName && !mine && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <T v="caption" color={senderColor} style={{ fontWeight: '700' }}>{senderName ?? 'Pengguna'}</T>
              {/* centang biru: pembeli + developer/admin */}
              {(sender?.blueCheck || sender?.developer || sender?.role === 'admin' || sender?.role === 'developer') && <VerifiedBadge size={12} animate={false} />}
            </View>
          )}
          <View style={{ width: 272, borderRadius: 20, padding: 14, gap: 9, backgroundColor: t.bg, boxShadow: t.raised } as any}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name="stats-chart" size={16} color={t.accent} />
              <T v="h3" style={{ flex: 1, fontSize: 15 }}>{m.text ?? 'Polling'}</T>
            </View>
            {(poll.options ?? []).map((opt, i) => {
              const voted = myArr.includes(i);
              const pct = totalVotes ? Math.round((counts[i] / totalVotes) * 100) : 0;
              return (
                <Pressable
                  key={i}
                  onPress={() => votePoll(m.chatId, m.id, i)}
                  style={({ pressed }) => ({ borderRadius: 12, borderWidth: 1.5, borderColor: voted ? t.accent : t.border, backgroundColor: pressed ? t.accentSoft : 'transparent', overflow: 'hidden' })}
                >
                  <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: t.accentSoft }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10 }}>
                    <Ionicons name={voted ? 'checkmark-circle' : poll.multi ? 'square-outline' : 'ellipse-outline'} size={18} color={voted ? t.accent : t.faint} />
                    <T v="sub" style={{ flex: 1, fontWeight: voted ? '700' : '400' }} numberOfLines={2}>{opt}</T>
                    <T v="caption" color={t.sub}>{counts[i]}</T>
                  </View>
                </Pressable>
              );
            })}
            <T v="caption" color={t.faint}>
              {totalVotes} suara{poll.multi ? ' · boleh pilih beberapa' : ''} · ketuk pilihan untuk vote
            </T>
          </View>
          <T v="caption" color={t.faint} style={{ fontSize: 11, marginTop: 3, marginHorizontal: 6 }}>{timeShort(m.createdAt)}</T>
        </Animated.View>
      </SwipeReply>
    );
  }

  return (
    <SwipeReply onReply={() => onReply?.()} color={t.accent} disabled={!onReply || m.deletedForAll}>
    <Animated.View entering={FadeInUp.duration(220)} style={{ paddingHorizontal: 12, marginVertical: 3, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <Pressable
        onLongPress={onLongPress}
        delayLongPress={300}
        onPress={() => (isMedia ? onOpenMedia(m) : undefined)}
        style={({ pressed }) =>
          ({
            maxWidth: '82%',
            backgroundColor: bg,
            borderRadius: 20,
            borderBottomRightRadius: mine ? 6 : 20,
            borderBottomLeftRadius: mine ? 20 : 6,
            padding: isMedia ? 4 : 10,
            paddingHorizontal: isMedia ? 4 : 13,
            transform: [{ scale: pressed ? 0.985 : 1 }],
            boxShadow: mine ? '0px 6px 14px rgba(30,107,255,0.28)' : t.raisedSm,
            borderWidth: highlighted ? 2 : 0,
            borderColor: t.warning,
          } as any)
        }
      >
        {showName && !mine && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3, paddingHorizontal: isMedia ? 8 : 0, paddingTop: isMedia ? 4 : 0 }}>
            <T v="caption" color={senderColor} style={{ fontWeight: '700' }}>
              {senderName ?? 'Pengguna'}
            </T>
            {/* centang biru SVG resmi di samping nama (pembeli, developer, admin) */}
            {(sender?.blueCheck || sender?.developer || sender?.role === 'admin' || sender?.role === 'developer') && <VerifiedBadge size={12} animate={false} />}
            {!m.assistant && chat.admins.includes(m.senderId) && chat.type !== 'direct' ? (
              <T v="caption" color={mine ? 'rgba(255,255,255,0.8)' : t.sub} style={{ fontSize: 11 }}>· admin</T>
            ) : null}
          </View>
        )}
        {m.forwarded && !m.deletedForAll && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3, paddingHorizontal: isMedia ? 8 : 0 }}>
            <Ionicons name="arrow-redo" size={12} color={subFg} />
            <T v="caption" color={subFg} style={{ fontStyle: 'italic' }}>
              Diteruskan
            </T>
          </View>
        )}
        {reply && !m.deletedForAll && (
          <Pressable onPress={() => onReplyPress(reply.id)} style={{ borderLeftWidth: 3, borderLeftColor: mine ? '#fff' : t.accent, backgroundColor: mine ? 'rgba(255,255,255,0.16)' : t.accentSoft, borderRadius: 10, padding: 8, marginBottom: 6 }}>
            <T v="caption" color={mine ? '#fff' : t.accent} style={{ fontWeight: '700' }}>
              {reply.senderId === me.id ? 'Kamu' : db.users[reply.senderId]?.name}
            </T>
            <T v="caption" color={mine ? 'rgba(255,255,255,0.85)' : t.sub} numberOfLines={2}>
              {messagePreview(reply)}
            </T>
          </Pressable>
        )}

        {m.deletedForAll ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="ban" size={15} color={subFg} />
            <T v="body" color={subFg} style={{ fontStyle: 'italic' }}>
              {mine ? 'Kamu menghapus pesan ini' : 'Pesan ini telah dihapus'}
            </T>
          </View>
        ) : (
          <>
            {m.type === 'image' && m.uri && <Image source={{ uri: m.uri }} style={{ width: 240, height: 240, borderRadius: 16 }} contentFit="cover" transition={200} />}
            {m.type === 'image' && !m.uri && <T v="sub" color={subFg}>Foto tidak tersedia</T>}
            {m.type === 'video' && (
              <View style={{ width: 240, height: 180, borderRadius: 16, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="play" size={28} color="#fff" style={{ marginLeft: 3 }} />
                </View>
                <T v="caption" color="#fff" style={{ position: 'absolute', bottom: 8, left: 10 }}>
                  {m.fileName ?? 'Video'} {m.fileSize ? `· ${bytes(m.fileSize)}` : ''}{retention ? ` · ${retention}` : ''}
                </T>
              </View>
            )}
            {m.type === 'audio' && m.uri && <VoicePlayer uri={m.uri} seed={m.id} dur={m.duration} mine={mine} accent={t.accent} />}
            {m.type === 'location' && (
              <Pressable
                onPress={() => Linking.openURL(`https://www.google.com/maps?q=${m.lat},${m.lng}`).catch(() => {})}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: mine ? 'rgba(255,255,255,0.14)' : t.accentSoft, minWidth: 220 }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#14C47A', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="location" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="sub" color={fg} style={{ fontWeight: '600' }}>{m.locationLabel ?? 'Lokasi'}</T>
                  <T v="caption" color={subFg}>
                    {typeof m.lat === 'number' ? `${m.lat.toFixed(5)}, ${typeof m.lng === 'number' ? m.lng.toFixed(5) : ''}` : ''}
                  </T>
                  <T v="caption" color={mine ? '#fff' : t.accent} style={{ fontWeight: '700', marginTop: 1 }}>
                    Buka di Maps ›
                  </T>
                </View>
              </Pressable>
            )}
            {m.type === 'contact' && (
              <Pressable
                onPress={() => Linking.openURL(`tel:${m.contactPhone ?? ''}`).catch(() => {})}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, backgroundColor: mine ? 'rgba(255,255,255,0.14)' : t.accentSoft, minWidth: 220 }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="sub" color={fg} numberOfLines={1} style={{ fontWeight: '600' }}>{m.contactName ?? 'Kontak'}</T>
                  <T v="caption" color={subFg} selectable>{m.contactPhone}</T>
                  <T v="caption" color={mine ? '#fff' : t.accent} style={{ fontWeight: '700', marginTop: 1 }}>
                    Panggil ›
                  </T>
                </View>
              </Pressable>
            )}
            {m.assistant && !!m.reasoning && (
              <View style={{ marginBottom: 6, borderRadius: 12, backgroundColor: mine ? 'rgba(255,255,255,0.12)' : 'rgba(123,97,255,0.08)', padding: 8 }}>
                <Pressable onPress={() => setShowThink((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }} hitSlop={6}>
                  <Ionicons name="sparkles" size={12} color={mine ? '#fff' : '#7B61FF'} />
                  <T v="caption" color={mine ? '#fff' : '#7B61FF'} style={{ fontWeight: '700' }}>
                    {showThink ? 'Sembunyikan proses berpikir' : 'Lihat proses berpikir'}
                  </T>
                </Pressable>
                {showThink && (
                  <T v="caption" color={mine ? 'rgba(255,255,255,0.9)' : t.sub} style={{ marginTop: 5, fontStyle: 'italic', lineHeight: 17, userSelect: 'none' } as any}>
                    {m.reasoning}
                  </T>
                )}
              </View>
            )}
            {m.type === 'document' && (
              <Pressable onPress={() => m.uri && (Platform.OS === 'web' ? window.open(m.uri, '_blank') : Linking.openURL(m.uri).catch(() => {}))} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 6, borderRadius: 14, backgroundColor: mine ? 'rgba(255,255,255,0.14)' : t.accentSoft, minWidth: 200 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: mine ? 'rgba(255,255,255,0.25)' : t.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="document-text" size={22} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <T v="sub" color={fg} numberOfLines={1} style={{ fontWeight: '600' }}>
                    {m.fileName ?? 'Dokumen'}
                  </T>
                  {!!retention && <T v="caption" color={subFg}>{retention}</T>}
                  <T v="caption" color={subFg}>
                    {bytes(m.fileSize) || 'File'} · {(m.fileName?.split('.').pop() ?? 'file').toUpperCase()}
                  </T>
                </View>
                <Ionicons name="download-outline" size={20} color={fg} />
              </Pressable>
            )}
            {!!m.text && (
              m.mentions?.length ? (
                <MentionText
                  text={m.text}
                  mentions={m.mentions}
                  color={fg}
                  onOpenUser={onOpenUser}
                  style={{ lineHeight: 21, paddingHorizontal: isMedia ? 8 : 0, paddingTop: isMedia ? 6 : 0, fontSize: 15, userSelect: 'none' } as any}
                />
              ) : (
                <T v="body" color={fg} style={{ lineHeight: 21, paddingHorizontal: isMedia ? 8 : 0, paddingTop: isMedia ? 6 : 0, userSelect: 'none' } as any}>
                  {m.text}
                </T>
              )
            )}
          </>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: 4, marginTop: 3, paddingHorizontal: isMedia ? 8 : 0, paddingBottom: isMedia ? 4 : 0 }}>
          {m.expiresAt && <Ionicons name="timer-outline" size={11} color={subFg} />}
          {m.starredBy.includes(me.id) && <Ionicons name="star" size={11} color={subFg} />}
          {m.editedAt && !m.deletedForAll && (
            <T v="caption" color={subFg} style={{ fontSize: 11 }}>
              diedit
            </T>
          )}
          <T v="caption" color={subFg} style={{ fontSize: 11 }}>
            {timeShort(m.createdAt)}
          </T>
          {mine && !m.deletedForAll && chat.type !== 'channel' && <Ticks status={status} color="rgba(255,255,255,0.8)" />}
        </View>
      </Pressable>
      {reactions.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 2, marginTop: -6, marginHorizontal: 10, backgroundColor: t.bg, borderRadius: R.pill, paddingHorizontal: 7, paddingVertical: 2, boxShadow: t.raisedSm } as any}>
          {Object.entries(grouped).map(([e, n]) => (
            <T key={e} v="caption" style={{ fontSize: 13 }}>
              {e}
              {n > 1 ? ` ${n}` : ''}
            </T>
          ))}
        </View>
      )}
    </Animated.View>
    </SwipeReply>
  );
}
