import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice } from '@/lib/business';
import { confirmAction } from '@/lib/confirm';
import { formatDateTime } from '@/lib/orders';
import { cancelPlus, mercadoPagoLink, mercadoPagoLinkUrl, openMercadoPago, type Billing } from '@/lib/payments';
import { supabase } from '@/lib/supabase';
import { useMyBusiness } from '@/providers/my-business';

const LINK_RESULTS: Record<string, string> = {
  ok: '¡Listo! Tu cuenta de Mercado Pago quedó vinculada.',
  error: 'No pudimos vincular tu cuenta de Mercado Pago. Probá de nuevo.',
};

// Cobros del vendedor: cuenta de Mercado Pago, comisiones, deuda de efectivo y plan.
export default function BillingScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ mp?: string; plus?: string }>();
  const { refresh: refreshBusiness } = useMyBusiness();
  const [billing, setBilling] = useState<Billing | null>(null);
  const [notice, setNotice] = useState<string | null>(params.mp ? (LINK_RESULTS[params.mp] ?? null) : null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'link' | 'plus' | 'cancel' | 'debt' | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('get_my_billing');
    setBilling((data as Billing | null) ?? null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function afterMercadoPago(returnUrl: string | null) {
    const result = returnUrl ? new URL(returnUrl).searchParams.get('mp') : null;
    if (result) setNotice(LINK_RESULTS[result] ?? null);
    await Promise.all([load(), refreshBusiness()]);
  }

  async function linkMercadoPago() {
    setError(null);
    setNotice(null);
    setBusy('link');
    const { data, error: rpcError } = await supabase.rpc('start_mp_link');
    if (rpcError || !data) {
      setBusy(null);
      setError('No pudimos abrir Mercado Pago. Probá de nuevo.');
      return;
    }
    await afterMercadoPago(await openMercadoPago(mercadoPagoLinkUrl(data as string)));
    setBusy(null);
  }

  async function openPayment(route: 'plus' | 'deuda') {
    setError(null);
    setNotice(null);
    setBusy(route === 'plus' ? 'plus' : 'debt');
    const { url, error: linkError } = await mercadoPagoLink(route);
    if (url) await afterMercadoPago(await openMercadoPago(url));
    else setError(linkError);
    setBusy(null);
  }

  function confirmCancelPlus() {
    confirmAction(
      'Cancelar plan Plus',
      'Volvés al plan gratis. Si tenés más de 5 productos a la vista, los que sobran quedan ocultos (no se borran) y elegís cuáles mostrar.',
      'Cancelar plan',
      async () => {
        setError(null);
        setBusy('cancel');
        const cancelError = await cancelPlus();
        if (cancelError) setError(cancelError);
        await Promise.all([load(), refreshBusiness()]);
        setBusy(null);
      },
    );
  }

  if (!billing) {
    return (
      <Screen>
        <BackHeader title="Cobros y plan" />
        <ActivityIndicator color={theme.primary} />
      </Screen>
    );
  }

  const showCash = billing.accepts_cash || billing.cash_debt > 0;
  const cashPaused = billing.cash_debt >= billing.cash_debt_limit;

  return (
    <Screen>
      <BackHeader title="Cobros y plan" />

      {notice || params.plus ? (
        <ThemedText type="smallBold" style={{ color: theme.accent }}>
          {notice ?? 'Cuando Mercado Pago confirme el primer cobro, tu plan pasa a Plus.'}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      <Card title="Mercado Pago" sf="creditcard" md="credit_card">
        {billing.accepts_mercadopago ? (
          <ThemedText>
            Tu cuenta está vinculada. Lo que pagan tus clientes entra directo a tu cuenta de Mercado Pago, con la
            comisión de Algopacome ya descontada.
          </ThemedText>
        ) : (
          <>
            <ThemedText>
              Vinculá tu cuenta para cobrar los pedidos con Mercado Pago. La plata entra directo a tu cuenta y
              Algopacome solo retiene su comisión.
            </ThemedText>
            <Button
              title="Vincular Mercado Pago"
              variant="accent"
              onPress={linkMercadoPago}
              loading={busy === 'link'}
            />
          </>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          Mercado Pago te cobra aparte su propio cargo por cada cobro, como en cualquier venta tuya.
          {billing.payments_simulated ? ' Mientras probamos la app, los pagos son simulados.' : ''}
        </ThemedText>
      </Card>

      <Card title="Comisión de Algopacome" sf="percent" md="percent">
        <ThemedText>
          {billing.free_orders_left > 0
            ? `Te quedan ${billing.free_orders_left} pedidos sin comisión. Después es del ${billing.next_commission_pct} % sobre los productos.`
            : `Tu comisión es del ${billing.commission_pct} % sobre los productos de cada pedido entregado.`}{' '}
          El envío no paga comisión.
        </ThemedText>
        <View style={styles.stats}>
          <Stat label="Pedidos este mes" value={String(billing.month_orders)} />
          <Stat label="Ventas" value={formatPrice(billing.month_sales)} />
          <Stat label="Comisión" value={formatPrice(billing.month_commission)} />
        </View>
      </Card>

      {showCash ? (
        <Card title="Pedidos en efectivo" sf="banknote" md="payments">
          <ThemedText>
            Comisiones a pagar: <ThemedText type="defaultBold">{formatPrice(billing.cash_debt)}</ThemedText>
          </ThemedText>
          <ThemedText type="small" style={{ color: cashPaused ? theme.danger : theme.textSecondary }}>
            {cashPaused
              ? 'Llegaste al tope: tus clientes no pueden pagarte en efectivo hasta que pagues las comisiones.'
              : `Si llegás a ${formatPrice(billing.cash_debt_limit)}, se pausa el cobro en efectivo hasta que pagues.`}
          </ThemedText>
          {billing.cash_debt > 0 ? (
            <Button
              title={`Pagar comisiones · ${formatPrice(billing.cash_debt)}`}
              variant="outline"
              onPress={() => openPayment('deuda')}
              loading={busy === 'debt'}
            />
          ) : null}
        </Card>
      ) : null}

      <Card title={billing.plan === 'plus' ? 'Tu plan: Plus' : 'Tu plan: gratis'} sf="star" md="star">
        {billing.plan === 'plus' ? (
          <>
            <ThemedText>
              Podés tener hasta {billing.plus_product_limit} productos a la vista.
              {billing.next_charge_at ? ` Próximo cobro: ${formatDateTime(billing.next_charge_at)}.` : ''}
            </ThemedText>
            <Button
              title="Cancelar plan Plus"
              variant="ghost"
              onPress={confirmCancelPlus}
              loading={busy === 'cancel'}
            />
          </>
        ) : (
          <>
            <ThemedText>
              Podés tener hasta {billing.product_limit} productos a la vista. Con Plus llegás a{' '}
              {billing.plus_product_limit}, por {formatPrice(billing.plus_price_ars)} por mes.
            </ThemedText>
            {billing.subscription_status === 'pending' ? (
              <ThemedText type="small" themeColor="textSecondary">
                Si ya te suscribiste, esperamos la confirmación de Mercado Pago.
              </ThemedText>
            ) : null}
            <Button
              title={`Pasar a Plus · ${formatPrice(billing.plus_price_ars)} por mes`}
              onPress={() => openPayment('plus')}
              loading={busy === 'plus'}
            />
            <ThemedText type="small" themeColor="textSecondary">
              Se cobra todos los meses con Mercado Pago y lo cancelás cuando quieras.
            </ThemedText>
          </>
        )}
      </Card>
    </Screen>
  );
}

function Card({
  title,
  sf,
  md,
  children,
}: {
  title: string;
  sf: 'creditcard' | 'percent' | 'banknote' | 'star';
  md: 'credit_card' | 'percent' | 'payments' | 'star';
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardTitle}>
        <Icon sf={sf} md={md} size={22} color={theme.primary} />
        <ThemedText type="heading">{title}</ThemedText>
      </View>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="defaultBold">{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    borderRadius: Radius.card,
    padding: Spacing.two,
    gap: Spacing.half,
  },
});
