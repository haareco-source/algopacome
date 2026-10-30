import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { COMMUNITY_RULES, RULES_FOOTER } from '@/constants/rules';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth';

// Completar el perfil y aceptar las reglas de convivencia antes de usar la app.
export default function WelcomeScreen() {
  const theme = useTheme();
  const { session, profile, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    if (name.trim().length < 2) {
      setError('Contanos cómo te llamás.');
      return;
    }
    if (!accepted || !session) return;
    setError(null);
    setIsSaving(true);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), accepted_rules_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (updateError) {
      setIsSaving(false);
      setError('No pudimos guardar tus datos. Probá de nuevo.');
      return;
    }
    await refreshProfile();
    setIsSaving(false);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">¡Bienvenido!</ThemedText>
      <TextField
        label="Tu nombre"
        placeholder="Como querés que te vean los vendedores"
        autoComplete="name"
        value={name}
        onChangeText={setName}
        error={error}
      />

      <View style={[styles.rules, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">Reglas de convivencia</ThemedText>
        {COMMUNITY_RULES.map((rule, index) => (
          <ThemedText key={rule} type="small">
            {index + 1}. {rule}
          </ThemedText>
        ))}
        <ThemedText type="small" themeColor="textSecondary">
          {RULES_FOOTER}
        </ThemedText>
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        onPress={() => setAccepted((value) => !value)}
        style={styles.checkRow}>
        <View
          style={[
            styles.checkbox,
            { borderColor: theme.primary, backgroundColor: accepted ? theme.primary : 'transparent' },
          ]}>
          {accepted ? <ThemedText style={{ color: theme.onPrimary }}>✓</ThemedText> : null}
        </View>
        <ThemedText type="small" style={styles.flex}>
          Leí y acepto las reglas de convivencia.
        </ThemedText>
      </Pressable>

      <Button title="Empezar" onPress={save} disabled={!accepted} loading={isSaving} />
      <Button title="Salir" variant="secondary" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rules: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
