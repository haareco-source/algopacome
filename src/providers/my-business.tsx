import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { useCategories } from '@/hooks/use-categories';
import { DEFAULT_DELIVERY } from '@/lib/business';
import { supabase } from '@/lib/supabase';
import type { Business, BusinessHour, Category, DeliverySettings, Product } from '@/lib/types';
import { useAuth } from '@/providers/auth';

type MyBusinessValue = {
  business: Business | null;
  products: Product[];
  hours: BusinessHour[];
  delivery: DeliverySettings;
  categories: Category[];
  productLimit: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const MyBusinessContext = createContext<MyBusinessValue | null>(null);

const BUSINESS_COLUMNS =
  'id, owner_id, name, slug, type, description, ingredients, address, lat, lng, phone, whatsapp, logo_path, cover_path, plan, status, is_open_now, accepts_cash, accepts_scheduled, scheduled_daily_limit';

type BusinessData = {
  business: Business | null;
  products: Product[];
  hours: BusinessHour[];
  delivery: DeliverySettings;
};

async function loadBusiness(userId: string): Promise<BusinessData> {
  const { data: business } = await supabase
    .from('businesses')
    .select(BUSINESS_COLUMNS)
    .eq('owner_id', userId)
    .maybeSingle();
  if (!business) return { business: null, products: [], hours: [], delivery: DEFAULT_DELIVERY };

  const [productsResult, hoursResult, deliveryResult] = await Promise.all([
    supabase
      .from('products')
      .select('id, business_id, category_id, name, description, price, sale_unit, photo_path, is_available, status')
      .eq('business_id', business.id)
      .order('created_at'),
    supabase.from('business_hours').select('weekday, opens_at, closes_at').eq('business_id', business.id),
    supabase
      .from('delivery_settings')
      .select('offers_delivery, offers_pickup, fee_mode, fee, free_over, radius_km, eta_min_minutes, eta_max_minutes')
      .eq('business_id', business.id)
      .maybeSingle(),
  ]);
  return {
    business,
    products: productsResult.data ?? [],
    hours: hoursResult.data ?? [],
    delivery: deliveryResult.data ?? DEFAULT_DELIVERY,
  };
}

// El negocio del usuario (si tiene), con sus productos, horarios y entrega.
export function MyBusinessProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [business, setBusiness] = useState<Business | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [hours, setHours] = useState<BusinessHour[]>([]);
  const [delivery, setDelivery] = useState<DeliverySettings>(DEFAULT_DELIVERY);
  const categories = useCategories();
  const [limits, setLimits] = useState({ free: 5, plus: 15 });
  const [isLoading, setIsLoading] = useState(true);

  const apply = useCallback((data: BusinessData) => {
    setBusiness(data.business);
    setProducts(data.products);
    setHours(data.hours);
    setDelivery(data.delivery);
    setIsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (userId) apply(await loadBusiness(userId));
  }, [userId, apply]);

  useEffect(() => {
    if (userId) loadBusiness(userId).then(apply);
  }, [userId, apply]);

  // Los límites del plan cambian poco: se leen una vez.
  useEffect(() => {
    supabase
      .from('config')
      .select('key, value')
      .in('key', ['free_product_limit', 'plus_product_limit'])
      .then(({ data }) => {
        const value = (key: string, fallback: number) => Number(data?.find((row) => row.key === key)?.value ?? fallback);
        setLimits({ free: value('free_product_limit', 5), plus: value('plus_product_limit', 15) });
      });
  }, []);

  const productLimit = business?.plan === 'plus' ? limits.plus : limits.free;
  // Sin sesión no hay negocio; al cerrar sesión no queda el del usuario anterior a la vista.
  const value = userId
    ? { business, products, hours, delivery, categories, productLimit, isLoading, refresh }
    : { business: null, products: [], hours: [], delivery: DEFAULT_DELIVERY, categories, productLimit, isLoading: false, refresh };

  return (
    <MyBusinessContext.Provider value={value}>
      {children}
    </MyBusinessContext.Provider>
  );
}

export function useMyBusiness() {
  const value = useContext(MyBusinessContext);
  if (!value) throw new Error('useMyBusiness se usa dentro de MyBusinessProvider');
  return value;
}
