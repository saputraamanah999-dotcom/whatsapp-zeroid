import React, { useState } from 'react';
import { Image, Platform, Text, TextStyle, StyleProp } from 'react-native';

/** Apple (iPhone) emoji artwork served from the emoji-datasource-apple package on jsDelivr. */
const CDN = 'https://cdn.jsdelivr.net/npm/emoji-datasource-apple@15.1.2/img/apple/64/';

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

function candidates(e: string) {
  const full = emojiCode(e);
  const stripped = full
    .split('-')
    .filter((x) => x !== 'fe0f')
    .join('-');
  const out = [full, stripped];
  if (!full.includes('fe0f')) out.push(full + '-fe0f');
  return Array.from(new Set(out)).map((c) => CDN + c + '.png');
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
      onError: () => setI(i + 1),
      style: { width: size, height: size, verticalAlign: '-0.2em', margin: '0 0.04em', display: 'inline-block' },
    });
  }
  return <Image source={{ uri: urls[i] }} onError={() => setI(i + 1)} style={{ width: size, height: size }} />;
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
