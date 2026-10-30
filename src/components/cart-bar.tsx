import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice } from '@/lib/business';
import { useCart } from '@/providers/cart';

// Botón "Ver carrito" con cantidad y total; no se muestra si el carrito está vacío.
export function CartBar() {
  const theme = useTheme();
  const { cart, count, subtotal } = useCart();
  if (!cart || count === 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/carrito')}
      style={({ pressed }) => [styles.bar, { backgroundColor: theme.primary }, pressed && styles.pressed]}>
      <View style={[styles.count, { backgroundColor: theme.background }]}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {count}
        </ThemedText>
      </View>
      <View style={styles.texts}>
        <ThemedText type="defaultBold" style={{ color: theme.onPrimary }}>
          Ver carrito
        </ThemedText>
        <ThemedText type="small" style={{ color: theme.onPrimary }} numberOfLines={1}>
          {cart.businessName}
        </ThemedText>
      </View>
      <ThemedText type="defaultBold" style={{ color: theme.onPrimary }}>
        {formatPrice(subtotal)}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 56,
  },
  pressed: {
    opacity: 0.85,
  },
  count: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    flex: 1,
  },
});
