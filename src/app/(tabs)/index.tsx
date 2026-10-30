import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { CATEGORIES } from '@/constants/categories';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth';

// Portada. La búsqueda, las categorías y los puestos cercanos se conectan en la semana 3.
export default function HomeScreen() {
  const theme = useTheme();
  const { profile } = useAuth();

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

          <View style={[styles.search, { backgroundColor: theme.background }]}>
            <ThemedText themeColor="textSecondary" style={styles.flex} numberOfLines={1}>
              ¿Qué tenés ganas de comer?
            </ThemedText>
            <View style={[styles.searchButton, { backgroundColor: theme.primary }]}>
              <Icon sf="magnifyingglass" md="search" size={20} color={theme.onPrimary} />
            </View>
          </View>
        </>
      }>
      <View style={[styles.banner, { backgroundColor: theme.accent }]}>
        <View style={[styles.flex, styles.bannerText]}>
          <ThemedText type="heading" style={{ color: theme.onAccent }}>
            Lo mejor del barrio, a un toque
          </ThemedText>
          <ThemedText type="small" style={{ color: theme.onAccent }}>
            Puestos, carritos y locales de Libertador.
          </ThemedText>
          <View style={[styles.chip, { backgroundColor: theme.background }]}>
            <ThemedText type="smallBold">Muy pronto</ThemedText>
          </View>
        </View>
        <ThemedText style={styles.bannerEmoji}>🍔</ThemedText>
      </View>

      <View style={styles.section}>
        <ThemedText type="heading">Explorá por categoría</ThemedText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
          {CATEGORIES.map((category) => (
            <View key={category.name} style={styles.category}>
              <View style={[styles.categoryTile, { backgroundColor: theme.primarySoft }]}>
                <ThemedText style={styles.categoryEmoji}>{category.emoji}</ThemedText>
              </View>
              <ThemedText type="small" numberOfLines={1} style={styles.categoryName}>
                {category.name}
              </ThemedText>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <ThemedText type="heading">Cerca tuyo</ThemedText>
        <View style={[styles.empty, { borderColor: theme.border }]}>
          <Icon sf="storefront" md="storefront" size={36} color={theme.primary} />
          <ThemedText type="defaultBold" style={styles.center}>
            Todavía no hay puestos cargados
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Muy pronto vas a ver acá los sánguches, lomitos y pizzas de tu barrio.
          </ThemedText>
        </View>
      </View>
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  bannerText: {
    gap: Spacing.one,
  },
  bannerEmoji: {
    fontSize: 64,
    lineHeight: 76,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    marginTop: Spacing.two,
  },
  section: {
    gap: Spacing.three,
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
