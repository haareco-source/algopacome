import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { pickImage } from '@/lib/media';

type PhotoPickerProps = {
  label: string;
  hint?: string;
  uri: string | null;
  shape: 'square' | 'wide';
  onPick: (uri: string) => void;
};

// Recuadro para elegir una foto de la galería; muestra la elegida o la actual.
export function PhotoPicker({ label, hint, uri, shape, onPick }: PhotoPickerProps) {
  const theme = useTheme();
  const isWide = shape === 'wide';

  async function choose() {
    const picked = await pickImage(isWide ? [16, 9] : [1, 1]);
    if (picked) onPick(picked);
  }

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Elegir ${label.toLowerCase()}`}
        onPress={choose}
        style={[
          isWide ? styles.wide : styles.square,
          { backgroundColor: theme.primarySoft, borderColor: theme.primary },
        ]}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Icon sf="camera.fill" md="add_a_photo" size={28} color={theme.primary} />
            <ThemedText type="smallBold" style={{ color: theme.primary }}>
              Elegir foto
            </ThemedText>
          </View>
        )}
      </Pressable>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  square: {
    width: 120,
    height: 120,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  wide: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
});
