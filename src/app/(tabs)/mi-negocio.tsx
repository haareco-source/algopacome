import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { OrderCard } from '@/components/order-card';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyError } from '@/lib/business';
import { isFinished, localDay, minutesLeft, sellerNextStep } from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/lib/types';
import { useMyBusiness } from '@/providers/my-business';
import { useSellerOrders } from '@/providers/seller-orders';

// Pestaña del vendedor: pedidos para aceptar, en curso, agenda de programados y terminados.
export default function SellerOrdersScreen() {
  const theme = useTheme();
  const { business, refresh: refreshBusiness } = useMyBusiness();
  const { orders, customerNames, isLoading, refresh } = useSellerOrders();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!business) {
    return (
      <Screen>
        <ThemedText type="subtitle">Mi negocio</ThemedText>
        <Button title="Quiero vender" onPress={() => router.push('/vender')} />
      </Screen>
    );
  }

  const today = localDay(new Date());
  const toAccept = orders.filter((order) => order.status === 'new');
  const inProgress = orders
    .filter((order) => !isFinished(order.status) && order.status !== 'new' && order.status !== 'awaiting_payment')
    .sort((a, b) => timeOf(a) - timeOf(b));
  const finished = orders.filter((order) => isFinished(order.status));
  const scheduledToday = orders.filter(
    (order) =>
      order.scheduled_for &&
      localDay(order.scheduled_for) === today &&
      ['new', 'accepted', 'preparing'].includes(order.status),
  );

  // Totales por producto de lo programado para hoy: lo que hay que comprar y preparar.
  const totals = new Map<string, number>();
  for (const order of scheduledToday) {
    for (const item of order.order_items) {
      totals.set(item.product_name, (totals.get(item.product_name) ?? 0) + item.quantity);
    }
  }

  async function advance(order: Order) {
    const next = sellerNextStep(order);
    if (!next) return;
    setError(null);
    setBusyId(order.id);
    const { error: rpcError } = await supabase.rpc('set_order_status', { p_order_id: order.id, p_status: next.status });
    setBusyId(null);
    if (rpcError) setError(friendlyError(rpcError, 'No pudimos actualizar el pedido. Probá de nuevo.'));
    await refresh();
  }

  async function toggleOpen(isOpen: boolean) {
    await supabase.from('businesses').update({ is_open_now: isOpen }).eq('id', business!.id);
    await refreshBusiness();
  }

  return (
    <Screen
      header={
        <View style={styles.headerRow}>
          <View style={styles.flex}>
            <ThemedText type="heading" style={{ color: theme.onPrimary }} numberOfLines={1}>
              {business.name}
            </ThemedText>
            <ThemedText type="small" style={{ color: theme.onPrimary }}>
              {business.is_open_now ? 'Abierto: recibís pedidos' : 'Cerrado'}
              {business.accepts_scheduled ? ' · Tomás programados' : ''}
            </ThemedText>
          </View>
          <Switch
            accessibilityLabel="Abierto ahora"
            value={business.is_open_now}
            onValueChange={toggleOpen}
            trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      }>
      <Button
        title="Administrar negocio y productos"
        variant="outline"
        icon={<Icon sf="storefront" md="storefront" size={20} color={theme.text} />}
        onPress={() => router.push('/vender')}
      />

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      {isLoading ? <ActivityIndicator color={theme.primary} /> : null}

      {toAccept.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="Para aceptar" count={toAccept.length} color={theme.primary} />
          {toAccept.map((order) => {
            const left = minutesLeft(order.accept_by);
            const next = sellerNextStep(order);
            return (
              <OrderCard
                key={order.id}
                order={order}
                title={customerNames[order.customer_id] ?? 'Cliente'}
                footer={
                  <View style={styles.cardFooter}>
                    <ThemedText type="small" style={[styles.flex, { color: theme.primary }]}>
                      Quedan {left} min para aceptar
                    </ThemedText>
                    {next ? (
                      <Button
                        title={next.label}
                        variant="accent"
                        onPress={() => advance(order)}
                        loading={busyId === order.id}
                        style={styles.smallButton}
                      />
                    ) : null}
                  </View>
                }
              />
            );
          })}
        </View>
      ) : null}

      {totals.size > 0 ? (
        <View style={[styles.agenda, { backgroundColor: theme.primarySoft }]}>
          <ThemedText type="heading">Programados para hoy</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {scheduledToday.length} {scheduledToday.length === 1 ? 'pedido' : 'pedidos'}. Esto es lo que tenés que
            preparar:
          </ThemedText>
          {[...totals.entries()].map(([name, quantity]) => (
            <View key={name} style={styles.totalRow}>
              <ThemedText type="defaultBold">{quantity} ×</ThemedText>
              <ThemedText style={styles.flex}>{name}</ThemedText>
            </View>
          ))}
        </View>
      ) : null}

      {inProgress.length > 0 ? (
        <View style={styles.section}>
          <SectionTitle title="En curso" count={inProgress.length} color={theme.accent} />
          {inProgress.map((order) => {
            const next = sellerNextStep(order);
            return (
              <OrderCard
                key={order.id}
                order={order}
                title={customerNames[order.customer_id] ?? 'Cliente'}
                footer={
                  next ? (
                    <Button
                      title={next.label}
                      variant="outline"
                      onPress={() => advance(order)}
                      loading={busyId === order.id}
                    />
                  ) : null
                }
              />
            );
          })}
        </View>
      ) : null}

      {!isLoading && toAccept.length === 0 && inProgress.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Icon sf="bell" md="notifications" size={32} color={theme.primary} />
          <ThemedText type="defaultBold" style={styles.center}>
            No tenés pedidos pendientes
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {business.is_open_now
              ? 'Cuando entre uno te avisamos con una notificación.'
              : 'Prendé "Abierto" cuando empieces a atender para recibir pedidos.'}
          </ThemedText>
        </View>
      ) : null}

      {finished.length > 0 ? (
        <View style={styles.section}>
          <ThemedText type="heading">Terminados</ThemedText>
          {finished.map((order) => (
            <OrderCard key={order.id} order={order} title={customerNames[order.customer_id] ?? 'Cliente'} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function timeOf(order: Order) {
  return new Date(order.scheduled_for ?? order.created_at).getTime();
}

function SectionTitle({ title, count, color }: { title: string; count: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="heading" style={styles.flex}>
        {title}
      </ThemedText>
      <View style={[styles.count, { backgroundColor: color }]}>
        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
          {count}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.three,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  count: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  smallButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.three,
  },
  agenda: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  totalRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  center: {
    textAlign: 'center',
  },
});
