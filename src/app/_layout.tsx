import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { listenToNotificationTaps, registerForPush } from '@/lib/notifications';
import { AuthProvider, useAuth } from '@/providers/auth';
import { CartProvider } from '@/providers/cart';
import { MyBusinessProvider } from '@/providers/my-business';
import { SellerOrdersProvider } from '@/providers/seller-orders';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <MyBusinessProvider>
          <SellerOrdersProvider>
            <CartProvider>
              <RootNavigator />
            </CartProvider>
          </SellerOrdersProvider>
        </MyBusinessProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// Sin sesión: ingreso con Google o código. Con sesión y sin aceptar las reglas: bienvenida.
// Con todo completo: la app.
function RootNavigator() {
  const { session, profile, isLoading } = useAuth();

  const isSignedIn = !!session;
  const isProfileComplete = !!profile?.accepted_rules_at && !!profile.display_name.trim();
  const userId = session?.user.id;
  const isReady = isSignedIn && isProfileComplete;

  // Avisos de pedidos: se registra el teléfono al entrar y tocar un aviso abre el pedido.
  useEffect(() => {
    if (!isReady || !userId) return;
    registerForPush();
    return listenToNotificationTaps();
  }, [isReady, userId]);

  if (isLoading) return null;

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
          <Stack.Screen name="reglas" />
          <Stack.Screen name="vender" />
          <Stack.Screen name="buscar" />
          <Stack.Screen name="negocio/[id]" />
          <Stack.Screen name="producto/[id]" />
          <Stack.Screen name="carrito" />
          <Stack.Screen name="pedido/[id]" />
        </Stack.Protected>
      </Stack>
      <AnimatedSplashOverlay />
    </>
  );
}
