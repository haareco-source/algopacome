import { router } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { isGoogleSignInAvailable, signInWithGoogle } from '@/lib/google';
import { isValidEmail, LOGIN_METHOD } from '@/lib/login-method';
import { normalizeArgentinePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const isEmail = LOGIN_METHOD === 'email';
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  async function continueWithGoogle() {
    setGoogleError(null);
    setIsGoogleLoading(true);
    try {
      // Si sale bien, el cambio de sesión lleva solo a la bienvenida o a la app.
      await signInWithGoogle();
    } catch (googleSignInError) {
      console.warn('Error al ingresar con Google', googleSignInError);
      // El detalle (código de Google o mensaje de Supabase) ayuda a diagnosticar en el piloto.
      const detail =
        googleSignInError && typeof googleSignInError === 'object'
          ? String((googleSignInError as { code?: unknown }).code ?? (googleSignInError as { message?: unknown }).message ?? '')
          : '';
      setGoogleError(`No pudimos ingresar con Google. Probá de nuevo o usá tu email.${detail ? ` (${detail})` : ''}`);
    } finally {
      setIsGoogleLoading(false);
    }
  }

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
      <ThemedText themeColor="textSecondary">La comida rápida de tu barrio.</ThemedText>

      {isGoogleSignInAvailable ? (
        <>
          <Button title="Continuar con Google" onPress={continueWithGoogle} loading={isGoogleLoading} />
          {googleError ? (
            <ThemedText type="small" themeColor="textSecondary">
              {googleError}
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {isEmail ? 'O ingresá con tu email y te mandamos un código.' : 'O ingresá con tu celular y te mandamos un código por SMS.'}
          </ThemedText>
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {isEmail ? 'Ingresá con tu email y te mandamos un código.' : 'Ingresá con tu celular y te mandamos un código por SMS.'}
        </ThemedText>
      )}

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
      <Button
        title="Enviarme el código"
        variant={isGoogleSignInAvailable ? 'secondary' : 'primary'}
        onPress={sendCode}
        loading={isSending}
      />
    </Screen>
  );
}
