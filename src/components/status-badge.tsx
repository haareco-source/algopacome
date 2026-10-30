import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { STATUS_LABELS, statusTone } from '@/lib/orders';
import type { OrderStatus } from '@/lib/types';

// Estado del pedido: naranja mientras espera, verde en curso o entregado, gris si no se concretó.
export function StatusBadge({ status }: { status: OrderStatus }) {
  const theme = useTheme();
  const tone = statusTone(status);
  const colors = {
    waiting: { background: theme.primarySoft, text: theme.primary },
    active: { background: theme.accentSoft, text: theme.accent },
    done: { background: theme.accent, text: theme.onAccent },
    failed: { background: theme.backgroundElement, text: theme.textSecondary },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: colors.background }]}>
      <ThemedText type="smallBold" style={{ color: colors.text }}>
        {STATUS_LABELS[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
});
