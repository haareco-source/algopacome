import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/providers/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

// Sin sesión: ingreso con teléfono. Con sesión y sin aceptar las reglas: bienvenida.
// Con todo completo: la app.
function RootNavigator() {
  const { session, profile, isLoading } = useAuth();

  if (isLoading) return null;

  const isSignedIn = !!session;
  const isProfileComplete = !!profile?.accepted_rules_at && !!profile.display_name.trim();

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={isSignedIn && !isProfileComplete}>
          <Stack.Screen name="bienvenida" />
        </Stack.Protected>
        <Stack.Protected guard={isSignedIn && isProfileComplete}>
          <Stack.Screen name="(tabs)" />
        </Stack.Protected>
      </Stack>
      <AnimatedSplashOverlay />
    </>
  );
}
