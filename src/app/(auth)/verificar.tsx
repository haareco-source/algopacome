import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);

  async function verify() {
    if (code.length !== 6) {
      setError('El código tiene 6 números.');
      return;
    }
    setError(null);
    setIsVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
    setIsVerifying(false);
    // Si sale bien, el cambio de sesión lleva solo a la bienvenida o a la app.
    if (verifyError) setError('El código no es correcto o ya venció.');
  }

  async function resend() {
    setIsResending(true);
    await supabase.auth.signInWithOtp({ phone });
    setIsResending(false);
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Revisá tus SMS</ThemedText>
      <ThemedText themeColor="textSecondary">Te mandamos un código de 6 números al {phone}.</ThemedText>
      <TextField
        label="Código"
        placeholder="123456"
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={setCode}
        onSubmitEditing={verify}
        error={error}
      />
      <Button title="Ingresar" onPress={verify} loading={isVerifying} />
      <Button title="Reenviar código" variant="secondary" onPress={resend} loading={isResending} />
      <Button title="Cambiar número" variant="secondary" onPress={() => router.back()} />
    </Screen>
  );
}
