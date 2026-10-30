import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { OrderCard } from '@/components/order-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isFinished, ORDER_COLUMNS } from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/lib/types';
import { useAuth } from '@/providers/auth';

type OrdersData = { orders: Order[]; businessNames: Record<string, string> };

async function loadMyOrders(userId: string): Promise<OrdersData> {
  await supabase.rpc('expire_overdue_orders');
  const { data } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('customer_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<Order[]>();
  const orders = data ?? [];
  const businessIds = [...new Set(orders.map((order) => order.business_id))];
  const businessNames: Record<string, string> = {};
  if (businessIds.length > 0) {
    const { data: businesses } = await supabase.from('businesses').select('id, name').in('id', businessIds);
    for (const business of businesses ?? []) businessNames[business.id] = business.name;
  }
  return { orders, businessNames };
}

// Pedidos del cliente: los que están en curso arriba y el historial abajo, actualizados en vivo.
export default function OrdersScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user.id;
  const [data, setData] = useState<OrdersData | null>(null);

  const reload = useCallback(() => {
    if (!userId) return;
    loadMyOrders(userId).then(setData);
  }, [userId]);

  useFocusEffect(reload);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-orders-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${userId}` },
        reload,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload, userId]);

  if (data === null) {
    return (
      <Screen>
        <ThemedText type="subtitle">Mis pedidos</ThemedText>
        <ActivityIndicator color={theme.primary} />
      </Screen>
    );
  }

  const current = data.orders.filter((order) => !isFinished(order.status));
  const past = data.orders.filter((order) => isFinished(order.status));

  return (
    <Screen>
      <ThemedText type="subtitle">Mis pedidos</ThemedText>

      {data.orders.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
            <Icon sf="bag.fill" md="receipt_long" size={44} color={theme.primary} />
          </View>
          <ThemedText type="heading" style={styles.center}>
            Todavía no hiciste ningún pedido
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.center}>
            Cuando pidas algo, acá vas a poder seguirlo en vivo.
          </ThemedText>
          <Button title="Explorar comidas" onPress={() => router.navigate('/')} style={styles.button} />
        </View>
      ) : null}

      {current.length > 0 ? (
        <View style={styles.section}>
          <ThemedText type="heading">En curso</ThemedText>
          {current.map((order) => (
            <OrderCard key={order.id} order={order} title={data.businessNames[order.business_id] ?? 'Negocio'} />
          ))}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View style={styles.section}>
          <ThemedText type="heading">Anteriores</ThemedText>
          {past.map((order) => (
            <OrderCard key={order.id} order={order} title={data.businessNames[order.business_id] ?? 'Negocio'} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    alignSelf: 'stretch',
    marginTop: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.three,
  },
});
