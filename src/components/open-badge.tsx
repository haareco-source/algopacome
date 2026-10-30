import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function OpenBadge({ isOpen }: { isOpen: boolean }) {
  const theme = useTheme();

  return (
    <View style={[styles.badge, { backgroundColor: isOpen ? theme.accent : theme.text }]}>
      <ThemedText type="smallBold" style={{ color: isOpen ? theme.onAccent : theme.background }}>
        {isOpen ? 'Abierto' : 'Cerrado'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.half,
  },
});
