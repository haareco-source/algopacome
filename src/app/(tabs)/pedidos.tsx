import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';

// El historial y el seguimiento en vivo llegan en la semana 4.
export default function OrdersScreen() {
  return (
    <Screen>
      <ThemedText type="subtitle">Mis pedidos</ThemedText>
      <ThemedText themeColor="textSecondary">Todavía no hiciste ningún pedido.</ThemedText>
    </Screen>
  );
}
