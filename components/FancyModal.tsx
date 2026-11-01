/**
 * FancyModal (v26) — modal referensi premium sesuai gambar pemilik:
 *  · variant="success" → SUCCESS MODAL: burst centang hijau + konfeti + suara
 *    CEKLING (WA0060 "Order Placed!").
 *  · variant="confirm" → CONFIRMATION MODAL: ikon lingkaran + tombol Batal/Ya
 *    (WA0053 "Save your changes?").
 *  · variant="delete"  → DELETE WARNING: ikon merah + peringatan tak-terbalik
 *    + tombol Batal/Hapus (WA0059 "Delete this item?").
 * Semua varian memainkan efek suara (lib/sfx) + getar halus.
 */
import React, { useEffect } from 'react';
import { Modal, Pressable, View, Platform } from 'react-native';
import Svg, { Circle, Path, Rect, G } from 'react-native-svg';
import Animated, { useSharedValue, withSpring, withDelay, withTiming, useAnimatedStyle, Easing } from 'react-native-reanimated';
import { T } from './ui';
import { useTheme, R } from '../lib/theme';
import { sfx, haptic } from '../lib/sfx';

const CONFETTI = ['#22c55e', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6'];

function Burst({ color = '#22c55e' }: { color?: string }) {
  // konfeti statis posisi acak-deterministik (tidak berubah antar render)
  const bits = React.useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const r = 34 + (i % 4) * 9;
        return { x: 50 + Math.cos(a) * r, y: 42 + Math.sin(a) * r, c: CONFETTI[i % CONFETTI.length], w: i % 3 === 0 ? 7 : 5, h: i % 2 === 0 ? 10 : 7, rot: (i * 47) % 90 };
      }),
    []
  );
  return (
    <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      <Svg width={132} height={132} viewBox="0 0 100 100">
        <Circle cx="50" cy="42" r="20" fill={color} opacity={0.16} />
        <Circle cx="50" cy="42" r="14" fill={color} />
        <Path d="M43 42.5 L48.4 48 L58 37.5" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <G>
          {bits.map((b, i) => (
            <Rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={2} fill={b.c} transform={`rotate(${b.rot} ${b.x} ${b.y})`} opacity={0.9} />
          ))}
        </G>
      </Svg>
    </View>
  );
}

export function FancyModal({
  visible,
  variant = 'confirm',
  title,
  body,
  confirm = 'Ya',
  cancel = 'Batal',
  onClose,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  variant?: 'success' | 'confirm' | 'delete';
  title: string;
  body?: string;
  confirm?: string;
  cancel?: string;
  onClose: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const t = useTheme();
  const scale = useSharedValue(0.7);
  const fade = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = 0.7;
      scale.value = withSpring(1, { damping: 13, stiffness: 190 });
      fade.value = withTiming(1, { duration: 160, easing: Easing.out(Easing.ease) });
      if (variant === 'success') { sfx('success'); haptic('success'); }
      else if (variant === 'delete') { sfx('error'); }
      else { sfx('pop'); }
    } else {
      fade.value = withTiming(0, { duration: 140 });
      scale.value = withTiming(0.85, { duration: 140 });
    }
  }, [visible, variant, scale, fade]);

  const card = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: fade.value }));

  const accent = variant === 'delete' ? t.danger : variant === 'success' ? '#22c55e' : t.accent;
  const icon: any = variant === 'delete' ? 'trash' : variant === 'success' ? 'bag-check' : 'help-circle';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(10,14,22,0.55)', alignItems: 'center', justifyContent: 'center', padding: 28 }} onPress={variant === 'success' ? onClose : undefined}>
        <Animated.View style={[{ width: '100%', maxWidth: 370, backgroundColor: t.bg, borderRadius: R.xl, padding: 22, gap: 6, boxShadow: '0px 24px 48px rgba(0,0,0,0.28)', alignItems: 'center' }, card] as any}>
          {variant === 'success' ? (
            <Burst />
          ) : (
            <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: accent + '1E', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
              <Svg width={30} height={30} viewBox="0 0 24 24">
                {variant === 'delete' ? (
                  <G stroke={accent} strokeWidth={2.1} strokeLinecap="round" fill="none">
                    <Path d="M4 7 H20" /><Path d="M9 7 V5.5 C9 5 9.4 4.6 10 4.6 H14 C14.6 4.6 15 5 15 5.5 V7" />
                    <Path d="M6.5 7 L7.4 19 C7.45 19.8 8 20.4 8.8 20.4 H15.2 C16 20.4 16.55 19.8 16.6 19 L17.5 7" />
                    <Path d="M10 11 V16.5" /><Path d="M14 11 V16.5" />
                  </G>
                ) : (
                  <G stroke={accent} strokeWidth={2.1} strokeLinecap="round" fill="none">
                    <Circle cx="12" cy="12" r="9" />
                    <Path d="M12 8 V12.6" /><Path d="M12 15.8 V16.4" />
                  </G>
                )}
              </Svg>
            </View>
          )}
          <T v="h3" style={{ fontSize: 19, textAlign: 'center' }}>{title}</T>
          {!!body && (
            <T v="sub" color={t.sub} style={{ textAlign: 'center', lineHeight: 20, marginTop: 2 }}>
              {body}
            </T>
          )}
          {variant === 'delete' && (
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: 'rgba(255,90,95,0.1)' }}>
              <T v="caption" color={t.danger} style={{ fontWeight: '800' }}>Tindakan ini permanen & tidak bisa dibatalkan.</T>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: variant === 'success' ? 14 : 20, width: '100%' }}>
            {variant !== 'success' && (
              <Pressable
                onPress={() => { sfx('pop'); onClose(); onCancel?.(); }}
                style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg2, opacity: pressed ? 0.85 : 1 } as any)}
              >
                <T v="h3" style={{ fontSize: 15 }}>{cancel}</T>
              </Pressable>
            )}
            <Pressable
              onPress={() => { if (variant === 'success') { sfx('pop'); onClose(); } else { sfx(variant === 'delete' ? 'error' : 'success'); onClose(); onConfirm?.(); } }}
              style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: accent, opacity: pressed ? 0.86 : 1 } as any)}
            >
              <T v="h3" color="#fff" style={{ fontSize: 15 }}>{variant === 'success' ? 'Lihat pesanan saya' : confirm}</T>
            </Pressable>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export default FancyModal;
