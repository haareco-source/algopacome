import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { Button } from '@/components/button';
import { ChoiceChips } from '@/components/choice-chips';
import { QuantityStepper } from '@/components/quantity-stepper';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice } from '@/lib/business';
import { deliveryFeeFor, formatEta, type BusinessProfile } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/providers/cart';

type OrderType = 'pickup' | 'delivery';

// Carrito de un negocio: cantidades, retiro o delivery y total. Confirmar el pedido llega con los pedidos.
export default function CartScreen() {
  const theme = useTheme();
  const { cart, subtotal, setQuantity, clear } = useCart();
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const businessId = cart?.businessId;

  useEffect(() => {
    if (!businessId) return;
    let active = true;
    supabase
      .rpc('get_business_profile', { p_business_id: businessId })
      .maybeSingle<BusinessProfile>()
      .then(({ data }) => {
        if (active) setBusiness(data ?? null);
      });
    return () => {
      active = false;
    };
  }, [businessId]);

  if (!cart) {
    return (
      <Screen>
        <BackHeader title="Tu carrito" />
        <View style={styles.empty}>
          <ThemedText style={styles.emptyEmoji}>🛒</ThemedText>
          <ThemedText type="defaultBold">Tu carrito está vacío</ThemedText>
          <Button title="Buscar comida" onPress={() => router.replace('/buscar')} style={styles.stretch} />
        </View>
      </Screen>
    );
  }

  const options = [
    ...(business?.offers_pickup ? [{ value: 'pickup' as const, label: 'Retiro en el lugar' }] : []),
    ...(business?.offers_delivery ? [{ value: 'delivery' as const, label: 'Delivery' }] : []),
  ];
  // Si el negocio ofrece una sola forma de entrega, queda elegida.
  const selectedType = orderType ?? (options.length === 1 ? options[0].value : null);
  const deliveryFee =
    selectedType === 'delivery' && business
      ? deliveryFeeFor(business.delivery_fee_mode, business.delivery_fee, business.free_over, subtotal)
      : 0;
  const eta = business ? formatEta(business.eta_min_minutes, business.eta_max_minutes) : null;

  return (
    <Screen
      footer={
        <View style={styles.footerContent}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Muy pronto vas a poder confirmar el pedido y pagar desde acá.
          </ThemedText>
          <Button title={`Confirmar pedido · ${formatPrice(subtotal + deliveryFee)}`} disabled />
        </View>
      }>
      <BackHeader title="Tu carrito" />

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/negocio/[id]', params: { id: cart.businessId } })}>
        <ThemedText type="defaultBold" style={{ color: theme.primary }}>
          {cart.businessName}
        </ThemedText>
        {business && !business.is_open ? (
          <ThemedText type="small" style={{ color: theme.danger }}>
            Ahora está cerrado: vas a poder pedir cuando abra.
          </ThemedText>
        ) : eta ? (
          <ThemedText type="small" themeColor="textSecondary">
            Demora {eta}
          </ThemedText>
        ) : null}
      </Pressable>

      <View style={[styles.items, { borderColor: theme.border }]}>
        {cart.items.map((item, index) => (
          <View key={item.productId} style={[styles.item, index > 0 && { borderTopWidth: 1, borderColor: theme.border }]}>
            <View style={styles.flex}>
              <ThemedText type="defaultBold">{item.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatPrice(item.price * item.quantity)}
              </ThemedText>
            </View>
            <QuantityStepper value={item.quantity} onChange={(quantity) => setQuantity(item.productId, quantity)} />
          </View>
        ))}
      </View>

      <Button title="Agregar más productos" variant="outline" onPress={() => router.push({ pathname: '/negocio/[id]', params: { id: cart.businessId } })} />

      {options.length > 0 ? (
        <ChoiceChips label="¿Cómo lo recibís?" options={options} value={selectedType} onChange={setOrderType} />
      ) : null}

      <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
        <SummaryRow label="Productos" value={formatPrice(subtotal)} />
        {selectedType === 'delivery' ? (
          <SummaryRow label="Envío" value={deliveryFee ? formatPrice(deliveryFee) : 'Gratis'} />
        ) : null}
        <SummaryRow label="Total" value={formatPrice(subtotal + deliveryFee)} bold />
      </View>

      <Button title="Vaciar carrito" variant="ghost" onPress={clear} />
    </Screen>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText type={bold ? 'defaultBold' : 'default'} style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type={bold ? 'defaultBold' : 'default'}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  emptyEmoji: {
    fontSize: 48,
    lineHeight: 58,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  items: {
    borderWidth: 1.5,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.three,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  summary: {
    borderRadius: Radius.card,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
  },
  footerContent: {
    gap: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
});
