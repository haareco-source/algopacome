// Tipos de las tablas que usa la app. Cuando el proyecto de Supabase esté creado,
// se pueden generar completos con `npx supabase gen types typescript`.

export type UserRole = 'customer' | 'moderator' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'banned';

export type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: AccountStatus;
  accepted_rules_at: string | null;
};

export type BusinessType = 'local' | 'puesto' | 'carrito';
export type BusinessStatus = 'draft' | 'active' | 'hidden' | 'suspended';
export type DeliveryFeeMode = 'fixed' | 'included' | 'free_over';

export type Business = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  type: BusinessType;
  description: string;
  ingredients: string;
  address: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  whatsapp: string | null;
  logo_path: string | null;
  cover_path: string | null;
  plan: 'free' | 'plus';
  status: BusinessStatus;
  is_open_now: boolean;
  accepts_cash: boolean;
};

export type BusinessHour = {
  weekday: number; // 0 = domingo
  opens_at: string; // "HH:MM" o "HH:MM:SS"
  closes_at: string;
};

export type DeliverySettings = {
  offers_delivery: boolean;
  offers_pickup: boolean;
  fee_mode: DeliveryFeeMode;
  fee: number;
  free_over: number | null;
  radius_km: number;
  eta_min_minutes: number;
  eta_max_minutes: number;
};

export type Category = {
  id: number;
  name: string;
  sort_order: number;
};

export type Product = {
  id: string;
  business_id: string;
  category_id: number | null;
  name: string;
  description: string;
  price: number;
  photo_path: string | null;
  is_available: boolean;
  status: 'active' | 'hidden';
};
