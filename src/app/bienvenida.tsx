import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { COMMUNITY_RULES, RULES_FOOTER } from '@/constants/rules';
import { Radius, Spacing } from '@/constants/theme';
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
    <Screen
      header={
        <>
          <ThemedText type="subtitle" style={{ color: theme.onPrimary }}>
            ¡Bienvenido a Algopacome! 👋
          </ThemedText>
          <ThemedText style={{ color: theme.onPrimary }}>
            Ya casi estás. Contanos tu nombre y aceptá las reglas del barrio.
          </ThemedText>
        </>
      }>
      <TextField
        label="Tu nombre"
        placeholder="Ej.: Juan Pérez"
        autoComplete="name"
        value={name}
        onChangeText={setName}
        error={error}
      />

      <View style={[styles.rules, { borderColor: theme.border }]}>
        <ThemedText type="heading">Reglas de convivencia</ThemedText>
        {COMMUNITY_RULES.map((rule) => (
          <View key={rule} style={styles.ruleRow}>
            <Icon sf="checkmark.circle.fill" md="check_circle" size={20} color={theme.accent} />
            <ThemedText type="small" style={styles.flex}>
              {rule}
            </ThemedText>
          </View>
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
            { borderColor: accepted ? theme.accent : theme.text, backgroundColor: accepted ? theme.accent : 'transparent' },
          ]}>
          {accepted ? <Icon sf="checkmark" md="check" size={18} color={theme.onAccent} /> : null}
        </View>
        <ThemedText type="small" style={styles.flex}>
          Leí y acepto las reglas de convivencia.
        </ThemedText>
      </Pressable>

      <Button title="Empezar" onPress={save} disabled={!accepted} loading={isSaving} />
      <Button title="Salir" variant="ghost" onPress={signOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  rules: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.card,
    borderWidth: 1.5,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
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
