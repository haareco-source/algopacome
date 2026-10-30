import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Screen } from '@/components/screen';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isGoogleSignInAvailable, signInWithGoogle } from '@/lib/google';
import { isValidEmail, LOGIN_METHOD } from '@/lib/login-method';
import { normalizeArgentinePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';

export default function SignInScreen() {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const isEmail = LOGIN_METHOD === 'email';
  // Sin Google (Expo Go o web) el formulario se muestra de entrada.
  const [showCodeForm, setShowCodeForm] = useState(!isGoogleSignInAvailable);
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
    <Screen
      headerMinHeight={height * 0.42}
      header={
        <View style={styles.brand}>
          <Image source={require('@/assets/images/logo.png')} style={styles.logo} />
          <ThemedText type="title" style={{ color: theme.onPrimary }}>
            Algopacome
          </ThemedText>
          <ThemedText style={{ color: theme.onPrimary }}>La comida rápida de tu barrio.</ThemedText>
        </View>
      }>
      <ThemedText type="defaultBold" style={styles.center}>
        Elegí cómo querés ingresar
      </ThemedText>

      {isGoogleSignInAvailable ? (
        <>
          <Button
            title="Continuar con Google"
            variant="outline"
            icon={<Image source={require('@/assets/images/google.png')} style={styles.buttonIcon} />}
            onPress={continueWithGoogle}
            loading={isGoogleLoading}
          />
          {googleError ? (
            <ThemedText type="small" style={[styles.center, { color: theme.danger }]}>
              {googleError}
            </ThemedText>
          ) : null}
        </>
      ) : null}

      {showCodeForm ? (
        <>
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            {isEmail ? 'Te mandamos un código a tu email.' : 'Te mandamos un código por SMS.'}
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
        </>
      ) : (
        <Button
          title={isEmail ? 'Continuar con email' : 'Continuar con celular'}
          variant="outline"
          icon={<Icon sf={isEmail ? 'envelope' : 'phone'} md={isEmail ? 'mail' : 'call'} size={22} color={theme.text} />}
          onPress={() => setShowCodeForm(true)}
        />
      )}

      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Al ingresar aceptás las reglas de convivencia de Algopacome.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  logo: {
    width: 96,
    height: 96,
  },
  buttonIcon: {
    width: 22,
    height: 22,
  },
  center: {
    textAlign: 'center',
  },
});
