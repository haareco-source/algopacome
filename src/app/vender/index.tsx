import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BUSINESS_TYPES, formatUnitPrice, friendlyError, sellerOpenStatus } from '@/lib/business';
import { publicUrl } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { useMyBusiness } from '@/providers/my-business';

const STATUS_LABELS = {
  draft: 'Borrador',
  active: 'Publicado',
  hidden: 'Oculto por moderación',
  suspended: 'Suspendido',
} as const;

// Panel del vendedor: abierto/cerrado, publicación, productos y accesos a editar.
export default function SellerHomeScreen() {
  const theme = useTheme();
  const { business, products, hours, productLimit, isLoading, refresh } = useMyBusiness();
  const [message, setMessage] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!business) return <Redirect href="/vender/alta" />;

  const activeProducts = products.filter((product) => product.status === 'active');
  const atLimit = activeProducts.length >= productLimit;
  const typeInfo = BUSINESS_TYPES.find((option) => option.value === business.type);
  const logo = publicUrl('business-media', business.logo_path);
  const openStatus = sellerOpenStatus(business, hours);

  async function toggleOpen(isOpen: boolean) {
    setMessage(null);
    const { error } = await supabase.from('businesses').update({ is_open_now: isOpen }).eq('id', business!.id);
    if (error) setMessage('No pudimos cambiar el estado. Probá de nuevo.');
    await refresh();
  }

  async function publish() {
    setMessage(null);
    setIsPublishing(true);
    const { error } = await supabase.from('businesses').update({ status: 'active' }).eq('id', business!.id);
    setIsPublishing(false);
    if (error) setMessage(friendlyError(error, 'No pudimos publicar tu negocio. Probá de nuevo.'));
    await refresh();
  }

  async function toggleAvailable(product: Product, isAvailable: boolean) {
    await supabase.from('products').update({ is_available: isAvailable }).eq('id', product.id);
    await refresh();
  }

  return (
    <Screen
      header={
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            style={[styles.back, { backgroundColor: theme.background }]}>
            <Icon sf="chevron.left" md="arrow_back" size={22} color={theme.text} />
          </Pressable>
          <View style={styles.identity}>
            <View style={[styles.logo, { backgroundColor: theme.background }]}>
              {logo ? (
                <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <ThemedText style={styles.logoEmoji}>{typeInfo?.emoji}</ThemedText>
              )}
            </View>
            <View style={styles.flex}>
              <ThemedText type="heading" style={{ color: theme.onPrimary }} numberOfLines={2}>
                {business.name}
              </ThemedText>
              <ThemedText type="small" style={{ color: theme.onPrimary }}>
                {typeInfo?.label} · {STATUS_LABELS[business.status]}
              </ThemedText>
            </View>
          </View>
          <View style={[styles.openCard, { backgroundColor: theme.background }]}>
            <View style={[styles.dot, { backgroundColor: openStatus.isOpen ? theme.accent : theme.textSecondary }]} />
            <View style={styles.flex}>
              <ThemedText type="defaultBold">{openStatus.title}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {openStatus.detail}
              </ThemedText>
            </View>
            <Switch
              value={business.is_open_now}
              onValueChange={toggleOpen}
              trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </>
      }>
      {business.status === 'draft' ? (
        <View style={[styles.notice, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="defaultBold">Tu negocio todavía no se ve en la app</ThemedText>
          <ThemedText type="small">
            {activeProducts.length === 0
              ? 'Cargá al menos un producto y publicalo para que los vecinos te encuentren.'
              : 'Ya tenés productos: publicalo para que los vecinos te encuentren.'}
          </ThemedText>
          <Button
            title="Publicar mi negocio"
            variant="accent"
            onPress={publish}
            loading={isPublishing}
            disabled={activeProducts.length === 0}
          />
        </View>
      ) : null}

      {hours.length === 0 ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          No tenés horarios cargados: los clientes no saben cuándo atendés y no podés tomar pedidos programados.
        </ThemedText>
      ) : null}

      {message ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {message}
        </ThemedText>
      ) : null}

      <View style={styles.sectionHeader}>
        <ThemedText type="heading" style={styles.flex}>
          Mis productos
        </ThemedText>
        <View style={[styles.counter, { backgroundColor: atLimit ? theme.primarySoft : theme.backgroundElement }]}>
          <ThemedText type="smallBold" style={{ color: atLimit ? theme.primary : theme.text }}>
            {activeProducts.length} de {productLimit}
          </ThemedText>
        </View>
      </View>

      {products.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Icon sf="fork.knife" md="restaurant" size={32} color={theme.primary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Todavía no cargaste productos. Empezá por el que más vendés.
          </ThemedText>
        </View>
      ) : (
        <View style={[styles.list, { borderColor: theme.border }]}>
          {products.map((product, index) => {
            const photo = publicUrl('product-photos', product.photo_path);
            const isHidden = product.status === 'hidden';
            return (
              <Pressable
                key={product.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/vender/producto', params: { id: product.id } })}
                style={({ pressed }) => [
                  styles.productRow,
                  index > 0 && { borderTopWidth: 1, borderColor: theme.border },
                  pressed && { backgroundColor: theme.backgroundElement },
                ]}>
                <View style={[styles.thumb, { backgroundColor: theme.primarySoft }]}>
                  {photo ? <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
                </View>
                <View style={styles.flex}>
                  <ThemedText type="defaultBold" numberOfLines={1}>
                    {product.name}
                  </ThemedText>
                  <ThemedText type="small" style={{ color: isHidden ? theme.danger : theme.textSecondary }}>
                    {isHidden
                      ? 'Oculto por moderación'
                      : `${formatUnitPrice(product.price, product.sale_unit)}${product.is_available ? '' : ' · Sin stock'}`}
                  </ThemedText>
                </View>
                {!isHidden ? (
                  <Switch
                    accessibilityLabel={`${product.name} disponible`}
                    value={product.is_available}
                    onValueChange={(value) => toggleAvailable(product, value)}
                    trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
                    thumbColor="#FFFFFF"
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      <Button
        title="Agregar producto"
        icon={<Icon sf="plus" md="add" size={20} color={theme.onPrimary} />}
        onPress={() => router.push('/vender/producto')}
        disabled={atLimit}
      />
      {atLimit ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Llegaste al límite de {productLimit} productos de tu plan. Muy pronto vas a poder pasarte al plan Plus (hasta
          15 productos por USD 1 al mes).
        </ThemedText>
      ) : null}

      <View style={[styles.list, { borderColor: theme.border }]}>
        <MenuRow sf="pencil" md="edit" title="Datos, fotos y ubicación" onPress={() => router.push('/vender/editar')} />
        <MenuRow
          sf="clock"
          md="schedule"
          title="Horarios, entrega y programados"
          onPress={() => router.push('/vender/horarios')}
          bordered
        />
      </View>
    </Screen>
  );
}

function MenuRow({
  sf,
  md,
  title,
  onPress,
  bordered,
}: {
  sf: 'pencil' | 'clock';
  md: 'edit' | 'schedule';
  title: string;
  onPress: () => void;
  bordered?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuRow,
        bordered && { borderTopWidth: 1, borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundElement },
      ]}>
      <Icon sf={sf} md={md} size={22} color={theme.primary} />
      <ThemedText type="defaultBold" style={styles.flex}>
        {title}
      </ThemedText>
      <Icon sf="chevron.right" md="chevron_right" size={20} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    width: 64,
    height: 64,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoEmoji: {
    fontSize: 32,
    lineHeight: 40,
  },
  openCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  notice: {
    gap: Spacing.two,
    borderRadius: Radius.card,
    padding: Spacing.four,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counter: {
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  list: {
    borderRadius: Radius.card,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    minHeight: 60,
  },
  flex: {
    flex: 1,
  },
  center: {
    textAlign: 'center',
  },
});
