import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { isValidEmail, LOGIN_METHOD } from '@/lib/login-method';
import { normalizeArgentinePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const isEmail = LOGIN_METHOD === 'email';
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function sendCode() {
    if (isEmail) {
      const email = input.trim().toLowerCase();
      if (!isValidEmail(email)) {
        setError('Revisá el email.');
        return;
      }
      await requestCode({ email }, { email });
      return;
    }

    const phone = normalizeArgentinePhone(input);
    if (!phone) {
      setError('Revisá el número: código de área y celular, sin el 0 ni el 15.');
      return;
    }
    await requestCode({ phone }, { phone });
  }

  async function requestCode(credentials: { email: string } | { phone: string }, params: Record<string, string>) {
    setError(null);
    setIsSending(true);
    const { error: otpError } = await supabase.auth.signInWithOtp(credentials);
    setIsSending(false);
    if (otpError) {
      setError('No pudimos enviar el código. Probá de nuevo en un minuto.');
      return;
    }
    router.push({ pathname: '/verificar', params });
  }

  return (
    <Screen>
      <ThemedText type="subtitle">Algopacome</ThemedText>
      <ThemedText themeColor="textSecondary">
        {isEmail
          ? 'La comida rápida de tu barrio. Ingresá con tu email y te mandamos un código.'
          : 'La comida rápida de tu barrio. Ingresá con tu celular y te mandamos un código por SMS.'}
      </ThemedText>
      {isEmail ? (
        <TextField
          label="Tu email"
          placeholder="nombre@gmail.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendCode}
          error={error}
        />
      ) : (
        <TextField
          label="Tu celular"
          placeholder="388 412 3456"
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={sendCode}
          error={error}
        />
      )}
      <Button title="Enviarme el código" onPress={sendCode} loading={isSending} />
    </Screen>
  );
}
