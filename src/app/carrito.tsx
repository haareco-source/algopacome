import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { Button } from '@/components/button';
import { ChoiceChips } from '@/components/choice-chips';
import { QuantityStepper } from '@/components/quantity-stepper';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice, friendlyError } from '@/lib/business';
import { deliveryFeeFor, formatEta, type BusinessProfile } from '@/lib/catalog';
import { formatTime } from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/providers/cart';

type OrderType = 'pickup' | 'delivery';
type When = 'now' | 'later';
type PaymentMethod = 'mercadopago' | 'cash';

// Dirección y teléfono del último delivery, para no tipearlos cada vez.
const CONTACT_KEY = 'algopacome.delivery-contact';

function readContact(): { address: string; phone: string } {
  try {
    const stored = globalThis.localStorage?.getItem(CONTACT_KEY);
    return stored ? JSON.parse(stored) : { address: '', phone: '' };
  } catch {
    return { address: '', phone: '' };
  }
}

// Carrito de un negocio: cantidades, cuándo, retiro o delivery, pago y confirmación.
export default function CartScreen() {
  const theme = useTheme();
  const { cart, subtotal, setQuantity, clear } = useCart();
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [orderType, setOrderType] = useState<OrderType | null>(null);
  const [when, setWhen] = useState<When | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>('mercadopago');
  const [contact, setContact] = useState(readContact);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const businessId = cart?.businessId;

  useEffect(() => {
    if (!businessId) return;
    let active = true;
    supabase
      .rpc('get_business_profile', { p_business_id: businessId })
      .maybeSingle<BusinessProfile>()
      .then(async ({ data }) => {
        if (!active) return;
        setBusiness(data ?? null);
        if (!data?.accepts_scheduled) return;
        const { data: slotRows } = await supabase.rpc('get_schedule_slots', { p_business_id: businessId });
        if (active) setSlots((slotRows as string[] | null) ?? []);
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

  const typeOptions = [
    ...(business?.offers_pickup ? [{ value: 'pickup' as const, label: 'Retiro en el lugar' }] : []),
    ...(business?.offers_delivery ? [{ value: 'delivery' as const, label: 'Delivery' }] : []),
  ];
  // Si el negocio ofrece una sola forma de entrega, queda elegida.
  const selectedType = orderType ?? (typeOptions.length === 1 ? typeOptions[0].value : null);

  const whenOptions = [
    ...(business?.is_open ? [{ value: 'now' as const, label: 'Lo antes posible' }] : []),
    ...(business?.accepts_scheduled && slots.length > 0 ? [{ value: 'later' as const, label: 'Programar' }] : []),
  ];
  const selectedWhen = when ?? whenOptions[0]?.value ?? null;

  const paymentOptions = [
    { value: 'mercadopago' as const, label: 'Mercado Pago' },
    ...(business?.accepts_cash && selectedWhen === 'now' ? [{ value: 'cash' as const, label: 'Efectivo' }] : []),
  ];
  const selectedPayment = paymentOptions.some((option) => option.value === payment) ? payment : 'mercadopago';

  const deliveryFee =
    selectedType === 'delivery' && business
      ? deliveryFeeFor(business.delivery_fee_mode, business.delivery_fee, business.free_over, subtotal)
      : 0;
  const total = subtotal + deliveryFee;
  const eta = business ? formatEta(business.eta_min_minutes, business.eta_max_minutes) : null;

  const missing = !business
    ? 'Cargando…'
    : !selectedWhen
      ? 'El negocio está cerrado y no toma pedidos programados.'
      : selectedWhen === 'later' && !slot
        ? 'Elegí el horario.'
        : !selectedType
          ? 'Elegí cómo lo recibís.'
          : selectedType === 'delivery' && !contact.address.trim()
            ? 'Falta la dirección de entrega.'
            : null;

  async function confirm() {
    if (!cart || missing) return;
    setError(null);
    setIsSending(true);
    const { data, error: rpcError } = await supabase.rpc('create_order', {
      p_business_id: cart.businessId,
      p_items: cart.items.map((item) => ({ product_id: item.productId, quantity: item.quantity })),
      p_type: selectedType,
      p_payment_method: selectedPayment,
      p_scheduled_for: selectedWhen === 'later' ? slot : null,
      p_delivery_address: selectedType === 'delivery' ? contact.address.trim() : null,
      p_contact_phone: selectedType === 'delivery' ? contact.phone.trim() : null,
      p_notes: notes.trim() || null,
    });
    setIsSending(false);
    if (rpcError || !data) {
      setError(friendlyError(rpcError, 'No pudimos confirmar el pedido. Probá de nuevo.'));
      return;
    }
    if (selectedType === 'delivery') {
      try {
        globalThis.localStorage?.setItem(CONTACT_KEY, JSON.stringify(contact));
      } catch {}
    }
    clear();
    router.replace({ pathname: '/pedido/[id]', params: { id: data as string } });
  }

  return (
    <Screen
      footer={
        <View style={styles.footerContent}>
          {error || missing ? (
            <ThemedText type="small" style={[styles.center, { color: error ? theme.danger : theme.textSecondary }]}>
              {error ?? missing}
            </ThemedText>
          ) : null}
          <Button
            title={`Confirmar pedido · ${formatPrice(total)}`}
            onPress={confirm}
            disabled={!!missing}
            loading={isSending}
          />
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
            {business.accepts_scheduled ? 'Ahora está cerrado: podés programar tu pedido.' : 'Ahora está cerrado.'}
          </ThemedText>
        ) : eta ? (
          <ThemedText type="small" themeColor="textSecondary">
            Demora {eta}
          </ThemedText>
        ) : null}
      </Pressable>

      <View style={[styles.items, { borderColor: theme.border }]}>
        {cart.items.map((item, index) => (
          <View
            key={item.productId}
            style={[styles.item, index > 0 && { borderTopWidth: 1, borderColor: theme.border }]}>
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

      <Button
        title="Agregar más productos"
        variant="outline"
        onPress={() => router.push({ pathname: '/negocio/[id]', params: { id: cart.businessId } })}
      />

      {whenOptions.length > 0 ? (
        <ChoiceChips label="¿Para cuándo?" options={whenOptions} value={selectedWhen} onChange={setWhen} />
      ) : null}

      {selectedWhen === 'later' ? (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            Elegí a qué hora lo querés. El negocio confirma el pedido antes; si no lo acepta, te devolvemos el dinero.
          </ThemedText>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.slotScroll}
            contentContainerStyle={styles.slots}>
            {slots.map((value) => {
              const selected = value === slot;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => setSlot(value)}
                  style={[
                    styles.slot,
                    { borderColor: selected ? theme.primary : theme.border },
                    selected && { backgroundColor: theme.primary },
                  ]}>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
                    {formatTime(value)}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {typeOptions.length > 0 ? (
        <ChoiceChips label="¿Cómo lo recibís?" options={typeOptions} value={selectedType} onChange={setOrderType} />
      ) : null}

      {selectedType === 'delivery' ? (
        <View style={styles.block}>
          <TextField
            label="Dirección de entrega"
            value={contact.address}
            onChangeText={(address) => setContact({ ...contact, address })}
            placeholder="Calle, número y alguna referencia"
          />
          <TextField
            label="Teléfono para el delivery"
            value={contact.phone}
            onChangeText={(phone) => setContact({ ...contact, phone })}
            placeholder="388 412 3456"
            keyboardType="phone-pad"
          />
        </View>
      ) : null}

      <ChoiceChips label="¿Cómo pagás?" options={paymentOptions} value={selectedPayment} onChange={setPayment} />
      {selectedPayment === 'mercadopago' ? (
        <ThemedText type="small" themeColor="textSecondary">
          Mientras probamos la app el pago es simulado: el pedido se confirma sin cobrarte.
        </ThemedText>
      ) : null}

      <TextField
        label="Aclaraciones (opcional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="Sin cebolla, tocar timbre…"
        maxLength={300}
      />

      <View style={[styles.summary, { backgroundColor: theme.backgroundElement }]}>
        <SummaryRow label="Productos" value={formatPrice(subtotal)} />
        {selectedType === 'delivery' ? (
          <SummaryRow label="Envío" value={deliveryFee ? formatPrice(deliveryFee) : 'Gratis'} />
        ) : null}
        <SummaryRow label="Total" value={formatPrice(total)} bold />
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
  block: {
    gap: Spacing.two,
  },
  slotScroll: {
    flexGrow: 0,
  },
  slots: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  slot: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
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
