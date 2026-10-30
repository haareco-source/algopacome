import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CartBar } from '@/components/cart-bar';
import { Icon } from '@/components/icon';
import { OpenBadge } from '@/components/open-badge';
import { ProductRow } from '@/components/product-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { BUSINESS_TYPES, formatPrice, WEEK_ORDER, WEEKDAYS } from '@/lib/business';
import { formatDeliveryFee, formatEta, formatRating, whatsappLink, type BusinessProfile } from '@/lib/catalog';
import { publicUrl } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import type { BusinessHour, Product } from '@/lib/types';

type MenuProduct = Pick<Product, 'id' | 'name' | 'description' | 'price' | 'sale_unit' | 'photo_path' | 'category_id' | 'is_available'>;

// Perfil público del negocio: portada, datos, horarios, entrega y menú.
export default function BusinessScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useCategories();
  const [business, setBusiness] = useState<BusinessProfile | null | undefined>(undefined);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [hours, setHours] = useState<BusinessHour[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.rpc('get_business_profile', { p_business_id: id }).maybeSingle<BusinessProfile>(),
      supabase
        .from('products')
        .select('id, name, description, price, sale_unit, photo_path, category_id, is_available')
        .eq('business_id', id)
        .eq('status', 'active')
        .order('score', { ascending: false }),
      supabase.from('business_hours').select('weekday, opens_at, closes_at').eq('business_id', id),
    ]).then(([businessResult, productsResult, hoursResult]) => {
      if (!active) return;
      setBusiness(businessResult.data ?? null);
      setProducts(productsResult.data ?? []);
      setHours(hoursResult.data ?? []);
    });
    return () => {
      active = false;
    };
  }, [id]);

  if (business === undefined) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (business === null) {
    return (
      <Screen>
        <BackButton />
        <ThemedText type="heading">Este negocio no está disponible</ThemedText>
      </Screen>
    );
  }

  const cover = publicUrl('business-media', business.cover_path);
  const logo = publicUrl('business-media', business.logo_path);
  const typeInfo = BUSINESS_TYPES.find((option) => option.value === business.type);
  const eta = formatEta(business.eta_min_minutes, business.eta_max_minutes);
  const contact = business.whatsapp ?? business.phone;

  // Menú agrupado por categoría, en el orden de la base.
  const sections = categories
    .map((category) => ({ category, items: products.filter((product) => product.category_id === category.id) }))
    .filter((section) => section.items.length > 0);
  const uncategorized = products.filter((product) => !categories.some((category) => category.id === product.category_id));
  if (uncategorized.length > 0) sections.push({ category: { id: 0, name: 'Otros', sort_order: 99 }, items: uncategorized });

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Screen footer={<CartBar />}>
        <View style={[styles.cover, { backgroundColor: theme.primarySoft, marginTop: -insets.top - Spacing.four }]}>
          {cover ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <ThemedText style={styles.coverEmoji}>{typeInfo?.emoji}</ThemedText>
          )}
          <View style={[styles.coverBack, { top: insets.top + Spacing.three }]}>
            <BackButton />
          </View>
        </View>

        <View style={styles.identity}>
          <View style={[styles.logo, { backgroundColor: theme.background, borderColor: theme.border }]}>
            {logo ? (
              <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <ThemedText style={styles.logoEmoji}>{typeInfo?.emoji}</ThemedText>
            )}
          </View>
          <View style={styles.flex}>
            <ThemedText type="subtitle" numberOfLines={2}>
              {business.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {typeInfo?.label} · {formatRating(business.rating_avg, business.rating_count)}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.facts, { borderColor: theme.border }]}>
          <Fact label="Estado" value={<OpenBadge isOpen={business.is_open} />} />
          <Fact label="Demora" value={eta ?? '—'} />
          <Fact
            label="Entrega"
            value={
              business.offers_delivery
                ? (formatDeliveryFee(business.delivery_fee_mode, business.delivery_fee) ?? '—')
                : 'Solo retiro'
            }
          />
        </View>

        {business.description ? <ThemedText>{business.description}</ThemedText> : null}
        {business.ingredients ? (
          <ThemedText type="small" themeColor="textSecondary">
            Insumos: {business.ingredients}
          </ThemedText>
        ) : null}

        <View style={styles.infoList}>
          {business.address ? (
            <InfoRow sf="mappin.and.ellipse" md="location_on" text={business.address} />
          ) : null}
          <InfoRow
            sf="creditcard"
            md="payments"
            text={business.accepts_cash ? 'Mercado Pago o efectivo' : 'Pago con Mercado Pago'}
          />
          {business.offers_delivery && business.delivery_fee_mode === 'free_over' && business.free_over ? (
            <InfoRow sf="bicycle" md="delivery_dining" text={`Envío gratis desde ${formatPrice(business.free_over)}`} />
          ) : null}
        </View>

        <View style={styles.actions}>
          {business.lat !== null && business.lng !== null ? (
            <ActionChip
              sf="map"
              md="map"
              label="Cómo llegar"
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${business.lat},${business.lng}`)}
            />
          ) : null}
          <ActionChip
            sf="message"
            md="chat"
            label="WhatsApp"
            onPress={() => Linking.openURL(whatsappLink(contact, `Hola! Te escribo desde Algopacome.`))}
          />
        </View>

        {sections.length === 0 ? (
          <ThemedText themeColor="textSecondary">Este negocio todavía no tiene productos.</ThemedText>
        ) : (
          sections.map((section) => (
            <View key={section.category.id} style={styles.section}>
              <ThemedText type="heading">{section.category.name}</ThemedText>
              <View>
                {section.items.map((product) => (
                  <ProductRow
                    key={product.id}
                    name={product.name}
                    description={product.description}
                    price={product.price}
                    saleUnit={product.sale_unit}
                    photoPath={product.photo_path}
                    subtitle={product.is_available ? undefined : 'Sin stock por ahora'}
                    onPress={() => router.push({ pathname: '/producto/[id]', params: { id: product.id } })}
                  />
                ))}
              </View>
            </View>
          ))
        )}

        {hours.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="heading">Horarios</ThemedText>
            {WEEK_ORDER.map((weekday) => {
              const day = hours.filter((hour) => hour.weekday === weekday);
              return (
                <View key={weekday} style={styles.hourRow}>
                  <ThemedText style={styles.flex}>{WEEKDAYS[weekday]}</ThemedText>
                  <ThemedText themeColor={day.length ? 'text' : 'textSecondary'}>
                    {day.length
                      ? day.map((hour) => `${hour.opens_at.slice(0, 5)} a ${hour.closes_at.slice(0, 5)}`).join(', ')
                      : 'Cerrado'}
                  </ThemedText>
                </View>
              );
            })}
          </View>
        ) : null}
      </Screen>
    </View>
  );
}

function BackButton() {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Volver"
      onPress={() => router.back()}
      style={[styles.back, { backgroundColor: theme.background }]}>
      <Icon sf="chevron.left" md="arrow_back" size={22} color={theme.text} />
    </Pressable>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.fact}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {typeof value === 'string' ? <ThemedText type="smallBold">{value}</ThemedText> : value}
    </View>
  );
}

type IconName = { sf: ComponentProps<typeof Icon>['sf']; md: ComponentProps<typeof Icon>['md'] };

function InfoRow({ sf, md, text }: IconName & { text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.infoRow}>
      <Icon sf={sf} md={md} size={20} color={theme.primary} />
      <ThemedText type="small" style={styles.flex}>
        {text}
      </ThemedText>
    </View>
  );
}

function ActionChip({ sf, md, label, onPress }: IconName & { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionChip, { borderColor: theme.text }, pressed && styles.pressed]}>
      <Icon sf={sf} md={md} size={18} color={theme.text} />
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
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
  cover: {
    aspectRatio: 16 / 9,
    marginHorizontal: -Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmoji: {
    fontSize: 64,
    lineHeight: 76,
  },
  coverBack: {
    position: 'absolute',
    left: Spacing.four,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: Radius.card,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  facts: {
    flexDirection: 'row',
    borderWidth: 1.5,
    borderRadius: Radius.card,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  fact: {
    flex: 1,
    gap: Spacing.one,
  },
  infoList: {
    gap: Spacing.two,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
  section: {
    gap: Spacing.two,
  },
  hourRow: {
    flexDirection: 'row',
  },
});
