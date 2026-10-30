import type { BusinessType, DeliveryFeeMode } from '@/lib/types';

// Filas que devuelven las funciones públicas de la base (list_businesses, get_business_profile, search_products).

export type BusinessCard = {
  business_id: string;
  name: string;
  type: BusinessType;
  logo_path: string | null;
  cover_path: string | null;
  rating_avg: number;
  rating_count: number;
  is_open: boolean;
  offers_delivery: boolean;
  delivery_fee_mode: DeliveryFeeMode | null;
  delivery_fee: number | null;
  eta_min_minutes: number | null;
  eta_max_minutes: number | null;
};

export type BusinessProfile = BusinessCard & {
  description: string;
  ingredients: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  whatsapp: string | null;
  status: 'draft' | 'active' | 'hidden' | 'suspended';
  accepts_cash: boolean;
  offers_pickup: boolean;
  free_over: number | null;
  radius_km: number | null;
};

export type SearchResult = {
  product_id: string;
  product_name: string;
  description: string;
  price: number;
  photo_path: string | null;
  likes: number;
  business_id: string;
  business_name: string;
  business_type: BusinessType;
  rating_avg: number;
  rating_count: number;
  is_open: boolean;
  offers_delivery: boolean;
  delivery_fee_mode: DeliveryFeeMode | null;
  delivery_fee: number | null;
  eta_min_minutes: number | null;
  eta_max_minutes: number | null;
};

export function formatEta(min: number | null, max: number | null) {
  return min && max ? `${min}-${max} min` : null;
}

export function formatDeliveryFee(mode: DeliveryFeeMode | null, fee: number | null) {
  if (mode === 'included' || (mode === 'fixed' && !fee)) return 'Envío gratis';
  if (mode === 'free_over') return 'Envío gratis desde un monto';
  return fee ? `Envío $ ${Math.round(fee).toLocaleString('es-AR')}` : null;
}

export function formatRating(avg: number, count: number) {
  return count > 0 ? `★ ${Number(avg).toFixed(1)} (${count})` : 'Nuevo';
}

// Costo del envío para un subtotal dado.
export function deliveryFeeFor(mode: DeliveryFeeMode | null, fee: number | null, freeOver: number | null, subtotal: number) {
  if (mode === 'included' || !fee) return 0;
  if (mode === 'free_over' && freeOver !== null && subtotal >= freeOver) return 0;
  return Number(fee);
}

// Link de WhatsApp a partir del número guardado (+549...).
export function whatsappLink(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
