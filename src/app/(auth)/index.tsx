import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { normalizeArgentinePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const [phoneInput, setPhoneInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function sendCode() {
    const phone = normalizeArgentinePhone(phoneInput);
    if (!phone) {
      setError('Revisá el número: código de área y celular, sin el 0 ni el 15.');
      return;
    }
    setError(null);
    setIsSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone });
    setIsSending(false);
    if (otpError) {
      setError('No pudimos enviar el código. Probá de nuevo en un minuto.');
      return;
    }
    router.push({ pathname: '/verificar', params: { phone } });
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Algopacome</ThemedText>
      <ThemedText themeColor="textSecondary">
        La comida rápida de tu barrio. Ingresá con tu celular y te mandamos un código por SMS.
      </ThemedText>
      <TextField
        label="Tu celular"
        placeholder="388 412 3456"
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        value={phoneInput}
        onChangeText={setPhoneInput}
        onSubmitEditing={sendCode}
        error={error}
      />
      <Button title="Enviarme el código" onPress={sendCode} loading={isSending} />
    </Screen>
  );
}
