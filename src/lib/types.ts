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
  accepts_scheduled: boolean;
  scheduled_daily_limit: number | null;
  // Lo que ve el cliente: interruptor prendido y dentro del horario cargado.
  is_open_for_customers?: boolean;
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

export type SaleUnit = 'unidad' | 'media_docena' | 'docena' | 'porcion';

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
  sale_unit: SaleUnit;
  photo_path: string | null;
  is_available: boolean;
  status: 'active' | 'hidden';
};

export type OrderStatus =
  | 'awaiting_payment'
  | 'new'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'on_the_way'
  | 'delivered'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type OrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  sale_unit: SaleUnit;
  quantity: number;
  note: string | null;
};

export type Order = {
  id: string;
  number: number;
  customer_id: string;
  business_id: string;
  type: 'pickup' | 'delivery';
  delivery_address: string | null;
  contact_phone: string | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: 'mercadopago' | 'cash';
  status: OrderStatus;
  notes: string | null;
  eta_minutes: number | null;
  scheduled_for: string | null;
  accept_by: string | null;
  status_changed_at: string;
  created_at: string;
  order_items: OrderItem[];
};
