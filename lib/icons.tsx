/**
 * Zeroid icon system — professional stroke SVG icons (Lucide-style, 24x24 grid).
 * Uniform size / stroke / color / spacing across the whole app.
 * Emoji are NEVER used as UI icons; emoji remain only inside message content,
 * the emoji picker and user reactions.
 */
import React, { useEffect } from 'react';
import { Svg, Path, Circle, Line, Rect, Polyline, Polygon, Ellipse, G, Defs, LinearGradient, Stop, SvgProps } from 'react-native-svg';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withSpring, withTiming, withDelay } from 'react-native-reanimated';

export type IconName =
  | 'send' | 'paperclip' | 'smile' | 'mic' | 'camera' | 'x' | 'search' | 'phone' | 'phone-off'
  | 'video' | 'users' | 'user' | 'user-plus' | 'user-minus' | 'settings' | 'bell' | 'bell-off'
  | 'shield' | 'shield-check' | 'check' | 'check-check' | 'clock' | 'arrow-left' | 'arrow-right'
  | 'chevron-right' | 'chevron-down' | 'more-vertical' | 'trash' | 'pin' | 'star' | 'forward'
  | 'copy' | 'edit' | 'log-out' | 'moon' | 'sun' | 'globe' | 'wifi' | 'wifi-off' | 'plus'
  | 'eye' | 'eye-off' | 'ban' | 'flag' | 'mail' | 'lock' | 'key' | 'message-circle' | 'megaphone'
  | 'music' | 'play' | 'pause' | 'volume' | 'volume-x' | 'image' | 'file-text' | 'download'
  | 'heart' | 'info' | 'alert' | 'refresh' | 'qr' | 'wallet' | 'credit-card' | 'landmark'
  | 'sparkles' | 'code' | 'mic-off' | 'cam-off' | 'switch-camera' | 'phone-incoming'
  | 'archive' | 'bell-ring' | 'reply' | 'sticker' | 'type' | 'palette' | 'aperture'
  | 'layout' | 'activity' | 'trending-up' | 'database' | 'server' | 'external' | 'link'
  | 'grid' | 'list' | 'filter' | 'at-sign' | 'cake' | 'map-pin' | 'briefcase' | 'layers' | 'power';

type P = { size?: number; color?: string; strokeWidth?: number; fill?: string } & SvgProps;

function base({ size = 22, color = '#3A4356', strokeWidth = 2, fill = 'none', ...rest }: P, children: React.ReactNode) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {children}
    </Svg>
  );
}

