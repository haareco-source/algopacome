import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type QuantityStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
};

export function QuantityStepper({ value, onChange, min = 0 }: QuantityStepperProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Uno menos"
        disabled={value <= min}
        onPress={() => onChange(value - 1)}
        style={[styles.button, value <= min && styles.dimmed]}>
        <Icon sf={value <= 1 && min === 0 ? 'trash' : 'minus'} md={value <= 1 && min === 0 ? 'delete' : 'remove'} size={20} color={theme.primary} />
      </Pressable>
      <ThemedText type="defaultBold" style={styles.value}>
        {value}
      </ThemedText>
      <Pressable accessibilityRole="button" accessibilityLabel="Uno más" onPress={() => onChange(value + 1)} style={styles.button}>
        <Icon sf="plus" md="add" size={20} color={theme.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: Radius.pill,
  },
  button: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.4,
  },
  value: {
    minWidth: 24,
    textAlign: 'center',
    paddingHorizontal: Spacing.one,
  },
});
