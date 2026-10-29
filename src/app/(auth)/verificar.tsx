import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
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
      <ThemedText type="subtitle">{email ? 'Revisá tu email' : 'Revisá tus SMS'}</ThemedText>
      <ThemedText themeColor="textSecondary">
        Te mandamos un código a {email ?? phone}.{email ? ' Si no lo ves, mirá en spam.' : ''}
      </ThemedText>
      <TextField
        label="Código"
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={10}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={verify}
        error={error}
      />
      <Button title="Ingresar" onPress={verify} loading={isVerifying} />
      <Button title="Reenviar código" variant="secondary" onPress={resend} loading={isResending} />
      <Button title={email ? 'Cambiar email' : 'Cambiar número'} variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
