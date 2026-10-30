import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { COMMUNITY_RULES, RULES_FOOTER } from '@/constants/rules';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function RulesScreen() {
  const theme = useTheme();

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver"
        onPress={() => router.back()}
        style={[styles.back, { backgroundColor: theme.backgroundElement }]}>
        <Icon sf="chevron.left" md="arrow_back" size={22} color={theme.text} />
      </Pressable>
      <ThemedText type="subtitle">Reglas de convivencia</ThemedText>
      {COMMUNITY_RULES.map((rule) => (
        <View key={rule} style={styles.ruleRow}>
          <Icon sf="checkmark.circle.fill" md="check_circle" size={22} color={theme.accent} />
          <ThemedText style={styles.flex}>{rule}</ThemedText>
        </View>
      ))}
      <ThemedText type="small" themeColor="textSecondary">
        {RULES_FOOTER}
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
});
