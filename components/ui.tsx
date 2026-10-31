import React, { ReactNode, forwardRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  TextInputProps,
  ViewStyle,
  TextStyle,
  StyleProp,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme, font, R, Theme } from '../lib/theme';
import { initials } from '../lib/format';
import { mapChildrenEmoji, fontSizeOf } from './Emoji';
import { VerifiedBadge, VipBadge, PremiumBadge, SecurityBadge, DeveloperBadge, AdminBadge, ModeratorBadge } from '../lib/icons';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------- CoverImage ----------
/**
 * Sampul lagu/artis/playlist yang tangguh:
 *  - expo-image dengan cache disk (thumbnail tidak diunduh ulang terus)
 *  - placeholder rapi saat URL kosong / masih memuat / gagal (ikon fallback)
 *  - round=true → bulat (gaya daftar putar), round=false → sudut membulat
 */
export function CoverImage({ uri, size = 48, round = true, fallbackIcon = 'musical-note' }: { uri?: string; size?: number; round?: boolean; fallbackIcon?: IconName }) {
  const t = useTheme();
  const [bad, setBad] = React.useState(false);
  React.useEffect(() => { setBad(false); }, [uri]);
  const radius = round ? size / 2 : Math.round(size * 0.24);
  if (!uri || bad) {
    return (
      <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={fallbackIcon} size={Math.round(size * 0.44)} color={t.faint} />
      </View>
    );
  }
  return (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)' }}>
      <Image
        source={{ uri }}
        style={{ width: size, height: size }}
        contentFit="cover"
        cachePolicy="disk"
        recyclingKey={uri}
        onError={() => setBad(true)}
        transition={140}
      />
    </View>
  );
}

// ---------- Text ----------
type TV = 'h1' | 'h2' | 'h3' | 'body' | 'sub' | 'caption' | 'label';
const sizes: Record<TV, TextStyle> = {
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  h2: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  h3: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' },
  sub: { fontSize: 14, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '500' },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
};
export function T({ v = 'body', color, style, children, numberOfLines, onPress, selectable }: { v?: TV; color?: string; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; onPress?: () => void; selectable?: boolean }) {
  const t = useTheme();
  const c = color ?? (v === 'sub' || v === 'caption' || v === 'label' ? t.sub : t.text);
  const fs = fontSizeOf(style, sizes[v].fontSize ?? 16);
  return (
    <Text onPress={onPress} selectable={selectable} numberOfLines={numberOfLines} style={[font, sizes[v], { color: c }, style]}>
      {mapChildrenEmoji(children, Math.round(fs * 1.15))}
    </Text>
  );
}

// ---------- Neumorphic surfaces ----------
export function Neu({ children, style, inset, radius = R.md, small, color }: { children?: ReactNode; style?: StyleProp<ViewStyle>; inset?: boolean; radius?: number; small?: boolean; color?: string }) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: color ?? t.bg, borderRadius: radius, boxShadow: inset ? (small ? t.insetSm : t.inset) : small ? t.raisedSm : t.raised } as ViewStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function NeuPress({
  children,
  onPress,
  onLongPress,
  style,
  radius = R.md,
  small,
  disabled,
  active,
  color,
  hitSlop,
  accessibilityLabel,
}: {
  children?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  small?: boolean;
  disabled?: boolean;
  active?: boolean;
  color?: string;
  hitSlop?: number;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) =>
        [
          {
            backgroundColor: color ?? t.bg,
            borderRadius: radius,
            boxShadow: pressed || active ? (small ? t.insetSm : t.inset) : small ? t.raisedSm : t.raised,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            opacity: disabled ? 0.5 : 1,
          } as ViewStyle,
          style,
        ] as StyleProp<ViewStyle>
      }
    >
      {children}
    </Pressable>
  );
}

