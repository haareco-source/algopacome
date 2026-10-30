import { FunctionsHttpError } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type PaymentOptions = { simulated: boolean; mercadopago: boolean; cash: boolean };

export type Billing = {
  plan: 'free' | 'plus';
  product_limit: number;
  plus_product_limit: number;
  plus_price_ars: number;
  subscription_status: 'pending' | 'authorized' | 'paused' | 'cancelled' | null;
  next_charge_at: string | null;
  accepts_mercadopago: boolean;
  payments_simulated: boolean;
  free_orders_left: number;
  commission_pct: number;
  next_commission_pct: number;
  month_orders: number;
  month_sales: number;
  month_commission: number;
  accepts_cash: boolean;
  cash_debt: number;
  cash_debt_limit: number;
};

const FUNCTION_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/mercadopago`;

// Llama a la función del servidor que habla con Mercado Pago y devuelve el link para abrir.
export async function mercadoPagoLink(route: 'pagar' | 'plus' | 'deuda', body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke<{ url: string }>(`mercadopago/${route}`, { body });
  if (error) {
    const message =
      error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => null))?.error as string) : null;
    return { url: null, error: message ?? 'No pudimos conectar con Mercado Pago. Probá de nuevo.' };
  }
  return { url: data?.url ?? null, error: data?.url ? null : 'Mercado Pago no devolvió el link. Probá de nuevo.' };
}

export async function cancelPlus() {
  const { error } = await supabase.functions.invoke('mercadopago/cancelar-plus', { body: {} });
  if (!error) return null;
  const message =
    error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => null))?.error as string) : null;
  return message ?? 'No pudimos cancelar el plan. Probá de nuevo.';
}

// Abre Mercado Pago dentro de la app; se cierra solo cuando Mercado Pago nos devuelve a algopacome://
// Devuelve el link de vuelta (por ejemplo algopacome://vender/cobros?mp=ok), si lo hubo.
export async function openMercadoPago(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(url, 'algopacome://');
  return result.type === 'success' ? result.url : null;
}

export function mercadoPagoLinkUrl(state: string) {
  return `${FUNCTION_URL}/vincular?state=${state}`;
}
