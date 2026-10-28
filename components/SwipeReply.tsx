import React, { ReactNode, useRef } from 'react';
import { Animated, PanResponder, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

/** Swipe a message to the LEFT to reply (WhatsApp-style). Works with touch and mouse. */
export default function SwipeReply({ children, onReply, color, disabled }: { children: ReactNode; onReply: () => void; color: string; disabled?: boolean }) {
  const x = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  const pr = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !disabled && g.dx < -10 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onMoveShouldSetPanResponderCapture: (_, g) => !disabled && g.dx < -14 && Math.abs(g.dx) > Math.abs(g.dy) * 2.5,
      onPanResponderGrant: () => {
        fired.current = false;
      },
      onPanResponderMove: (_, g) => {
        const dx = Math.max(-90, Math.min(0, g.dx));
        x.setValue(dx);
        if (dx <= -64 && !fired.current) fired.current = true;
      },
      onPanResponderRelease: () => {
        if (fired.current) onReplyRef.current();
        Animated.spring(x, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const iconOpacity = x.interpolate({ inputRange: [-64, -20, 0], outputRange: [1, 0.3, 0], extrapolate: 'clamp' });
  const iconScale = x.interpolate({ inputRange: [-64, 0], outputRange: [1.1, 0.6], extrapolate: 'clamp' });
  return (
    <View>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center', opacity: iconOpacity, transform: [{ scale: iconScale }] }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-undo" size={18} color={color} />
        </View>
      </Animated.View>
      <Animated.View {...pr.panHandlers} style={{ transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}
