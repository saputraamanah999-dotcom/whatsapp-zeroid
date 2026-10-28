/**
 * Audit log — full-screen admin view (moderator+). Data streams from the
 * admin subscription in lib/store (db.audit, newest first, 80 items).
 */
import React, { useMemo, useState } from 'react';
import { View, FlatList, TextInput } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { T, Screen, Header, Empty } from '../components/ui';
import { useTheme, font, R } from '../lib/theme';
import { useStore } from '../lib/store';
import { timeShort } from '../lib/format';

const ACTION_ICON: Record<string, string> = {
  ban: 'ban',
  unban: 'ban-outline',
  set_role: 'shield',
  verify_account: 'checkmark-circle',
  toggle_bluecheck: 'ribbon',
  set_vip: 'diamond',
  broadcast: 'megaphone',
  end_announcement: 'megaphone-off',
  resolve_report: 'warning',
  delete_story: 'trash',
  maintenance: 'construct',
  decide_order: 'cash',
  regenerate_invite: 'link',
};

export default function AuditScreen() {
  const t = useTheme();
  const { db } = useStore();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return db.audit;
    return db.audit.filter((a) => `${a.actorName} ${a.action} ${a.target ?? ''} ${a.detail ?? ''}`.toLowerCase().includes(s));
  }, [db.audit, q]);

  return (
    <Screen>
      <Header title="Log audit" subtitle={`${db.audit.length} aktivitas admin`} />
      <View style={{ paddingHorizontal: 14, paddingTop: 4, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.bg, borderRadius: R.md, paddingHorizontal: 12, boxShadow: t.insetSm } as any}>
          <Ionicons name="search" size={17} color={t.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Cari aksi / admin / target…"
            placeholderTextColor={t.faint}
            maxLength={60}
            style={[font, { flex: 1, color: t.text, fontSize: 15, paddingVertical: 12 }]}
          />
        </View>
      </View>
      <FlatList
        data={list}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 14, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' }}
        renderItem={({ item: a }) => (
          <View style={{ flexDirection: 'row', gap: 12, padding: 14, marginBottom: 10, borderRadius: R.lg, backgroundColor: t.bg, boxShadow: t.raisedSm } as any}>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={((ACTION_ICON[a.action] ?? 'document-text') as any)} size={18} color={t.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <T v="sub" style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>
                  {a.action.replace(/_/g, ' ')}
                </T>
                <T v="caption" color={t.faint}>{timeShort(a.createdAt)}</T>
              </View>
              <T v="caption" color={t.sub} numberOfLines={1}>
                oleh {a.actorName}
                {a.target ? ` · target ${a.target.slice(0, 14)}` : ''}
              </T>
              {!!a.detail && (
                <T v="caption" color={t.faint} numberOfLines={2} style={{ marginTop: 2 }}>
                  {a.detail}
                </T>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<Empty icon="receipt-outline" title="Belum ada aktivitas" body="Setiap aksi admin (ban, VIP, pengumuman, pesanan…) tercatat otomatis di sini." />}
      />
    </Screen>
  );
}
