/**
 * Cloud Functions (Firebase project: projekwhattsaf) — deploy with:
 *   cd functions && npm i firebase-functions firebase-admin && firebase deploy --only functions
 *
 * - FCM fan-out: new messages, incoming calls, story posts, call updates.
 * - Scheduled cleanup: Stories expire after 24h; WebRTC signaling docs TTL 2h.
 */
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();
const db = getFirestore();

async function tokensFor(uids: string[]): Promise<string[]> {
  const snaps = await Promise.all(uids.map((u) => db.doc(`fcm_tokens/${u}`).get()));
  return snaps.map((s) => s.get('token')).filter(Boolean);
}

function preview(m: any): string {
  switch (m?.type) {
    case 'text': return String(m.text ?? 'Pesan baru');
    case 'image': return 'Foto';
    case 'video': return 'Video';
    case 'audio': return 'Pesan suara';
    case 'document': return 'Dokumen';
    case 'sticker': return 'Stiker';
    case 'location': return 'Lokasi';
    case 'contact': return `Kontak: ${m.contactName ?? ''}`;
    default: return 'Pesan baru';
  }
}

export const onMessageCreated = onDocumentCreated('chats/{chatId}/messages/{mid}', async (ev) => {
  const m = ev.data?.data();
  if (!m || m.type === 'system') return;
  const chat = (await db.doc(`chats/${ev.params.chatId}`).get()).data();
  if (!chat) return;
  const sender = (await db.doc(`users/${m.senderId}`).get()).data();
  const targets = ((chat.members as string[]) ?? []).filter((u) => u !== m.senderId && !(chat.mutedBy ?? []).includes(u));
  const tokens = await tokensFor(targets);
  if (!tokens.length) return;
  const body = chat.type === 'direct' ? preview(m) : `${sender?.name ?? 'Seseorang'}: ${preview(m)}`;
  await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: chat.type === 'direct' ? sender?.name ?? 'Pesan baru' : chat.name ?? 'Grup', body },
    data: { chatId: ev.params.chatId, type: 'message' },
    android: { priority: 'high', notification: { channelId: chat.type === 'group' ? 'groups' : 'messages', tag: ev.params.chatId, clickAction: 'message' } },
  });
});

export const onCallCreated = onDocumentCreated('calls/{callId}', async (ev) => {
  const c = ev.data?.data();
  if (!c || c.status !== 'ringing') return;
  const caller = (await db.doc(`users/${c.callerId}`).get()).data();
  const tokens = await tokensFor(c.calleeIds ?? []);
  if (!tokens.length) return;
  await getMessaging().sendEachForMulticast({
    tokens,
    data: { callId: ev.params.callId, chatId: c.chatId, video: String(!!c.video), callerName: caller?.name ?? '', type: 'incoming_call' },
    notification: { title: caller?.name ?? 'Panggilan masuk', body: c.video ? 'Panggilan video masuk…' : 'Panggilan suara masuk…' },
    android: {
      priority: 'high',
      ttl: 30000,
      notification: { channelId: 'calls', priority: 'max', visibility: 'public', clickAction: 'incoming_call', tag: ev.params.callId, sticky: true },
    },
  });
});

export const onCallUpdated = onDocumentUpdated('calls/{callId}', async (ev) => {
  const after = ev.data?.after.data();
  if (!after || after.status === 'ringing' || after.status === 'ongoing') return;
  const tokens = await tokensFor(after.calleeIds ?? []);
  if (!tokens.length) return;
  await getMessaging().sendEachForMulticast({ tokens, data: { callId: ev.params.callId, type: 'call_ended', status: after.status }, android: { priority: 'high' } });
});

export const onStoryCreated = onDocumentCreated('stories/{sid}', async (ev) => {
  const s = ev.data?.data();
  if (!s) return;
  const owner = (await db.doc(`users/${s.userId}`).get()).data();
  const followers = (await db.collection('users').where('contacts', 'array-contains', s.userId).get()).docs.map((d) => d.id);
  const tokens = await tokensFor(followers);
  if (!tokens.length) return;
  await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: 'Story baru', body: `${owner?.name} membagikan Story baru` },
    data: { storyUserId: s.userId, type: 'story' },
    android: { notification: { channelId: 'stories' } },
  });
});

/** Housekeeping: expire stories (24h), disappearing messages, stale WebRTC signaling docs (2h). Runs hourly. */
export const cleanupExpired = onSchedule('every 60 minutes', async () => {
  const now = Date.now();
  const batch = db.batch();
  let deleted = 0;

  const stories = await db.collection('stories').where('expiresAt', '<=', now).limit(400).get();
  stories.forEach((s) => batch.delete(s.ref));
  deleted += stories.size;

  // disappearing messages: any message with expiresAt <= now (collectionGroup needs no extra index)
  try {
    const dead = await db.collectionGroup('messages').where('expiresAt', '<=', now).limit(500).get();
    dead.forEach((m) => batch.delete(m.ref));
    deleted += dead.size;
  } catch (e) {
    console.warn('expired messages purge failed', e);
  }

  const staleCalls = await db.collection('calls').where('startedAt', '<=', new Date(now - 2 * 3600000)).limit(200).get();
  for (const c of staleCalls.docs) {
    const sigs = await c.ref.collection('signals').get();
    sigs.forEach((s) => batch.delete(s.ref));
    batch.delete(c.ref);
  }
  deleted += staleCalls.size;
  await batch.commit();
  console.log(`cleanup: ${deleted} docs removed`);
});

/** Missed-call watchdog: any ringing call older than 45s becomes 'missed'. */
export const expireRingingCalls = onSchedule('every 2 minutes', async () => {
  const cutoff = new Date(Date.now() - 45000);
  const ringing = await db.collection('calls').where('status', '==', 'ringing').where('startedAt', '<=', cutoff).get();
  const batch = db.batch();
  ringing.forEach((c) => batch.update(c.ref, { status: 'missed', endedAt: FieldValue.serverTimestamp() }));
  await batch.commit();
});
