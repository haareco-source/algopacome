import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

let currentToken: string | null = null;

// Con la app abierta, el aviso también se muestra y suena.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Pide permiso, registra el token de este teléfono para la cuenta y devuelve si quedó activo.
export async function registerForPush(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('pedidos', {
        name: 'Pedidos',
        importance: AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 300, 200, 300],
        lightColor: '#FF6B00',
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return false;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    currentToken = token;
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS });
    return true;
  } catch (error) {
    // Sin la configuración de Firebase en Android no hay token: la app sigue andando sin avisos.
    console.warn('No se pudo activar las notificaciones', error);
    return false;
  }
}

// Al cerrar sesión, este teléfono deja de recibir los avisos de la cuenta.
export async function unregisterPush() {
  if (!currentToken) return;
  await supabase.rpc('unregister_push_token', { p_token: currentToken });
  currentToken = null;
}

// Tocar un aviso abre el pedido.
export function listenToNotificationTaps() {
  if (Platform.OS === 'web') return () => undefined;
  const open = (response: Notifications.NotificationResponse | null) => {
    const orderId = response?.notification.request.content.data?.orderId;
    if (typeof orderId === 'string') router.push({ pathname: '/pedido/[id]', params: { id: orderId } });
  };
  Notifications.getLastNotificationResponseAsync().then(open);
  const subscription = Notifications.addNotificationResponseReceivedListener(open);
  return () => subscription.remove();
}