export const Icon = React.memo(function Icon({ name, ...p }: P & { name: IconName }) {
  const b = (ch: React.ReactNode) => base(p, ch);
  switch (name) {
    case 'send': return b(<><Path d="m22 2-7 20-4-9-9-4Z" /><Path d="M22 2 11 13" /></>);
    case 'paperclip': return b(<Path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />);
    case 'smile': return b(<><Circle cx="12" cy="12" r="10" /><Path d="M8 14s1.5 2 4 2 4-2 4-2" /><Line x1="9" y1="9" x2="9.01" y2="9" /><Line x1="15" y1="9" x2="15.01" y2="9" /></>);
    case 'mic': return b(<><Rect x="9" y="2" width="6" height="12" rx="3" /><Path d="M5 10v2a7 7 0 0 0 14 0v-2" /><Line x1="12" y1="19" x2="12" y2="22" /></>);
    case 'mic-off': return b(<><Line x1="2" y1="2" x2="22" y2="22" /><Path d="M18.89 13.23A7 7 0 0 0 19 12v-2" /><Path d="M5 10v2a7 7 0 0 0 12 5" /><Line x1="12" y1="19" x2="12" y2="22" /></>);
    case 'camera': return b(<><Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><Circle cx="12" cy="13" r="3" /></>);
    case 'cam-off': return b(<><Line x1="2" y1="2" x2="22" y2="22" /><Path d="M5 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12" /><Path d="M9 5h6l2 3h3a2 2 0 0 1 2 2v7" /></>);
    case 'switch-camera': return b(<><Path d="M16 7h4a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4" /><Circle cx="12" cy="14" r="3.5" /><Path d="m8 3 2 2-2 2" transform="translate(-1 0)" /></>);
    case 'x': return b(<><Line x1="18" y1="6" x2="6" y2="18" /><Line x1="6" y1="6" x2="18" y2="18" /></>);
    case 'search': return b(<><Circle cx="11" cy="11" r="7" /><Line x1="21" y1="21" x2="16.65" y2="16.65" /></>);
    case 'phone': return b(<Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />);
    case 'phone-off': return b(<><Path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" /><Line x1="22" y1="2" x2="2" y2="22" /></>);
    case 'phone-incoming': return b(<><Polyline points="16 2 16 8 22 8" /><Line x1="23" y1="1" x2="16" y2="8" /><Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></>);
    case 'video': return b(<><Path d="m22 8-6 4 6 4V8Z" /><Rect x="2" y="6" width="14" height="12" rx="2" /></>);
    case 'users': return b(<><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><Circle cx="9" cy="7" r="4" /><Path d="M22 21v-2a4 4 0 0 0-3-3.87" /><Path d="M16 3.13a4 4 0 0 1 0 7.75" /></>);
    case 'user': return b(<><Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><Circle cx="12" cy="7" r="4" /></>);
    case 'user-plus': return b(<><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><Circle cx="9" cy="7" r="4" /><Line x1="19" y1="8" x2="19" y2="14" /><Line x1="22" y1="11" x2="16" y2="11" /></>);
    case 'user-minus': return b(<><Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><Circle cx="9" cy="7" r="4" /><Line x1="22" y1="11" x2="16" y2="11" /></>);
    case 'settings': return b(<><Circle cx="12" cy="12" r="3" /><Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>);
    case 'bell': return b(<><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>);
    case 'bell-off': return b(<><Path d="M13.73 21a2 2 0 0 1-3.46 0" /><Path d="M18.63 13A17.89 17.89 0 0 1 18 8" /><Path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" /><Path d="M18 8a6 6 0 0 0-9.33-5" /><Line x1="1" y1="1" x2="23" y2="23" /></>);
    case 'bell-ring': return b(<><Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /><Path d="M4 2C2.8 3.2 2.8 5.1 4 6.3M20 2c1.2 1.2 1.2 3.1 0 4.3" /></>);
    case 'shield': return b(<Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />);
    case 'shield-check': return b(<><Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><Path d="m9 12 2 2 4-4" /></>);
    case 'check': return b(<Polyline points="20 6 9 17 4 12" />);
    case 'check-check': return b(<><Path d="M18 6 7 17l-5-5" /><Path d="m22 10-7.5 7.5L13 16" /></>);
    case 'clock': return b(<><Circle cx="12" cy="12" r="10" /><Polyline points="12 6 12 12 16 14" /></>);
    case 'arrow-left': return b(<><Line x1="19" y1="12" x2="5" y2="12" /><Polyline points="12 19 5 12 12 5" /></>);
    case 'arrow-right': return b(<><Line x1="5" y1="12" x2="19" y2="12" /><Polyline points="12 5 19 12 12 19" /></>);
    case 'chevron-right': return b(<Polyline points="9 18 15 12 9 6" />);
    case 'chevron-down': return b(<Polyline points="6 9 12 15 18 9" />);
    case 'more-vertical': return b(<><Circle cx="12" cy="12" r="1" /><Circle cx="12" cy="5" r="1" /><Circle cx="12" cy="19" r="1" /></>);
    case 'trash': return b(<><Path d="M3 6h18" /><Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><Line x1="10" y1="11" x2="10" y2="17" /><Line x1="14" y1="11" x2="14" y2="17" /></>);
    case 'pin': return b(<><Line x1="12" y1="17" x2="12" y2="22" /><Path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" /></>);
    case 'star': return b(<Polyline points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />);
    case 'forward': return b(<><Polyline points="15 17 20 12 15 7" /><Path d="M4 18v-2a4 4 0 0 1 4-4h12" /></>);
    case 'reply': return b(<><Polyline points="9 17 4 12 9 7" /><Path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>);
    case 'copy': return b(<><Rect x="9" y="9" width="13" height="13" rx="2" /><Path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>);
    case 'edit': return b(<><Path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><Path d="m15 5 4 4" /></>);
    case 'log-out': return b(<><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Polyline points="16 17 21 12 16 7" /><Line x1="21" y1="12" x2="9" y2="12" /></>);
    case 'moon': return b(<Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);
    case 'sun': return b(<><Circle cx="12" cy="12" r="4" /><Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>);
    case 'globe': return b(<><Circle cx="12" cy="12" r="10" /><Line x1="2" y1="12" x2="22" y2="12" /><Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>);
    case 'wifi': return b(<><Path d="M5 12.55a11 11 0 0 1 14.08 0" /><Path d="M1.42 9a16 16 0 0 1 21.16 0" /><Path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><Line x1="12" y1="20" x2="12.01" y2="20" /></>);
    case 'wifi-off': return b(<><Line x1="2" y1="2" x2="22" y2="22" /><Path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><Path d="M5 12.55a11 11 0 0 1 5.17-2.39" /><Path d="M10.71 5.05A16 16 0 0 1 22.58 9" /><Path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><Path d="M16.85 11.25a10.95 10.95 0 0 1 2.16 1.31" /><Line x1="12" y1="20" x2="12.01" y2="20" /></>);
    case 'plus': return b(<><Line x1="12" y1="5" x2="12" y2="19" /><Line x1="5" y1="12" x2="19" y2="12" /></>);
    case 'eye': return b(<><Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><Circle cx="12" cy="12" r="3" /></>);
    case 'eye-off': return b(<><Path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><Path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><Path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><Line x1="2" y1="2" x2="22" y2="22" /></>);
    case 'ban': return b(<><Circle cx="12" cy="12" r="10" /><Path d="m4.9 4.9 14.2 14.2" /></>);
    case 'flag': return b(<><Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><Line x1="4" y1="22" x2="4" y2="15" /></>);
    case 'mail': return b(<><Rect x="2" y="4" width="20" height="16" rx="2" /><Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>);
    case 'lock': return b(<><Rect x="3" y="11" width="18" height="11" rx="2" /><Path d="M7 11V7a5 5 0 0 1 10 0v4" /></>);
    case 'key': return b(<><Circle cx="7.5" cy="15.5" r="5.5" /><Path d="m21 2-9.6 9.6" /><Path d="m15.5 7.5 3 3L22 7l-3-3" /></>);
    case 'message-circle': return b(<Path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />);
    case 'megaphone': return b(<><Path d="m3 11 18-5v12L3 14v-3z" /><Path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></>);
    case 'music': return b(<><Path d="M9 18V5l12-2v13" /><Circle cx="6" cy="18" r="3" /><Circle cx="18" cy="16" r="3" /></>);
    case 'play': return b(<Polyline points="6 3 20 12 6 21 6 3" />);
    case 'pause': return b(<><Rect x="6" y="4" width="4" height="16" /><Rect x="14" y="4" width="4" height="16" /></>);
    case 'volume': return b(<><Path d="M11 5 6 9H2v6h4l5 4V5Z" /><Path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><Path d="M19.07 4.93a10 10 0 0 1 0 14.14" /></>);
    case 'volume-x': return b(<><Path d="M11 5 6 9H2v6h4l5 4V5Z" /><Line x1="22" y1="9" x2="16" y2="15" /><Line x1="16" y1="9" x2="22" y2="15" /></>);
    case 'image': return b(<><Rect x="3" y="3" width="18" height="18" rx="2" /><Circle cx="9" cy="9" r="2" /><Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>);
    case 'file-text': return b(<><Path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><Polyline points="14 2 14 8 20 8" /><Line x1="16" y1="13" x2="8" y2="13" /><Line x1="16" y1="17" x2="8" y2="17" /></>);
    case 'download': return b(<><Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><Polyline points="7 10 12 15 17 10" /><Line x1="12" y1="15" x2="12" y2="3" /></>);
    case 'heart': return b(<Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />);
    case 'info': return b(<><Circle cx="12" cy="12" r="10" /><Path d="M12 16v-4" /><Path d="M12 8h.01" /></>);
    case 'alert': return b(<><Path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><Line x1="12" y1="9" x2="12" y2="13" /><Path d="M12 17h.01" /></>);
    case 'refresh': return b(<><Path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><Path d="M21 3v5h-5" /><Path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><Path d="M3 21v-5h5" /></>);
    case 'qr': return b(<><Rect x="3" y="3" width="7" height="7" rx="1" /><Rect x="14" y="3" width="7" height="7" rx="1" /><Rect x="3" y="14" width="7" height="7" rx="1" /><Path d="M14 14h3v3h-3zM19 19h2v2h-2zM14 19h2M21 14h-2" /></>);
    case 'wallet': return b(<><Path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><Path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><Path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>);
    case 'credit-card': return b(<><Rect x="2" y="5" width="20" height="14" rx="2" /><Line x1="2" y1="10" x2="22" y2="10" /></>);
    case 'landmark': return b(<><Line x1="3" y1="22" x2="21" y2="22" /><Line x1="6" y1="18" x2="6" y2="11" /><Line x1="10" y1="18" x2="10" y2="11" /><Line x1="14" y1="18" x2="14" y2="11" /><Line x1="18" y1="18" x2="18" y2="11" /><Polygon points="12 2 20 7 4 7" /></>);
    case 'sparkles': return b(<><Path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" /><Path d="M5 3v4M19 17v4M3 5h4M17 19h4" /></>);
    case 'code': return b(<><Polyline points="16 18 22 12 16 6" /><Polyline points="8 6 2 12 8 18" /></>);
    case 'sticker': return b(<><Path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" /><Path d="M15 3v6h6" /><Path d="M8 13h.01M12 16h.01M13 12h.01" /></>);
    case 'type': return b(<><Polyline points="4 7 4 4 20 4 20 7" /><Line x1="9" y1="20" x2="15" y2="20" /><Line x1="12" y1="4" x2="12" y2="20" /></>);
    case 'palette': return b(<><Circle cx="13.5" cy="6.5" r=".5" /><Circle cx="17.5" cy="10.5" r=".5" /><Circle cx="8.5" cy="7.5" r=".5" /><Circle cx="6.5" cy="12.5" r=".5" /><Path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></>);
    case 'aperture': return b(<><Circle cx="12" cy="12" r="10" /><Line x1="14.31" y1="8" x2="20.05" y2="17.94" /><Line x1="9.69" y1="8" x2="21.17" y2="8" /><Line x1="7.38" y1="12" x2="13.12" y2="2.06" /><Line x1="9.69" y1="16" x2="3.95" y2="6.06" /><Line x1="14.31" y1="16" x2="2.83" y2="16" /><Line x1="16.62" y1="12" x2="10.88" y2="21.94" /></>);
    case 'layout': return b(<><Rect x="3" y="3" width="18" height="18" rx="2" /><Line x1="3" y1="9" x2="21" y2="9" /><Line x1="9" y1="21" x2="9" y2="9" /></>);
    case 'activity': return b(<Polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />);
    case 'trending-up': return b(<><Polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><Polyline points="16 7 22 7 22 13" /></>);
    case 'database': return b(<><Ellipse cx="12" cy="5" rx="9" ry="3" /><Path d="M3 5v14a9 3 0 0 0 18 0V5" /><Path d="M3 12a9 3 0 0 0 18 0" /></>);
    case 'server': return b(<><Rect x="2" y="2" width="20" height="8" rx="2" /><Rect x="2" y="14" width="20" height="8" rx="2" /><Line x1="6" y1="6" x2="6.01" y2="6" /><Line x1="6" y1="18" x2="6.01" y2="18" /></>);
    case 'external': return b(<><Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><Polyline points="15 3 21 3 21 9" /><Line x1="10" y1="14" x2="21" y2="3" /></>);
    case 'link': return b(<><Path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><Path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>);
    case 'grid': return b(<><Rect x="3" y="3" width="7" height="7" /><Rect x="14" y="3" width="7" height="7" /><Rect x="14" y="14" width="7" height="7" /><Rect x="3" y="14" width="7" height="7" /></>);
    case 'list': return b(<><Line x1="8" y1="6" x2="21" y2="6" /><Line x1="8" y1="12" x2="21" y2="12" /><Line x1="8" y1="18" x2="21" y2="18" /><Line x1="3" y1="6" x2="3.01" y2="6" /><Line x1="3" y1="12" x2="3.01" y2="12" /><Line x1="3" y1="18" x2="3.01" y2="18" /></>);
    case 'filter': return b(<Polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />);
    case 'at-sign': return b(<><Circle cx="12" cy="12" r="4" /><Path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>);
    case 'power': return b(<><Path d="M12 2v10" /><Path d="M18.4 6.6a9 9 0 1 1-12.77.04" /></>);
    case 'map-pin': return b(<><Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><Circle cx="12" cy="10" r="3" /></>);
    default: return b(<Circle cx="12" cy="12" r="10" />);
  }
});

// ---------------- Official badges (custom multi-colour SVG, replace emoji) ----------------

export function VipBadge({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="vipg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFC53D" /><Stop offset="1" stopColor="#FF8A00" />
        </LinearGradient>
      </Defs>
      <Path d="M3 7l4.5 4L12 4l4.5 7L21 7l-1.6 10.2a1.5 1.5 0 0 1-1.48 1.3H6.08a1.5 1.5 0 0 1-1.48-1.3L3 7z" fill="url(#vipg)" />
      <Circle cx="12" cy="4" r="1.6" fill="#FFE082" />
    </Svg>
  );
}

/**
 * VerifiedBadge — centang biru RESMI Zeroid (SVG dari developer, dipakai di
 * SEMUA tempat: profil, pencarian, chat, grup, saluran, nama pengirim pesan).
 * Animasi pop ala spring (scale + rotate) memakai reanimated — padanan motion/react.
 */
export function VerifiedBadge({ size = 18, color = '#0095F6', animate = true }: { size?: number; color?: string; animate?: boolean }) {
  const s = useSharedValue(animate ? 0 : 1);
  const r = useSharedValue(animate ? -20 : 0);
  const o = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) { s.value = 1; r.value = 0; o.value = 1; return; }
    s.value = withDelay(250, withSpring(1, { stiffness: 260, damping: 18 }));
    r.value = withDelay(250, withSpring(0, { stiffness: 260, damping: 18 }));
    o.value = withDelay(250, withTiming(1, { duration: 120 }));
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${r.value}deg` }], opacity: o.value }));
  const svg = (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill={color}>
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M19.998 3.094 14.638 0l-2.972 5.15H5.432v6.354L0 14.64 3.094 20 0 25.359l5.432 3.137v5.905h5.975L14.638 40l5.36-3.094L25.358 40l3.232-5.6h6.162v-6.01L40 25.359 36.905 20 40 14.641l-5.248-3.03v-6.46h-6.419L25.358 0l-5.36 3.094Zm7.415 11.225 2.254 2.287-11.43 11.5-6.835-6.93 2.244-2.258 4.587 4.581 9.18-9.18Z"
      />
    </Svg>
  );
  if (!animate) return svg;
  return (
    <Animated.View entering={FadeIn.duration(1)} style={[{ alignItems: 'center', justifyContent: 'center' }, st]}>
      {svg}
    </Animated.View>
  );
}

export function AdminBadge({ size = 15 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="admg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FF5C5C" /><Stop offset="1" stopColor="#D6293A" />
        </LinearGradient>
      </Defs>
      <Path d="M12 2l8 3.6v5.2c0 5-3.4 8.6-8 10.2-4.6-1.6-8-5.2-8-10.2V5.6L12 2z" fill="url(#admg)" />
      <Path d="m8.4 12.2 2.3 2.3 4.9-5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function DeveloperBadge({ size = 15 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="devg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8B5CF6" /><Stop offset="1" stopColor="#6D28D9" />
        </LinearGradient>
      </Defs>
      <Rect x="2" y="4" width="20" height="16" rx="3.5" fill="url(#devg)" />
      <Path d="m9.5 9-2.5 3 2.5 3M14.5 9l2.5 3-2.5 3" stroke="#fff" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ModeratorBadge({ size = 15 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="modg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#22C1A3" /><Stop offset="1" stopColor="#0E9F8A" />
        </LinearGradient>
      </Defs>
      <Circle cx="12" cy="12" r="10" fill="url(#modg)" />
      <Path d="M12 6.5l4.8 1.8v2.9c0 3.3-2 5.7-4.8 6.8-2.8-1.1-4.8-3.5-4.8-6.8V8.3L12 6.5z" fill="#fff" opacity="0.92" />
    </Svg>
  );
}

export function PremiumBadge({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="prmg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#4FACFE" /><Stop offset="1" stopColor="#1E6BFF" />
        </LinearGradient>
      </Defs>
      <Path d="M12 2l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 16.9 6.1 20.2l1.3-6.6L2.5 9l6.6-.8L12 2z" fill="url(#prmg)" />
    </Svg>
  );
}

export function SecurityBadge({ size = 16 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1v7z" fill="#10B981" />
      <Path d="m9 12 2 2 4-4" stroke="#fff" strokeWidth="2.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function ZeroidLogo({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Defs>
        <LinearGradient id="zlg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3B8BFF" /><Stop offset="1" stopColor="#0F5BE8" />
        </LinearGradient>
      </Defs>
      <Rect x="2" y="2" width="44" height="44" rx="13" fill="url(#zlg)" />
      <Path d="M15 15.5h18L15 32.5h18" stroke="#fff" strokeWidth="4.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Map a product/badge key to its SVG component (replaces emoji product icons). */
export function ProductIcon({ k, size = 18 }: { k: string; size?: number }) {
  switch (k) {
    case 'vip': return <VipBadge size={size} />;
    case 'member': return <PremiumBadge size={size} />;
    case 'bluecheck': return <VerifiedBadge size={size} />;
    case 'security': return <SecurityBadge size={size} />;
    case 'qris': return <Icon name="qr" size={size} color="#0E9F8A" />;
    case 'dana': return <Icon name="wallet" size={size} color="#1E6BFF" />;
    case 'gopay': return <Icon name="wallet" size={size} color="#00AED6" />;
    case 'ovo': return <Icon name="wallet" size={size} color="#8B5CF6" />;
    case 'bca': return <Icon name="landmark" size={size} color="#0F5BE8" />;
    default: return <Icon name="credit-card" size={size} />;
  }
}
