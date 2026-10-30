import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/providers/auth';

// La búsqueda y el ranking llegan en la semana 3.
export default function HomeScreen() {
  const { profile } = useAuth();

  return (
    <Screen>
      <ThemedText type="subtitle">Hola, {profile?.display_name}</ThemedText>
      <ThemedText themeColor="textSecondary">¿Qué tenés ganas de comer hoy?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Pronto vas a poder buscar sanguches, lomitos, pizzas y más de los puestos de tu barrio.
      </ThemedText>
    </Screen>
  );
}
