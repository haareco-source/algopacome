import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Category } from '@/lib/types';

// Las categorías cambian muy poco: se piden una vez por sesión de la app.
let cache: Promise<Category[]> | null = null;

function loadCategories() {
  cache ??= Promise.resolve(
    supabase
      .from('categories')
      .select('id, name, sort_order')
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) cache = null;
        return data ?? [];
      }),
  );
  return cache;
}

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let active = true;
    loadCategories().then((data) => {
      if (active) setCategories(data);
    });
    return () => {
      active = false;
    };
  }, []);

  return categories;
}
