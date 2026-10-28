import { Text as RNText, type TextProps } from 'react-native';
import { color, type } from './theme';

type Variant = keyof typeof type;

export function Text({
  variant = 'body',
  tone = 'ink',
  style,
  ...rest
}: TextProps & { variant?: Variant; tone?: 'ink' | 'slate' | 'onInk' | 'onInkMuted' | 'alert' | 'calm' }) {
  const c = {
    ink: color.ink,
    slate: color.slate,
    onInk: color.onInk,
    onInkMuted: color.onInkMuted,
    alert: color.alert,
    calm: color.calm,
  }[tone];
  return <RNText {...rest} style={[type[variant], { color: c }, style]} maxFontSizeMultiplier={1.6} />;
}