export function Btn({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
  small,
}: {
  title: string;
  onPress?: () => void;
  icon?: IconName;
  variant?: 'primary' | 'neu' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  small?: boolean;
}) {
  const t = useTheme();
  const primary = variant === 'primary' || variant === 'danger';
  const bg = variant === 'primary' ? t.accent : variant === 'danger' ? t.danger : t.bg;
  const fg = primary ? '#fff' : variant === 'ghost' ? t.accent : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) =>
        [
          {
            height: small ? 42 : 54,
            paddingHorizontal: small ? 16 : 22,
            borderRadius: R.pill,
            backgroundColor: variant === 'ghost' ? 'transparent' : bg,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            opacity: disabled ? 0.5 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
            boxShadow:
              variant === 'ghost'
                ? undefined
                : pressed
                ? primary
                  ? 'inset 4px 4px 10px rgba(0,0,0,0.25), inset -3px -3px 8px rgba(255,255,255,0.18)'
                  : t.inset
                : primary
                ? `0px 10px 22px ${variant === 'danger' ? 'rgba(255,59,92,0.35)' : 'rgba(30,107,255,0.38)'}, -5px -5px 12px ${t.dark ? 'rgba(48,56,70,0.5)' : 'rgba(255,255,255,0.9)'}`
                : t.raised,
          } as ViewStyle,
          style,
        ] as StyleProp<ViewStyle>
      }
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={small ? 17 : 20} color={fg} />}
          <T v="h3" color={fg} style={{ fontSize: small ? 15 : 16 }}>
            {title}
          </T>
        </>
      )}
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, size = 44, color, bg, badge, active, label, iconSize }: { icon: IconName; onPress?: () => void; size?: number; color?: string; bg?: string; badge?: number; active?: boolean; label?: string; iconSize?: number }) {
  const t = useTheme();
  return (
    <NeuPress onPress={onPress} small radius={size / 2} active={active} color={bg} accessibilityLabel={label ?? icon} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={iconSize ?? size * 0.45} color={color ?? (active ? t.accent : t.text)} />
      {!!badge && badge > 0 && (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <T v="caption" color="#fff" style={{ fontSize: 10, fontWeight: '700' }}>
            {badge > 99 ? '99+' : badge}
          </T>
        </View>
      )}
    </NeuPress>
  );
}

// ---------- Input ----------
export const NeuInput = forwardRef<TextInput, TextInputProps & { icon?: IconName; right?: ReactNode; containerStyle?: StyleProp<ViewStyle> }>(function NeuInput(
  { icon, right, containerStyle, style, multiline, ...rest },
  ref
) {
  const t = useTheme();
  return (
    <Neu inset radius={R.md} style={[{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', paddingHorizontal: 16, minHeight: 54 }, containerStyle]}>
      {icon && <Ionicons name={icon} size={19} color={t.faint} style={{ marginRight: 10, marginTop: multiline ? 17 : 0 }} />}
      <TextInput
        ref={ref}
        placeholderTextColor={t.faint}
        multiline={multiline}
        style={[font, { flex: 1, fontSize: 16, color: t.text, paddingVertical: 15, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }, style]}
        {...rest}
      />
      {right}
    </Neu>
  );
});

// ---------- Avatar ----------
export function Avatar({ uri, name, size = 48, color, online, ring, icon }: { uri?: string | null; name: string; size?: number; color?: string; online?: boolean; ring?: 'unseen' | 'seen' | null; icon?: IconName }) {
  const t = useTheme();
  const inner = (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: color ?? t.accent, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" transition={200} />
      ) : icon ? (
        <Ionicons name={icon} size={size * 0.48} color="#fff" />
      ) : (
        <Text style={[font, { color: '#fff', fontWeight: '700', fontSize: size * 0.38 }]}>{initials(name) || '?'}</Text>
      )}
    </View>
  );
  return (
    <View>
      {ring ? (
        <View style={{ padding: 2.5, borderRadius: size, borderWidth: 2.5, borderColor: ring === 'unseen' ? t.accent : t.faint }}>{inner}</View>
      ) : (
        <View style={{ borderRadius: size, boxShadow: t.raisedSm } as ViewStyle}>{inner}</View>
      )}
      {online && (
        <View style={{ position: 'absolute', right: 1, bottom: 1, width: size * 0.26, height: size * 0.26, borderRadius: size, backgroundColor: t.success, borderWidth: 2.5, borderColor: t.bg }} />
      )}
    </View>
  );
}

// ---------- Header ----------
export function Header({ title, subtitle, subtitleNode, titleNode, back = true, right, onTitlePress, left, large }: { title: string; subtitle?: string; subtitleNode?: ReactNode; titleNode?: ReactNode; back?: boolean; right?: ReactNode; onTitlePress?: () => void; left?: ReactNode; large?: boolean }) {
  const t = useTheme();
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 10,
        paddingHorizontal: 18,
        paddingBottom: 12,
        // GLASS BAR (ala iPhone): permukaan semi-transparan + hairline bawah —
        // bukan lagi blok warna datar yang terkesan "pengumuman".
        backgroundColor: t.dark ? 'rgba(16,20,28,0.86)' : 'rgba(255,255,255,0.82)',
        borderBottomWidth: 1,
        borderBottomColor: t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(10,20,40,0.06)',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {back && <IconBtn icon="chevron-back" size={42} onPress={() => (nav.canGoBack() ? nav.goBack() : (nav as any).navigate('Main'))} label="Kembali" />}
      {left}
      <Pressable onPress={onTitlePress} disabled={!onTitlePress} style={{ flex: 1 }}>
        {titleNode ? (
          titleNode
        ) : (
          <T v={large ? 'h1' : 'h3'} numberOfLines={1} style={large ? undefined : { fontSize: 18 }}>
            {title}
          </T>
        )}
        {subtitleNode ? (
          subtitleNode
        ) : (
          !!subtitle && (
            <T v="caption" numberOfLines={1} color={subtitle.includes('mengetik') || subtitle === 'online' ? t.accent : t.sub}>
              {subtitle}
            </T>
          )
        )}
      </Pressable>
      {right}
    </View>
  );
}

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[{ flex: 1, backgroundColor: t.bg }, style]}>{children}</View>;
}

