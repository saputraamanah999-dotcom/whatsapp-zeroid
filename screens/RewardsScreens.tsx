import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { Avatar, Btn, Card, Empty, Header, Row, Screen, Segmented, T, UserBadges } from '../components/ui';
import { useTheme, type Theme } from '../lib/theme';
import { useStore, topKoin, topStreaks } from '../lib/store';
import { dailyCheckIn, fmtKoin, koinToRp, refCodeFor, shareReferral, CHECKIN_BASE, CHECKIN_STREAK_BONUS, REF_REWARD_REFERRER, REF_REWARD_NEWBIE } from '../lib/points';
import { fireColor } from '../lib/streak';
import { LeaderRow } from '../lib/types';
import { pushBanner } from '../lib/bus';

/** KOIN & AJAK TEMAN — saldo, check-in harian, link referral otomatis. */
export function RewardsScreen() {
  const { me } = useStore();
  const t = useTheme() as Theme;
  const nav = useNavigation<any>();
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false); // disable instan setelah check-in (anti tap-tap)
  if (!me) return null;
  const code = me.referralCode ?? refCodeFor(me.id);
  const link = `https://whatsapp-zeroid.vercel.app/?ref=${code}`;
  const canCheckIn = !claimed && Date.now() - (me.lastCheckinAt ?? 0) >= 20 * 3600000;
  const nextIn = Math.max(0, 20 * 3600000 - (Date.now() - (me.lastCheckinAt ?? 0)));
  const nextH = Math.floor(nextIn / 3600000), nextM = Math.ceil((nextIn % 3600000) / 60000);

  const doCheckIn = async () => {
    if (!canCheckIn || claiming) return;
    setClaiming(true);
    const r = await dailyCheckIn(me);
    setClaiming(false);
    if (r.ok) {
      setClaimed(true);
      pushBanner({ title: 'Check-in berhasil', body: `+${(r.reward ?? 0).toLocaleString('id-ID')} koin masuk! Kembali lagi besok untuk +${CHECKIN_BASE} koin lagi.`, icon: 'gift' });
    } else pushBanner({ title: 'Check-in', body: r.error ?? 'Coba lagi nanti.', icon: 'alert' });
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(link);
    pushBanner({ title: 'Link disalin', body: 'Tempel di chat WA, IG, atau mana saja — koin otomatis masuk bila temanmu daftar.', icon: 'checkmark-circle' });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Koin & Ajak Teman" subtitle={`${fmtKoin(me.points ?? 0)} koin ≈ Rp${fmtKoin(koinToRp(me.points ?? 0))}`} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {/* SALDO + CHECK-IN */}
        <Card title="Check-in harian">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ width: 74, height: 64, alignItems: 'center', justifyContent: 'center' }}>
              <T v="h1" style={{ color: t.accent, fontWeight: '900' }}>{fmtKoin(me.points ?? 0)}</T>
              <T v="caption" color={t.sub}>koin</T>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <T v="body">Beruntun {me.checkinStreak ?? 0} hari</T>
              <T v="caption" color={t.sub}>+{CHECKIN_BASE.toLocaleString('id-ID')} koin per hari · bonus +{CHECKIN_STREAK_BONUS.toLocaleString('id-ID')} tiap 7 hari beruntun. 1 koin = Rp1.</T>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            <Btn
              title={canCheckIn ? `Check-in sekarang · +${CHECKIN_BASE.toLocaleString('id-ID')} koin` : claiming ? 'Memproses…' : `Sudah check-in — kembali dalam ${nextH}j ${nextM}m`}
              icon={canCheckIn ? 'gift' : 'checkmark-circle'}
              disabled={!canCheckIn}
              onPress={doCheckIn}
            />
            {!canCheckIn && (
              <T v="caption" color={t.faint} style={{ marginTop: 6, textAlign: 'center' }}>
                Tombol terkunci sampai besok — check-in hanya 1x per hari (dilindungi server).
              </T>
            )}
          </View>
        </Card>

        {/* AJAK TEMAN */}
        <Card title="Ajak teman, koin ngalir">
          <T v="caption" color={t.sub}>
            Bagikan link unikmu. Siapa pun yang mendaftar lewat link ini otomatis terdeteksi: kamu +{REF_REWARD_REFERRER} koin, temanmu +{REF_REWARD_NEWBIE} koin.
            Koin bisa dipakai bayar centang biru, VIP, Member, dan Keamanan di menu Premium.
          </T>
          <View style={{ marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: t.bg2 } as any}>
            <T v="caption" color={t.sub}>KODE REFERRAL</T>
            <T v="h2" style={{ fontWeight: '900', letterSpacing: 2, color: t.accent }}>{code}</T>
            <T v="caption" color={t.sub} numberOfLines={2} selectable>{link}</T>
          </View>
          <T v="body" style={{ marginTop: 10 }}>Teman berhasil diundang: {me.refCount ?? 0}</T>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Btn title="Bagikan ke WA" icon="share-social" onPress={() => shareReferral(code, me.name)} />
            </View>
            <View style={{ flex: 1 }}>
              <Btn title="Salin link" icon="copy" variant="ghost" onPress={copyLink} />
            </View>
          </View>
        </Card>

        {/* LEADERBOARD */}
        <Row icon="trophy" iconColor="#FFB300" title="Leaderboard" subtitle="Papan peringkat api & koin — siapa paling tinggi?"
          onPress={() => nav.navigate('Leaderboard')} />
        <Row icon="sparkles" iconColor={t.accent} title="Bayar dengan koin" subtitle="Centang biru, VIP, Member, Keamanan"
          onPress={() => nav.navigate('Premium')} />
      </ScrollView>
    </View>
  );
}

/** LEADERBOARD — tab Api (streak) & Koin (referral/reward). */
export function LeaderboardScreen() {
  const t = useTheme() as Theme;
  const [tab, setTab] = useState<'api' | 'koin'>('api');
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(tab === 'api' ? await topStreaks() : await topKoin());
    setLoading(false);
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  const medal = (i: number) => (i === 0 ? '#FFD54A' : i === 1 ? '#C8CDD6' : i === 2 ? '#E0A26B' : null);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="Leaderboard" subtitle={tab === 'api' ? 'Api streak tertinggi' : 'Koin terbanyak'} />
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'api', label: '🔥 Api' }, { value: 'koin', label: '🪙 Koin' }]} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
        {!loading && rows.length === 0 && (
          <Empty icon="trophy" title="Belum ada peringkat" body="Mulai chat tiap hari / ajak teman untuk naik ke papan peringkat." />
        )}
        {rows.map((r, i) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
            <View style={{ width: 34, alignItems: 'center' }}>
              {medal(i)
                ? <T v="h2" style={{ fontWeight: '900', color: medal(i)! }}>{i + 1}</T>
                : <T v="body" color={t.sub}>{i + 1}</T>}
            </View>
            <Avatar uri={r.avatar} name={r.name} size={42} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T v="body" numberOfLines={1}>{r.name}</T>
                <UserBadges user={{ blueCheck: r.badge }} size={14} />
              </View>
              <T v="caption" color={t.sub}>{tab === 'api' ? `${r.score} hari beruntun` : `${fmtKoin(r.score)} koin`}</T>
            </View>
            {tab === 'api' && fireColor(r.score) && (
              <View style={{ width: 10, height: 18, borderRadius: 5, backgroundColor: fireColor(r.score)! } as any} />
            )}
          </View>
        ))}
        {loading && <T v="body" color={t.sub}>Memuat…</T>}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({});
void s;
