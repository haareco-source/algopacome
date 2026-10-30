import Constants, { ExecutionEnvironment } from 'expo-constants';

import { supabase } from '@/lib/supabase';

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Google usa un módulo nativo: no existe dentro de Expo Go, solo en las
// versiones instalables que arma EAS. Sin el ID de cliente tampoco se muestra.
export const isGoogleSignInAvailable =
  !!webClientId && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

async function loadGoogleSignIn() {
  const module = await import('@react-native-google-signin/google-signin');
  module.GoogleSignin.configure({ webClientId });
  return module;
}

export async function signInWithGoogle(): Promise<'signed-in' | 'cancelled'> {
  const { GoogleSignin, isSuccessResponse } = await loadGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return 'cancelled';

  const idToken = response.data.idToken;
  if (!idToken) throw new Error('Google no devolvió el token de identidad');

  const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  return 'signed-in';
}

// Cierra también la sesión de Google para poder elegir otra cuenta la próxima vez.
export async function signOutOfGoogle() {
  if (!isGoogleSignInAvailable) return;
  const { GoogleSignin } = await loadGoogleSignIn();
  await GoogleSignin.signOut();
}
