import React, { useState } from 'react';
import { Platform, Text, TextStyle, StyleProp } from 'react-native';

/**
 * Apple (iPhone) emoji artwork via emoji-datasource-apple on TWO CDN mirrors —
 * kalau jsDelivr diblokir/lambat, otomatis coba unpkg, baru fallback ke glyph
 * bawaan perangkat (tidak pernah kotak kosong).
 */
const CDNS = [
  'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/',
  'https://unpkg.com/emoji-datasource-apple@15.1.2/img/apple/64/',
];

let EMOJI_RE: RegExp | null = null;
try {
  EMOJI_RE = new RegExp(
    '(\\p{Regional_Indicator}{2}|[#*0-9]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*)',
    'gu'
  );
} catch {
  EMOJI_RE = null;
}

export function hasEmoji(s: string) {
  if (!EMOJI_RE) return false;
  EMOJI_RE.lastIndex = 0;
  return EMOJI_RE.test(s);
}

export function emojiCode(e: string) {
  return Array.from(e)
    .map((c) => c.codePointAt(0)!.toString(16))
    .join('-');
}

/** Daftar URL kandidat: kedua CDN × varian fe0f (emoji "hilang" biasanya karena varian). */
function candidates(e: string) {
  const full = emojiCode(e);
  const stripped = full
    .split('-')
    .filter((x) => x !== 'fe0f')
    .join('-');
  const codes = Array.from(new Set([full, stripped, full + '-fe0f']));
  const out: string[] = [];
  for (const cdn of CDNS) for (const c of codes) out.push(cdn + c + '.png');
  return out;
}

export function emojiUrl(e: string) {
  return candidates(e)[0];
}

/** Single Apple emoji glyph, inline with text. Falls back to the system glyph if no artwork exists. */
export function AppleEmoji({ e, size }: { e: string; size: number }) {
  const urls = candidates(e);
  const [i, setI] = useState(0);
  if (i >= urls.length) return <Text>{e}</Text>;
  if (Platform.OS === 'web') {
    return React.createElement('img', {
      src: urls[i],
      alt: e,
      draggable: false,
      loading: 'eager',
      onError: () => setI(i + 1),
      style: { width: size, height: size, verticalAlign: '-0.2em', margin: '0 0.04em', display: 'inline-block' },
    });
  }
  // native: expo-image → cache disk permanen (stiker emoji tak diunduh ulang tiap chat dibuka)
  const ExpoImage = require('expo-image').default;
  return (
    <ExpoImage
      source={{ uri: urls[i] }}
      cachePolicy="disk"
      recyclingKey={`em-${urls[i]}`}
      onError={() => setI(i + 1)}
      style={{ width: size, height: size, marginHorizontal: size * 0.04 }}
    />
  );
}

/** Splits a string into text + Apple emoji pieces. */
export function renderWithEmoji(s: string, size: number, keyPrefix = 'e'): React.ReactNode[] {
  if (!EMOJI_RE || !hasEmoji(s)) return [s];
  const out: React.ReactNode[] = [];
  let last = 0;
  EMOJI_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = EMOJI_RE.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(<AppleEmoji key={`${keyPrefix}${k++}`} e={m[0]} size={size} />);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

export function mapChildrenEmoji(children: React.ReactNode, size: number): React.ReactNode {
  if (!EMOJI_RE) return children;
  let idx = 0;
  return React.Children.map(children, (c) => {
    if (typeof c === 'string' && hasEmoji(c)) return <>{renderWithEmoji(c, size, `c${idx++}_`)}</>;
    return c;
  });
}

export function fontSizeOf(style: StyleProp<TextStyle>, fallback: number) {
  const flat = (Array.isArray(style) ? Object.assign({}, ...style.flat(10).filter(Boolean)) : style || {}) as TextStyle;
  return flat.fontSize ?? fallback;
}

export const EMOJI_SET = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘',
  '😋', '😛', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😒', '😔', '😢', '😭', '😤', '😡', '🤯', '😳',
  '🥺', '😱', '🤔', '🤫', '🤭', '😴', '🤤', '🤢', '🥵', '🥶', '😈', '💀', '💩', '🤡', '👻', '👽',
  '👋', '👌', '✌️', '🤞', '👍', '👎', '👏', '🙌', '🤝', '🙏', '💪', '🫶', '👀', '🧠', '💅', '🤳',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💕', '💖', '💯', '🔥', '✨', '⭐', '🎉',
  '🎈', '🎁', '🎂', '☕', '🍕', '🍔', '🍜', '🍩', '⚽', '🎮', '🎵', '📸', '🚀', '🌈', '🌙', '🇮🇩',
];

/** Built-in "Zeroid" sticker pack (large Apple emoji art). */
export const DEFAULT_STICKERS = ['😂', '😍', '🥳', '😭', '😎', '🤯', '🥺', '😡', '👍', '🙏', '🔥', '❤️', '🎉', '💯', '💀', '🤡'].map((e) => ({
  id: 'def_' + emojiCode(e),
  uri: 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/' + emojiCode(e) + '.png',
}));
