import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { OpenBadge } from '@/components/open-badge';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BUSINESS_TYPES } from '@/lib/business';
import { formatDeliveryFee, formatEta, formatRating, type BusinessCard as BusinessCardData } from '@/lib/catalog';
import { publicUrl } from '@/lib/media';

// Tarjeta de negocio con portada, logo, estado y datos de entrega.
export function BusinessCard({ business, width }: { business: BusinessCardData; width?: number }) {
  const theme = useTheme();
  const cover = publicUrl('business-media', business.cover_path);
  const logo = publicUrl('business-media', business.logo_path);
  const emoji = BUSINESS_TYPES.find((option) => option.value === business.type)?.emoji;
  const details = [
    formatRating(business.rating_avg, business.rating_count),
    formatEta(business.eta_min_minutes, business.eta_max_minutes),
    business.offers_delivery ? formatDeliveryFee(business.delivery_fee_mode, business.delivery_fee) : 'Solo retiro',
  ].filter(Boolean);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/negocio/[id]', params: { id: business.business_id } })}
      style={({ pressed }) => [styles.card, { width, borderColor: theme.border }, pressed && styles.pressed]}>
      <View style={[styles.cover, { backgroundColor: theme.primarySoft }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <ThemedText style={styles.coverEmoji}>{emoji}</ThemedText>
        )}
        <View style={styles.badge}>
          <OpenBadge isOpen={business.is_open} />
        </View>
      </View>
      <View style={styles.body}>
        <View style={[styles.logo, { backgroundColor: theme.background, borderColor: theme.border }]}>
          {logo ? (
            <Image source={{ uri: logo }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <ThemedText>{emoji}</ThemedText>
          )}
        </View>
        <View style={styles.flex}>
          <ThemedText type="defaultBold" numberOfLines={1}>
            {business.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {details.join(' · ')}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.85,
  },
  cover: {
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEmoji: {
    fontSize: 48,
    lineHeight: 58,
  },
  badge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
  },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  flex: {
    flex: 1,
  },
});
