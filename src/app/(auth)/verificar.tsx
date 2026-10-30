import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  const theme = useTheme();
  const { phone, email } = useLocalSearchParams<{ phone?: string; email?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  async function verify() {
    // Supabase manda 6 dígitos por defecto; el largo se puede cambiar en el panel.
    if (!/^\d{6,10}$/.test(code)) {
      setError('Ingresá el código que te llegó.');
      return;
    }
    setError(null);
    setIsVerifying(true);
    const { error: verifyError } = email
      ? await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
      : await supabase.auth.verifyOtp({ phone: phone ?? '', token: code, type: 'sms' });
    setIsVerifying(false);
    // Si sale bien, el cambio de sesión lleva solo a la bienvenida o a la app.
    if (verifyError) setError('El código no es correcto o ya venció.');
  }

  async function resend() {
    setIsResending(true);
    await supabase.auth.signInWithOtp(email ? { email } : { phone: phone ?? '' });
    setIsResending(false);
  }

  return (
    <Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={email ? 'Cambiar email' : 'Cambiar número'}
        onPress={() => router.back()}
        style={[styles.back, { backgroundColor: theme.backgroundElement }]}>
        <Icon sf="chevron.left" md="arrow_back" size={22} color={theme.text} />
      </Pressable>

      <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
        <Icon sf={email ? 'envelope.fill' : 'message.fill'} md={email ? 'mail' : 'sms'} size={32} color={theme.primary} />
      </View>
      <View style={styles.texts}>
        <ThemedText type="subtitle">{email ? 'Revisá tu email' : 'Revisá tus SMS'}</ThemedText>
        <ThemedText themeColor="textSecondary">
          Te mandamos un código a <ThemedText type="defaultBold">{email ?? phone}</ThemedText>.
          {email ? ' Si no lo ves, mirá en spam o promociones.' : ''}
        </ThemedText>
      </View>
      <TextField
        label="Código"
        placeholder="000000"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={verify}
        error={error}
        style={styles.code}
      />
      <Button title="Ingresar" onPress={verify} loading={isVerifying} />
      <Button title="Reenviar código" variant="ghost" onPress={resend} loading={isResending} />
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
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: {
    gap: Spacing.two,
  },
  code: {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: 8,
    textAlign: 'center',
  },
});