export function Empty({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 40, gap: 14 }}>
      <Neu radius={50} style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={42} color={t.accent} />
      </Neu>
      <T v="h3" style={{ textAlign: 'center', marginTop: 6 }}>
        {title}
      </T>
      {!!body && (
        <T v="sub" style={{ textAlign: 'center', maxWidth: 280 }}>
          {body}
        </T>
      )}
      {action}
    </View>
  );
}

export function Row({ icon, iconColor, title, subtitle, right, onPress, danger, chevron = true, image, imageRound = true }: { icon: IconName; iconColor?: string; title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; danger?: boolean; chevron?: boolean; image?: string; imageRound?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, gap: 14, borderRadius: R.md, backgroundColor: pressed ? t.accentSoft : 'transparent' })}>
      {image ? (
        <CoverImage uri={image} size={48} round={imageRound} fallbackIcon={icon} />
      ) : (
        <Neu small radius={14} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={20} color={danger ? t.danger : iconColor ?? t.accent} />
        </Neu>
      )}
      <View style={{ flex: 1 }}>
        <T v="body" color={danger ? t.danger : t.text} style={{ fontWeight: '500' }}>
          {title}
        </T>
        {!!subtitle && (
          <T v="caption" numberOfLines={2}>
            {subtitle}
          </T>
        )}
      </View>
      {right}
      {chevron && onPress && !right && <Ionicons name="chevron-forward" size={18} color={t.faint} />}
    </Pressable>
  );
}

export function Card({ children, style, title }: { children: ReactNode; style?: StyleProp<ViewStyle>; title?: string }) {
  return (
    <View style={{ marginBottom: 22 }}>
      {title && (
        <T v="label" style={{ marginLeft: 8, marginBottom: 10 }}>
          {title}
        </T>
      )}
      <Neu radius={R.lg} style={[{ padding: 6 }, style]}>
        {children}
      </Neu>
    </View>
  );
}

export function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <View style={{ width: 54, height: 32, borderRadius: 16, backgroundColor: value ? t.accent : t.bg, boxShadow: value ? 'inset 2px 2px 5px rgba(0,0,0,0.2)' : t.insetSm, padding: 3, justifyContent: 'center' } as ViewStyle}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: value ? '#fff' : t.surface, alignSelf: value ? 'flex-end' : 'flex-start', boxShadow: '2px 2px 5px rgba(0,0,0,0.18)' } as ViewStyle} />
      </View>
    </Pressable>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  const t = useTheme();
  return (
    <Neu inset radius={R.pill} style={{ flexDirection: 'row', padding: 5 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1 }}>
            <View style={{ paddingVertical: 9, borderRadius: R.pill, alignItems: 'center', backgroundColor: on ? t.bg : 'transparent', boxShadow: on ? t.raisedSm : undefined } as ViewStyle}>
              <T v="sub" color={on ? t.accent : t.sub} style={{ fontWeight: '600' }}>
                {o.label}
              </T>
            </View>
          </Pressable>
        );
      })}
    </Neu>
  );
}

export function Badge({ n, color }: { n: number; color?: string }) {
  const t = useTheme();
  if (!n) return null;
  return (
    <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: color ?? t.accent, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 4px 10px rgba(30,107,255,0.35)' } as ViewStyle}>
      <T v="caption" color="#fff" style={{ fontWeight: '700', fontSize: 11 }}>
        {n > 99 ? '99+' : n}
      </T>
    </View>
  );
}

export const hairline = (t: Theme) => ({ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginHorizontal: 16 });

// ---------- Profile badges (centang biru, VIP, member, keamanan, admin, developer) ----------
export function UserBadges({ user, size = 15 }: { user?: { blueCheck?: boolean; vipUntil?: number; memberUntil?: number; security?: boolean; role?: string; developer?: boolean } | null; size?: number }) {
  const now = Date.now();
  if (!user) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {user.blueCheck && <VerifiedBadge size={size} />}
      {(user.vipUntil ?? 0) > now && <VipBadge size={size} />}
      {(user.memberUntil ?? 0) > now && <PremiumBadge size={size} />}
      {user.security && <SecurityBadge size={size} />}
      {user.developer && <DeveloperBadge size={size} />}
      {user.role === 'admin' && <AdminBadge size={size} />}
      {user.role === 'moderator' && <ModeratorBadge size={size} />}
    </View>
  );
}
