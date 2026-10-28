/**
 * TypingDots — indikator "sedang mengetik" beranimasi (3 titik memantul).
 * Dipakai di header chat, daftar chat, dan gelembung typing di dalam ruang chat.
 * react-native Animated murni → jalan di web maupun APK.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { useTheme } from '../lib/theme';
import { T } from './ui';

export function TypingDots({ color, size = 6, showText = false, text }: { color?: string; size?: number; showText?: boolean; text?: string }) {
  const t = useTheme();
  const c = color ?? t.accent;
  const a0 = useRef(new Animated.Value(0)).current;
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const dots = [a0, a1, a2];

  useEffect(() => {
    const anims = dots.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 160),
          Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 260, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay((2 - i) * 160),
        ]),
        { resetBeforeIteration: false }
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {dots.map((v, i) => (
        <Animated.View
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c,
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.7] }) }],
          }}
        />
      ))}
      {showText && (
        <T v="caption" color={c} style={{ fontStyle: 'italic', marginLeft: 3, fontWeight: '600' }}>
          {text ?? 'sedang mengetik…'}
        </T>
      )}
    </View>
  );
}

/** Subtitle header/daftar chat: teks + titik kecil yang berdenyut. */
export function TypingSubtitle({ name }: { name?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <TypingDots size={4} />
      <T v="caption" color={t.accent} style={{ fontStyle: 'italic', fontWeight: '700' }}>
        {name ? `${name} sedang mengetik…` : 'sedang mengetik…'}
      </T>
    </View>
  );
}
