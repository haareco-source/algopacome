import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, friendlyError, nameWithUnit } from '@/lib/business';
import { whatsappLink, type BusinessProfile } from '@/lib/catalog';
import { confirmAction } from '@/lib/confirm';
import {
  formatDateTime,
  formatTime,
  isFinished,
  minutesLeft,
  ORDER_COLUMNS,
  sellerNextStep,
  STATUS_LABELS,
  trackingSteps,
} from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import type { Order, OrderStatus } from '@/lib/types';
import { useMyBusiness } from '@/providers/my-business';
import { useSellerOrders } from '@/providers/seller-orders';

type OrderData = { order: Order | null; business: BusinessProfile | null; customerName: string | null };

async function loadOrder(id: string): Promise<OrderData> {
  await supabase.rpc('expire_overdue_orders');
  const { data: order } = await supabase.from('orders').select(ORDER_COLUMNS).eq('id', id).maybeSingle<Order>();
  if (!order) return { order: null, business: null, customerName: null };
  const [businessResult, customerResult] = await Promise.all([
    supabase.rpc('get_business_profile', { p_business_id: order.business_id }).maybeSingle<BusinessProfile>(),
    supabase.from('public_profiles').select('display_name').eq('id', order.customer_id).maybeSingle(),
  ]);
  return { order, business: businessResult.data ?? null, customerName: customerResult.data?.display_name ?? null };
}

