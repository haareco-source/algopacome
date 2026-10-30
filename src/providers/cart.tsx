import 'expo-sqlite/localStorage/install';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

export type CartItem = {
  productId: string;
  name: string;
  price: number;
  photoPath: string | null;
  quantity: number;
};

export type Cart = {
  businessId: string;
  businessName: string;
  items: CartItem[];
};

type CartValue = {
  cart: Cart | null;
  count: number;
  subtotal: number;
  // Devuelve false si el carrito tiene productos de otro negocio (hay que vaciarlo primero).
  add: (business: { id: string; name: string }, item: Omit<CartItem, 'quantity'>, quantity?: number) => boolean;
  // Vacía el carrito y empieza uno nuevo con este producto.
  replaceWith: (business: { id: string; name: string }, item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
};

const STORAGE_KEY = 'algopacome.cart';
const CartContext = createContext<CartValue | null>(null);

function readStoredCart(): Cart | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Cart) : null;
  } catch {
    return null;
  }
}

// Un pedido es de un solo negocio, así que el carrito también. Se guarda en el celular.
export function CartProvider({ children }: PropsWithChildren) {
  const [cart, setCart] = useState<Cart | null>(readStoredCart);

  useEffect(() => {
    try {
      if (cart) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(cart));
      else globalThis.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // Si no se puede guardar, el carrito vive mientras la app esté abierta.
    }
  }, [cart]);

  const add = useCallback<CartValue['add']>(
    (business, item, quantity = 1) => {
      if (cart && cart.businessId !== business.id && cart.items.length > 0) return false;
      setCart((current) => {
        const base =
          current && current.businessId === business.id
            ? current
            : { businessId: business.id, businessName: business.name, items: [] };
        const existing = base.items.find((entry) => entry.productId === item.productId);
        const items = existing
          ? base.items.map((entry) =>
              entry.productId === item.productId ? { ...entry, ...item, quantity: entry.quantity + quantity } : entry,
            )
          : [...base.items, { ...item, quantity }];
        return { ...base, items };
      });
      return true;
    },
    [cart],
  );

  const replaceWith = useCallback<CartValue['replaceWith']>((business, item, quantity = 1) => {
    setCart({ businessId: business.id, businessName: business.name, items: [{ ...item, quantity }] });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setCart((current) => {
      if (!current) return current;
      const items =
        quantity > 0
          ? current.items.map((entry) => (entry.productId === productId ? { ...entry, quantity } : entry))
          : current.items.filter((entry) => entry.productId !== productId);
      return items.length > 0 ? { ...current, items } : null;
    });
  }, []);

  const clear = useCallback(() => setCart(null), []);

  const value = useMemo(() => {
    const items = cart?.items ?? [];
    return {
      cart,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
      add,
      replaceWith,
      setQuantity,
      clear,
    };
  }, [cart, add, replaceWith, setQuantity, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart se usa dentro de CartProvider');
  return value;
}
