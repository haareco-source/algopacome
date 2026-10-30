import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// El historial y el seguimiento en vivo llegan en la semana 4.
export default function OrdersScreen() {
  const theme = useTheme();

  return (
    <Screen>
      <ThemedText type="subtitle">Mis pedidos</ThemedText>
      <View style={styles.empty}>
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <Icon sf="bag.fill" md="receipt_long" size={44} color={theme.primary} />
        </View>
        <ThemedText type="heading" style={styles.center}>
          Todavía no hiciste ningún pedido
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          Cuando pidas algo, acá vas a poder seguirlo en vivo.
        </ThemedText>
        <Button title="Explorar comidas" onPress={() => router.navigate('/')} style={styles.button} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    alignSelf: 'stretch',
    marginTop: Spacing.three,
  },
  center: {
    textAlign: 'center',
  },
});
