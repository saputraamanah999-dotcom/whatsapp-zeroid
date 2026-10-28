import React, { ReactNode } from 'react';
import { Modal, Pressable, View, ScrollView, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { SlideInDown, FadeIn } from 'react-native-reanimated';
import { useTheme, R } from '../lib/theme';
import { T, IconName } from './ui';

export type SheetOption = { icon: IconName; label: string; onPress: () => void; danger?: boolean; color?: string };

export function Sheet({ visible, onClose, title, children, options, header }: { visible: boolean; onClose: () => void; title?: string; children?: ReactNode; options?: SheetOption[]; header?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(150)} style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Tutup" />
        <Animated.View
          entering={SlideInDown.springify().damping(18)}
          style={{ backgroundColor: t.bg, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, paddingTop: 10, paddingBottom: insets.bottom + 16, paddingHorizontal: 18, maxHeight: '85%', boxShadow: '0px -10px 30px rgba(0,0,0,0.15)' } as ViewStyle}
        >
          <View style={{ alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: t.faint, opacity: 0.5, marginBottom: 12 }} />
          {header}
          {title && (
            <T v="h3" style={{ marginBottom: 12, marginLeft: 4 }}>
              {title}
            </T>
          )}
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {options?.map((o) => (
              <Pressable
                key={o.label}
                onPress={() => {
                  onClose();
                  setTimeout(o.onPress, 180);
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 8, borderRadius: R.md, backgroundColor: pressed ? t.accentSoft : 'transparent' })}
              >
                <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, boxShadow: t.raisedSm } as ViewStyle}>
                  <Ionicons name={o.icon} size={20} color={o.danger ? t.danger : o.color ?? t.accent} />
                </View>
                <T v="body" color={o.danger ? t.danger : t.text} style={{ fontWeight: '500' }}>
                  {o.label}
                </T>
              </Pressable>
            ))}
            {children}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export function Confirm({ visible, title, body, confirm = 'Ya', danger, onConfirm, onClose }: { visible: boolean; title: string; body?: string; confirm?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <View style={{ width: '100%', maxWidth: 380, backgroundColor: t.bg, borderRadius: R.xl, padding: 24, boxShadow: '0px 20px 40px rgba(0,0,0,0.2)' } as ViewStyle}>
          <T v="h3" style={{ fontSize: 19 }}>
            {title}
          </T>
          {body && (
            <T v="sub" style={{ marginTop: 8, lineHeight: 20 }}>
              {body}
            </T>
          )}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 22 }}>
            <Pressable onPress={onClose} style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, boxShadow: pressed ? t.insetSm : t.raisedSm } as ViewStyle)}>
              <T v="h3" style={{ fontSize: 15 }}>
                Batal
              </T>
            </Pressable>
            <Pressable
              onPress={() => {
                onClose();
                onConfirm();
              }}
              style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: danger ? t.danger : t.accent, opacity: pressed ? 0.85 : 1 })}
            >
              <T v="h3" color="#fff" style={{ fontSize: 15 }}>
                {confirm}
              </T>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
