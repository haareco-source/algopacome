import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = PressableProps & {
  title: string;
  // primary: naranja, la acción principal. accent: verde. outline: blanco con borde. ghost: solo texto.
  variant?: 'primary' | 'accent' | 'outline' | 'ghost';
  icon?: ReactNode;
  loading?: boolean;
};

export function Button({ title, variant = 'primary', icon, loading = false, disabled, style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const colors = {
    primary: { background: theme.primary, text: theme.onPrimary, border: theme.primary },
    accent: { background: theme.accent, text: theme.onAccent, border: theme.accent },
    outline: { background: theme.background, text: theme.text, border: theme.text },
    ghost: { background: 'transparent', text: theme.text, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={(state) => [
        styles.button,
        { backgroundColor: colors.background, borderColor: colors.border },
        (state.pressed || isDisabled) && styles.dimmed,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          {icon}
          <ThemedText type="defaultBold" style={{ color: colors.text }}>
            {title}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  dimmed: {
    opacity: 0.6,
  },
});
