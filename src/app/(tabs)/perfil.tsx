import { Screen } from '@/components/screen';
import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/providers/auth';

export default function ProfileScreen() {
  const { session, profile, signOut } = useAuth();

  return (
    <Screen>
      <ThemedText type="subtitle">{profile?.display_name}</ThemedText>
      <ThemedText themeColor="textSecondary">{profile?.phone ?? session?.user.email}</ThemedText>
      {/* "Quiero vender" (alta del negocio) llega en la semana 2. */}
      <Button title="Cerrar sesión" variant="secondary" onPress={signOut} />
    </Screen>
  );
}
