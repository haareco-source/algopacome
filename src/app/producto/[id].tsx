import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { OpenBadge } from '@/components/open-badge';
import { QuantityStepper } from '@/components/quantity-stepper';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice } from '@/lib/business';
import type { BusinessProfile } from '@/lib/catalog';
import { publicUrl } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useCart } from '@/providers/cart';

type ProductDetail = Pick<Product, 'id' | 'business_id' | 'name' | 'description' | 'price' | 'photo_path' | 'is_available'> & {
  likes: number;
};

// Detalle del producto con cantidad y "Agregar al carrito".
export default function ProductDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { cart, add, replaceWith } = useCart();
  const [product, setProduct] = useState<ProductDetail | null | undefined>(undefined);
  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    let active = true;
    supabase
      .from('products')
      .select('id, business_id, name, description, price, photo_path, is_available, likes')
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle<ProductDetail>()
      .then(async ({ data }) => {
        if (!active) return;
        setProduct(data ?? null);
        if (!data) return;
        const { data: profile } = await supabase
          .rpc('get_business_profile', { p_business_id: data.business_id })
          .maybeSingle<BusinessProfile>();
        if (active) setBusiness(profile ?? null);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (product === undefined) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (product === null) {
    return (
      <Screen>
        <BackButton />
        <ThemedText type="heading">Este producto ya no está disponible</ThemedText>
      </Screen>
    );
  }

  const photo = publicUrl('product-photos', product.photo_path);
  const canAdd = product.is_available && !!business;

  function addToCart() {
    if (!product || !business) return;
    const item = { productId: product.id, name: product.name, price: Number(product.price), photoPath: product.photo_path };
    const target = { id: business.business_id, name: business.name };
    if (add(target, item, quantity)) {
      router.back();
      return;
    }
    // El carrito tiene productos de otro negocio: un pedido es de un solo negocio.
    const question = `Tu carrito tiene productos de ${cart?.businessName}. ¿Lo vaciamos para pedir en ${business.name}?`;
    const replace = () => {
      replaceWith(target, item, quantity);
      router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(question)) replace();
      return;
    }
    Alert.alert('Un negocio por pedido', question, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Vaciar y agregar', onPress: replace },
    ]);
  }

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <QuantityStepper value={quantity} onChange={setQuantity} min={1} />
          <Button
            title={product.is_available ? `Agregar ${formatPrice(product.price * quantity)}` : 'Sin stock'}
            onPress={addToCart}
            disabled={!canAdd}
            style={styles.flex}
          />
        </View>
      }>
      <View style={[styles.photo, { backgroundColor: theme.primarySoft, marginTop: -insets.top - Spacing.four }]}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <ThemedText style={styles.photoEmoji}>🍽️</ThemedText>
        )}
        <View style={[styles.photoBack, { top: insets.top + Spacing.three }]}>
          <BackButton />
        </View>
      </View>

      <View style={styles.texts}>
        <ThemedText type="subtitle">{product.name}</ThemedText>
        <ThemedText type="heading" style={{ color: theme.primary }}>
          {formatPrice(product.price)}
        </ThemedText>
        {product.description ? <ThemedText themeColor="textSecondary">{product.description}</ThemedText> : null}
        {product.likes > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            👍 A {product.likes} {product.likes === 1 ? 'persona le gusta' : 'personas les gusta'}
          </ThemedText>
        ) : null}
      </View>

      {business ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/negocio/[id]', params: { id: business.business_id } })}
          style={({ pressed }) => [styles.business, { borderColor: theme.border }, pressed && styles.pressed]}>
          <View style={styles.flex}>
            <ThemedText type="small" themeColor="textSecondary">
              Lo vende
            </ThemedText>
            <ThemedText type="defaultBold">{business.name}</ThemedText>
          </View>
          <OpenBadge isOpen={business.is_open} />
          <Icon sf="chevron.right" md="chevron_right" size={20} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </Screen>
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    aspectRatio: 4 / 3,
    marginHorizontal: -Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: {
    fontSize: 72,
    lineHeight: 84,
  },
  photoBack: {
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
  texts: {
    gap: Spacing.two,
  },
  business: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1.5,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
