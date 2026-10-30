import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatPrice } from '@/lib/business';
import { publicUrl } from '@/lib/media';

type ProductRowProps = {
  name: string;
  description?: string;
  price: number;
  photoPath: string | null;
  subtitle?: string;
  right?: ReactNode;
  onPress: () => void;
};

// Fila de producto: texto a la izquierda y foto a la derecha, como en las apps de delivery.
export function ProductRow({ name, description, price, photoPath, subtitle, right, onPress }: ProductRowProps) {
  const theme = useTheme();
  const photo = publicUrl('product-photos', photoPath);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.texts}>
        <ThemedText type="defaultBold" numberOfLines={2}>
          {name}
        </ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {description}
          </ThemedText>
        ) : null}
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
        <ThemedText type="defaultBold" style={{ color: theme.primary }}>
          {formatPrice(price)}
        </ThemedText>
      </View>
      <View style={[styles.photo, { backgroundColor: theme.primarySoft }]}>
        {photo ? (
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <ThemedText style={styles.photoEmoji}>🍽️</ThemedText>
        )}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
  },
  texts: {
    flex: 1,
    gap: Spacing.half,
  },
  photo: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmoji: {
    fontSize: 32,
    lineHeight: 40,
  },
});
