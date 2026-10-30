/**
 * MASUKAN & BANTUAN — user menulis ide/laporan bug ke developer (SAPUTRA).
 * Balasan developer + apresiasi koin tampil real-time di sini.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, Pressable } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Header, Screen, T, Card, Btn, Segmented, NeuInput } from '../components/ui';
import { useStore } from '../lib/store';
import { useTheme, R } from '../lib/theme';
import { pushBanner } from '../lib/bus';
import { submitFeedback, subscribeMyFeedback, markFeedbackRead } from '../lib/feedback';
import { Feedback } from '../lib/types';
import { ago } from '../lib/format';

const KIND_LABEL: Record<Feedback['kind'], string> = { ide: 'Ide fitur', bug: 'Laporan bug', lainnya: 'Lainnya' };

export default function FeedbackScreen() {
  const t = useTheme();
  const { me } = useStore();
  const [list, setList] = useState<Feedback[]>([]);
  const [loadErr, setLoadErr] = useState('');
  const [kind, setKind] = useState<Feedback['kind']>('ide');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!me?.id) return;
    const unsub = subscribeMyFeedback(me.id, setList, (msg) => setLoadErr(msg.slice(0, 120)));
    return () => unsub();
  }, [me?.id]);

  const unread = useMemo(() => list.filter((f) => f.status === 'answered' && !f.readByUser).length, [list]);

  const send = async () => {
    if (!me) return;
    setSending(true);
    const r = await submitFeedback({ uid: me.id, name: me.name, text, kind });
    setSending(false);
    if (r.ok) {
      setText('');
      pushBanner({ title: 'Masukan terkirim', body: 'Terima kasih! Developer akan membaca & membalasnya di sini.', icon: 'happy' });
    } else {
      pushBanner({ title: 'Gagal mengirim', body: r.error ?? 'Coba lagi.', icon: 'alert' });
    }
  };

  return (
    <Screen>
      <Header title="Masukan & bantuan" subtitle={unread > 0 ? `${unread} balasan baru dari developer` : 'Langsung ke developer Zeroid'} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, maxWidth: 640, width: '100%', alignSelf: 'center', paddingBottom: 44 }}>
        <Card title="Tulis masukan">
          <View style={{ gap: 12 }}>
            <Segmented
              value={kind}
              onChange={(v) => setKind(v as Feedback['kind'])}
              options={[
                { value: 'ide', label: 'Ide fitur' },
                { value: 'bug', label: 'Laporan bug' },
                { value: 'lainnya', label: 'Lainnya' },
              ]}
            />
            <NeuInput
              icon="create"
              placeholder="Ceritakan idemu / masalah yang kamu temukan…"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={2000}
              style={{ minHeight: 110, paddingTop: 10, textAlignVertical: 'top' }}
            />
            <Btn
              title="Kirim ke developer"
              icon="send"
              loading={sending}
              disabled={text.trim().length < 5}
              onPress={send}
            />
            <T v="caption" color={t.faint}>
              Masukan bagus yang diterima bisa dapat APRESIASI KOIN dari developer. Semua masukan dibaca langsung oleh SAPUTRA (developer).
            </T>
          </View>
        </Card>

        <T v="label" style={{ marginLeft: 4 }}>Masukanku ({list.length})</T>
        {!!loadErr && (
          <View style={{ borderRadius: R.md, padding: 10, backgroundColor: 'rgba(255,90,95,0.1)', borderLeftWidth: 3, borderLeftColor: t.danger }}>
            <T v="caption" color={t.danger}>Daftar masukan gagal dimuat: {loadErr}</T>
          </View>
        )}
        {list.length === 0 && !loadErr && (
          <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
            <Ionicons name="chatbubbles-outline" size={40} color={t.faint} />
            <T v="sub" color={t.faint}>Belum ada masukan — jadilah yang pertama!</T>
          </View>
        )}
        {list.map((f) => {
          const answered = f.status === 'answered';
          const isNew = answered && !f.readByUser;
          return (
            <Pressable
              key={f.id}
              onPress={() => { if (isNew) markFeedbackRead(f.id); }}
              style={{
                borderRadius: R.lg,
                padding: 14,
                gap: 8,
                backgroundColor: t.bg2,
                borderWidth: isNew ? 2 : 0,
                borderColor: t.accent,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: f.kind === 'bug' ? 'rgba(255,90,95,0.14)' : f.kind === 'ide' ? 'rgba(30,107,255,0.12)' : 'rgba(148,163,184,0.16)' }}>
                  <T v="caption" style={{ fontWeight: '700' }}>{KIND_LABEL[f.kind] ?? 'Lainnya'}</T>
                </View>
                <T v="caption" color={t.faint} style={{ flex: 1 }}>{ago(f.at)}</T>
                {isNew && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: t.accent, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                    <T v="caption" color="#fff" style={{ fontSize: 10, fontWeight: '800' }}>BARU</T>
                  </View>
                )}
                {!!f.reward && f.reward > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(20,196,122,0.14)', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 }}>
                    <Ionicons name="gift" size={11} color={t.success} />
                    <T v="caption" color={t.success} style={{ fontSize: 10, fontWeight: '800' }}>+{f.reward}</T>
                  </View>
                )}
              </View>
              <T v="sub" style={{ lineHeight: 20 }}>{f.text}</T>
              {answered && !!f.reply && (
                <View style={{ borderRadius: R.md, padding: 10, gap: 4, backgroundColor: 'rgba(30,107,255,0.07)', borderLeftWidth: 3, borderLeftColor: t.accent }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Ionicons name="shield-checkmark" size={13} color={t.accent} />
                    <T v="caption" color={t.accent} style={{ fontWeight: '800' }}>
                      Balasan developer{f.handledBy ? ` · ${f.handledBy}` : ''}
                    </T>
                  </View>
                  <T v="sub" style={{ lineHeight: 19 }}>{f.reply}</T>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
