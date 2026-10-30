import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SwitchRowProps = {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

export function SwitchRow({ label, description, value, onValueChange, disabled }: SwitchRowProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <ThemedText type="defaultBold">{label}</ThemedText>
        {description ? (
          <ThemedText type="small" themeColor="textSecondary">
            {description}
          </ThemedText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: theme.backgroundSelected, true: theme.accent }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  texts: {
    flex: 1,
    gap: Spacing.half,
  },
});
