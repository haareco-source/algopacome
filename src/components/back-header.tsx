import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BackHeaderProps = {
  title: string;
  onBack?: () => void;
};

// Botón de volver redondo y título grande, para las pantallas sin portada.
export function BackHeader({ title, onBack }: BackHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={onBack ?? (() => router.back())}
        style={[styles.back, { backgroundColor: theme.backgroundElement }]}>
        <Icon sf="chevron.left" md="arrow_back" size={22} color={theme.text} />
      </Pressable>
      <ThemedText type="subtitle">{title}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
