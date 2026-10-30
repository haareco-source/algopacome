// Cómo ingresa el usuario: código por email (para pruebas, sin costo) o por SMS
// (requiere un proveedor de SMS configurado en Supabase). Se elige con
// EXPO_PUBLIC_LOGIN_METHOD en .env.local; por defecto, email.
export type LoginMethod = 'email' | 'sms';

export const LOGIN_METHOD: LoginMethod = process.env.EXPO_PUBLIC_LOGIN_METHOD === 'sms' ? 'sms' : 'email';

export function isValidEmail(input: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}
