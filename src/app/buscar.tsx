import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ProductRow } from '@/components/product-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useCategories } from '@/hooks/use-categories';
import { useTheme } from '@/hooks/use-theme';
import { formatEta, type SearchResult } from '@/lib/catalog';
import { supabase } from '@/lib/supabase';

// Búsqueda de productos: tolera errores y sinónimos ("sanguche de milanga"); ordena por puntaje.
export default function SearchScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ categoria?: string }>();
  const categories = useCategories();
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(params.categoria ? Number(params.categoria) : null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [onlyDelivery, setOnlyDelivery] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Espera a que se deje de escribir antes de buscar.
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const { data } = await supabase.rpc('search_products', {
        p_query: query,
        p_only_open: onlyOpen,
        p_only_delivery: onlyDelivery,
        p_category_id: categoryId,
        p_limit: 50,
      });
      if (!active) return;
      setResults(data ?? []);
      setIsSearching(false);
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, categoryId, onlyOpen, onlyDelivery]);

  const hasFilters = !!query.trim() || categoryId !== null || onlyOpen || onlyDelivery;

  return (
    <Screen>
      <View style={styles.searchRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: theme.backgroundElement }]}>
          <Icon sf="chevron.left" md="arrow_back" size={22} color={theme.text} />
        </Pressable>
        <View style={[styles.search, { borderColor: theme.primary }]}>
          <Icon sf="magnifyingglass" md="search" size={20} color={theme.textSecondary} />
          <TextInput
            autoFocus={!params.categoria}
            value={query}
            onChangeText={setQuery}
            placeholder="Sánguche, pizza, lomito…"
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            style={[styles.input, { color: theme.text }]}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" onPress={() => setQuery('')}>
              <Icon sf="xmark.circle.fill" md="cancel" size={20} color={theme.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filters}>
        <FilterChip label="Abiertos ahora" selected={onlyOpen} onPress={() => setOnlyOpen(!onlyOpen)} />
        <FilterChip label="Con delivery" selected={onlyDelivery} onPress={() => setOnlyDelivery(!onlyDelivery)} />
        {categories
          .filter((category) => category.name !== 'Otros')
          .map((category) => (
            <FilterChip
              key={category.id}
              label={category.name}
              selected={categoryId === category.id}
              onPress={() => setCategoryId(categoryId === category.id ? null : category.id)}
            />
          ))}
      </ScrollView>

      {results === null ? (
        <ActivityIndicator color={theme.primary} />
      ) : results.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText style={styles.emptyEmoji}>🔍</ThemedText>
          <ThemedText type="defaultBold" style={styles.center}>
            {hasFilters ? 'No encontramos nada con eso' : 'Todavía no hay productos cargados'}
          </ThemedText>
          {hasFilters ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              Probá con otra palabra o sacá algún filtro.
            </ThemedText>
          ) : null}
        </View>
      ) : (
        <View>
          {isSearching ? <ActivityIndicator color={theme.primary} style={styles.inlineLoader} /> : null}
          {results.map((product) => {
            const eta = formatEta(product.eta_min_minutes, product.eta_max_minutes);
            return (
              <ProductRow
                key={product.product_id}
                name={product.product_name}
                description={product.description}
                price={product.price}
                photoPath={product.photo_path}
                subtitle={[product.business_name, product.is_open ? eta : 'Cerrado'].filter(Boolean).join(' · ')}
                onPress={() => router.push({ pathname: '/producto/[id]', params: { id: product.product_id } })}
              />
            );
          })}
        </View>
      )}
    </Screen>
  );
}

function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.text : theme.background, borderColor: selected ? theme.text : theme.border },
      ]}>
      <ThemedText type="smallBold" style={{ color: selected ? theme.background : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filters: {
    gap: Spacing.two,
    alignItems: 'flex-start',
  },
  chip: {
    borderWidth: 1.5,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  emptyEmoji: {
    fontSize: 40,
    lineHeight: 48,
  },
  inlineLoader: {
    marginBottom: Spacing.two,
  },
  center: {
    textAlign: 'center',
  },
});
