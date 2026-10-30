import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { ORDER_COLUMNS } from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import type { Order } from '@/lib/types';
import { useMyBusiness } from '@/providers/my-business';

type SellerOrdersValue = {
  orders: Order[];
  customerNames: Record<string, string>;
  newCount: number;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const SellerOrdersContext = createContext<SellerOrdersValue | null>(null);

const ACTIVE = 'new,accepted,preparing,ready,on_the_way';

type OrdersData = { orders: Order[]; customerNames: Record<string, string> };

async function loadOrders(businessId: string): Promise<OrdersData> {
  // Vence lo que nadie aceptó a tiempo antes de mostrar la lista.
  await supabase.rpc('expire_overdue_orders');
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .eq('business_id', businessId)
    .or(`status.in.(${ACTIVE}),created_at.gte.${since}`)
    .order('created_at', { ascending: false })
    .limit(100)
    .returns<Order[]>();
  const orders = data ?? [];

  const customerIds = [...new Set(orders.map((order) => order.customer_id))];
  const customerNames: Record<string, string> = {};
  if (customerIds.length > 0) {
    const { data: profiles } = await supabase.from('public_profiles').select('id, display_name').in('id', customerIds);
    for (const profile of profiles ?? []) customerNames[profile.id] = profile.display_name;
  }
  return { orders, customerNames };
}

// Pedidos del negocio propio, actualizados en vivo. Alimenta la pestaña "Mi negocio" y su contador.
export function SellerOrdersProvider({ children }: PropsWithChildren) {
  const { business } = useMyBusiness();
  const businessId = business?.id;
  const [data, setData] = useState<OrdersData>({ orders: [], customerNames: {} });
  const [isLoading, setIsLoading] = useState(true);

  const apply = useCallback((next: OrdersData) => {
    setData(next);
    setIsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (businessId) apply(await loadOrders(businessId));
  }, [apply, businessId]);

  useEffect(() => {
    if (!businessId) return;
    let active = true;
    const reload = () => {
      loadOrders(businessId).then((next) => {
        if (active) apply(next);
      });
    };
    reload();

    const channel = supabase
      .channel(`business-orders-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `business_id=eq.${businessId}` },
        reload,
      )
      .subscribe();
    // Cada minuto: vencimientos y cuenta regresiva.
    const timer = setInterval(reload, 60 * 1000);

    return () => {
      active = false;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [apply, businessId]);

  const orders = businessId ? data.orders : [];
  const newCount = orders.filter((order) => order.status === 'new').length;

  return (
    <SellerOrdersContext.Provider
      value={{ orders, customerNames: data.customerNames, newCount, isLoading: !!businessId && isLoading, refresh }}>
      {children}
    </SellerOrdersContext.Provider>
  );
}

export function useSellerOrders() {
  const value = useContext(SellerOrdersContext);
  if (!value) throw new Error('useSellerOrders se usa dentro de SellerOrdersProvider');
  return value;
}