// Detalle y seguimiento en vivo de un pedido. El cliente lo sigue; el vendedor lo avanza.
export default function OrderScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { business: myBusiness } = useMyBusiness();
  const { refresh: refreshSellerOrders } = useSellerOrders();
  const [data, setData] = useState<OrderData | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<OrderStatus | null>(null);

  const reload = useCallback(async () => setData(await loadOrder(id)), [id]);

  useEffect(() => {
    let active = true;
    const update = () => {
      loadOrder(id).then((next) => {
        if (active) setData(next);
      });
    };
    update();
    const channel = supabase
      .channel(`order-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, update)
      .subscribe();
    const timer = setInterval(update, 60 * 1000);
    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [id]);

  if (data === undefined) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  const { order, business, customerName } = data;
  if (!order) {
    return (
      <Screen>
        <BackHeader title="Pedido" onBack={() => router.navigate('/pedidos')} />
        <ThemedText>No encontramos este pedido.</ThemedText>
      </Screen>
    );
  }

  const isSeller = myBusiness?.id === order.business_id;
  const next = isSeller ? sellerNextStep(order) : null;
  const left = order.status === 'new' ? minutesLeft(order.accept_by) : null;
  const steps = trackingSteps(order);
  const currentStep = steps.indexOf(order.status);
  const finished = isFinished(order.status);
  const contact = isSeller ? order.contact_phone : (business?.whatsapp ?? business?.phone ?? null);

  async function changeStatus(status: OrderStatus) {
    setError(null);
    setPending(status);
    const { error: rpcError } = await supabase.rpc('set_order_status', { p_order_id: order!.id, p_status: status });
    setPending(null);
    if (rpcError) setError(friendlyError(rpcError, 'No pudimos actualizar el pedido. Probá de nuevo.'));
    await reload();
    if (isSeller) await refreshSellerOrders();
  }

  const sellerCancel =
    order.status === 'new'
      ? {
          status: 'rejected' as const,
          label: 'Rechazar',
          question: '¿Rechazás el pedido? Al cliente se le devuelve el dinero.',
        }
      : ['accepted', 'preparing', 'ready'].includes(order.status)
        ? {
            status: 'cancelled' as const,
            label: 'Cancelar pedido',
            question: '¿Cancelás el pedido? Al cliente se le devuelve el dinero y cuenta en tu reputación.',
          }
        : null;
  const customerCanCancel = !isSeller && (order.status === 'new' || order.status === 'awaiting_payment');
  const customerCanConfirm = !isSeller && (order.status === 'ready' || order.status === 'on_the_way');

  const footer = isSeller ? (
    next || sellerCancel ? (
      <View style={styles.footer}>
        {next ? (
          <Button
            title={next.label}
            variant="accent"
            onPress={() => changeStatus(next.status)}
            loading={pending === next.status}
          />
        ) : null}
        {sellerCancel ? (
          <Button
            title={sellerCancel.label}
            variant="ghost"
            onPress={() =>
              confirmAction(sellerCancel.label, sellerCancel.question, sellerCancel.label, () =>
                changeStatus(sellerCancel.status),
              )
            }
            loading={pending === sellerCancel.status}
          />
        ) : null}
      </View>
    ) : null
  ) : customerCanConfirm ? (
    <Button
      title="Ya lo recibí"
      variant="accent"
      onPress={() => changeStatus('delivered')}
      loading={pending === 'delivered'}
    />
  ) : customerCanCancel ? (
    <Button
      title="Cancelar pedido"
      variant="outline"
      onPress={() =>
        confirmAction('Cancelar pedido', '¿Seguro? Te devolvemos el dinero.', 'Cancelar pedido', () =>
          changeStatus('cancelled'),
        )
      }
      loading={pending === 'cancelled'}
    />
  ) : undefined;

  return (
    <Screen footer={footer}>
      <BackHeader
        title={`Pedido #${order.number}`}
        onBack={() => (router.canGoBack() ? router.back() : router.navigate('/pedidos'))}
      />

      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <ThemedText type="defaultBold">{isSeller ? (customerName ?? 'Cliente') : (business?.name ?? '')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {order.type === 'delivery' ? 'Delivery' : 'Retiro en el lugar'} · {formatDateTime(order.created_at)}
          </ThemedText>
        </View>
        <StatusBadge status={order.status} />
      </View>

      {order.scheduled_for ? (
        <View style={[styles.notice, { backgroundColor: theme.primarySoft }]}>
          <Icon sf="clock" md="schedule" size={22} color={theme.primary} />
          <ThemedText type="defaultBold" style={styles.flex}>
            Programado para las {formatTime(order.scheduled_for)}
          </ThemedText>
        </View>
      ) : null}

      {left !== null ? (
        <ThemedText type="small" style={{ color: theme.primary }}>
          {isSeller
            ? `Tenés ${left} min para aceptarlo. Si no, se cancela solo y se le devuelve el dinero al cliente.`
            : `El negocio tiene ${left} min para aceptarlo. Si no, se cancela y te devolvemos el dinero.`}
        </ThemedText>
      ) : null}

      {!finished && currentStep >= 0 ? (
        <View style={[styles.steps, { borderColor: theme.border }]}>
          {steps.map((step, index) => {
            const done = index <= currentStep;
            return (
              <View key={step} style={styles.step}>
                <View style={[styles.stepDot, { backgroundColor: done ? theme.accent : theme.backgroundSelected }]}>
                  {done ? <Icon sf="checkmark" md="check" size={14} color={theme.onAccent} /> : null}
                </View>
                <ThemedText
                  type={index === currentStep ? 'defaultBold' : 'small'}
                  themeColor={done ? 'text' : 'textSecondary'}>
                  {step === 'new' ? 'Pedido enviado' : STATUS_LABELS[step]}
                </ThemedText>
              </View>
            );
          })}
        </View>
      ) : null}

      {['rejected', 'expired', 'cancelled'].includes(order.status) && order.payment_method === 'mercadopago' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {isSeller ? 'Al cliente se le devuelve el dinero.' : 'Te devolvemos el dinero por el mismo medio de pago.'}
        </ThemedText>
      ) : null}

      <View style={[styles.box, { borderColor: theme.border }]}>
        {order.order_items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <ThemedText type="defaultBold">{item.quantity} ×</ThemedText>
            <View style={styles.flex}>
              <ThemedText>{nameWithUnit(item.product_name, item.sale_unit)}</ThemedText>
              {item.note ? (
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  {item.note}
                </ThemedText>
              ) : null}
            </View>
            <ThemedText>{formatPrice(item.unit_price * item.quantity)}</ThemedText>
          </View>
        ))}
        <View style={[styles.totals, { borderColor: theme.border }]}>
          {order.delivery_fee > 0 ? <Row label="Envío" value={formatPrice(order.delivery_fee)} /> : null}
          <Row label="Total" value={formatPrice(order.total)} bold />
          <Row label="Pago" value={order.payment_method === 'cash' ? 'Efectivo al recibir' : 'Mercado Pago'} />
        </View>
      </View>

      {order.notes ? (
        <View style={styles.block}>
          <ThemedText type="smallBold">Aclaraciones</ThemedText>
          <ThemedText>{order.notes}</ThemedText>
        </View>
      ) : null}

      {order.type === 'delivery' && order.delivery_address ? (
        <View style={styles.block}>
          <ThemedText type="smallBold">Dirección de entrega</ThemedText>
          <ThemedText>{order.delivery_address}</ThemedText>
        </View>
      ) : !isSeller && business?.address ? (
        <View style={styles.block}>
          <ThemedText type="smallBold">Dónde retirarlo</ThemedText>
          <ThemedText>{business.address}</ThemedText>
        </View>
      ) : null}

      {contact && !finished ? (
        <Button
          title={isSeller ? 'Escribirle al cliente' : 'Escribirle al negocio'}
          variant="outline"
          icon={<Icon sf="message" md="chat" size={20} color={theme.text} />}
          onPress={() =>
            Linking.openURL(whatsappLink(contact, `Hola! Te escribo por el pedido #${order.number} de Algopacome.`))
          }
        />
      ) : null}

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type={bold ? 'defaultBold' : 'small'} style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'defaultBold' : 'small'}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  steps: {
    borderWidth: 1.5,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    borderWidth: 1.5,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  itemRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  totals: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
  },
  block: {
    gap: Spacing.one,
  },
  footer: {
    gap: Spacing.one,
  },
});
