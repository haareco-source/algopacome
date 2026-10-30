import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BusinessCard } from '@/components/business-card';
import { CartBar } from '@/components/cart-bar';
import { Icon } from '@/components/icon';
import { ProductRow } from '@/components/product-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { CATEGORIES } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import type { BusinessCard as BusinessCardData, SearchResult } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

// Portada: buscador, categorías, negocios (abiertos primero) y productos mejor puntuados.
export default function HomeScreen() {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { profile } = useAuth();
  const categories = useCategories();
  const [businesses, setBusinesses] = useState<BusinessCardData[] | null>(null);
  const [topProducts, setTopProducts] = useState<SearchResult[]>([]);

  // Se recarga cada vez que se vuelve al inicio, para ver quién abrió.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([
        supabase.rpc('list_businesses', { p_limit: 20 }),
        supabase.rpc('search_products', { p_query: '', p_limit: 10 }),
      ]).then(([businessResult, productResult]) => {
        if (!active) return;
        setBusinesses(businessResult.data ?? []);
        setTopProducts(productResult.data ?? []);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const openBusinesses = businesses?.filter((business) => business.is_open) ?? [];
  const otherBusinesses = businesses?.filter((business) => !business.is_open) ?? [];
  const cardWidth = Math.min(width * 0.72, 320);

  function openCategory(name: string) {
    const category = categories.find((item) => item.name === name);
    router.push({ pathname: '/buscar', params: category ? { categoria: String(category.id) } : {} });
  }

  return (
    <Screen
      header={
        <>
          <View style={styles.row}>
            <Image source={require('@/assets/images/logo.png')} style={styles.logo} />
            <View style={styles.flex}>
              <ThemedText type="heading" style={{ color: theme.onPrimary }} numberOfLines={1}>
                Hola, {profile?.display_name}
              </ThemedText>
              <View style={styles.location}>
                <Icon sf="mappin.and.ellipse" md="location_on" size={16} color={theme.onPrimary} />
                <ThemedText type="small" style={{ color: theme.onPrimary }}>
                  Libertador Gral. San Martín
                </ThemedText>
              </View>
            </View>
          </View>

          <Pressable
            accessibilityRole="search"
            onPress={() => router.push('/buscar')}
            style={[styles.search, { backgroundColor: theme.background }]}>
            <ThemedText themeColor="textSecondary" style={styles.flex} numberOfLines={1}>
              ¿Qué tenés ganas de comer?
            </ThemedText>
            <View style={[styles.searchButton, { backgroundColor: theme.primary }]}>
              <Icon sf="magnifyingglass" md="search" size={20} color={theme.onPrimary} />
            </View>
          </Pressable>
        </>
      }>
      <CartBar />

      <View style={styles.section}>
        <ThemedText type="heading">Explorá por categoría</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          {CATEGORIES.map((category) => (
            <Pressable
              key={category.name}
              accessibilityRole="button"
              onPress={() => openCategory(category.name)}
              style={styles.category}>
              <View style={[styles.categoryTile, { backgroundColor: theme.primarySoft }]}>
                <ThemedText style={styles.categoryEmoji}>{category.emoji}</ThemedText>
              </View>
              <ThemedText type="small" numberOfLines={1} style={styles.categoryName}>
                {category.name}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {openBusinesses.length > 0 ? (
        <View style={styles.section}>
          <View style={styles.sectionTitle}>
            <View style={[styles.dot, { backgroundColor: theme.accent }]} />
            <ThemedText type="heading">Abiertos ahora</ThemedText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cards}>
            {openBusinesses.map((business) => (
              <BusinessCard key={business.business_id} business={business} width={cardWidth} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {topProducts.length > 0 ? (
        <View style={styles.section}>
          <ThemedText type="heading">Los más elegidos</ThemedText>
          <View>
            {topProducts.slice(0, 5).map((product) => (
              <ProductRow
                key={product.product_id}
                name={product.product_name}
                price={product.price}
                saleUnit={product.sale_unit}
                photoPath={product.photo_path}
                subtitle={`${product.business_name}${product.is_open ? '' : ' · Cerrado'}`}
                onPress={() => router.push({ pathname: '/producto/[id]', params: { id: product.product_id } })}
              />
            ))}
          </View>
        </View>
      ) : null}

      {otherBusinesses.length > 0 ? (
        <View style={styles.section}>
          <ThemedText type="heading">{openBusinesses.length > 0 ? 'Más negocios' : 'Negocios del barrio'}</ThemedText>
          {otherBusinesses.map((business) => (
            <BusinessCard key={business.business_id} business={business} />
          ))}
        </View>
      ) : null}

      {businesses !== null && businesses.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Icon sf="storefront" md="storefront" size={36} color={theme.primary} />
          <ThemedText type="defaultBold" style={styles.center}>
            Todavía no hay puestos publicados
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            ¿Vendés comida? Sumá tu puesto gratis desde Perfil, en &quot;Quiero vender&quot;.
          </ThemedText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  logo: {
    width: 48,
    height: 48,
  },
  location: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.pill,
    paddingLeft: Spacing.four,
    padding: Spacing.one,
    gap: Spacing.two,
  },
  searchButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    gap: Spacing.three,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categories: {
    gap: Spacing.three,
  },
  category: {
    width: 100,
    alignItems: 'center',
    gap: Spacing.two,
  },
  categoryTile: {
    width: 76,
    height: 76,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: {
    fontSize: 13,
  },
  categoryEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  cards: {
    gap: Spacing.three,
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
