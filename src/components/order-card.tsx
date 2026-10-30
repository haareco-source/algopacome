import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice } from '@/lib/business';
import { formatDateTime, formatTime } from '@/lib/orders';
import type { Order } from '@/lib/types';

type OrderCardProps = {
  order: Order;
  title: string;
  footer?: React.ReactNode;
};

// Resumen de un pedido para las listas del cliente y del vendedor.
export function OrderCard({ order, title, footer }: OrderCardProps) {
  const theme = useTheme();
  const items = order.order_items.map((item) => `${item.quantity} × ${item.product_name}`).join(', ');

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/pedido/[id]', params: { id: order.id } })}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
        <View style={styles.row}>
          <ThemedText type="defaultBold" style={styles.flex} numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText type="smallBold">{formatPrice(order.total)}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          #{order.number} · {items}
        </ThemedText>
        <View style={styles.row}>
          <StatusBadge status={order.status} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.when}>
            {order.scheduled_for ? `Para las ${formatTime(order.scheduled_for)}` : formatDateTime(order.created_at)}
            {order.type === 'delivery' ? ' · Delivery' : ' · Retiro'}
          </ThemedText>
        </View>
      </Pressable>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1.5,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  body: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  when: {
    flex: 1,
    textAlign: 'right',
  },
  pressed: {
    opacity: 0.7,
  },
});
