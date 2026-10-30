-- Semana 3: listados y perfil público de negocios.

-- El hash del CUIT/DNI y la deuda de comisiones no se leen desde la app:
-- con un DNI de 8 dígitos el hash se podría adivinar probando todos.
revoke select on public.businesses from anon, authenticated;
grant select (
  id, owner_id, name, slug, type, description, ingredients, address, lat, lng, phone, whatsapp,
  logo_path, cover_path, video_path, plan, status, is_open_now, accepts_cash,
  completed_orders, completed_orders_30d, cancelled_by_seller_30d, rating_avg, rating_count,
  created_at, updated_at
) on public.businesses to anon, authenticated;

-- El puntaje se calcula con los permisos de quien escribe: lee solo columnas permitidas.
create or replace function public.compute_product_score(p_likes integer, p_dislikes integer, p_business_id uuid)
returns numeric
language plpgsql stable set search_path = public
as $$
declare
  w jsonb := public.get_config('ranking_weights');
  pr jsonb := public.get_config('ranking_prior');
  b record;
  v_l numeric;
  v_r numeric;
  v_a numeric;
  v_n numeric;
  v_score numeric;
begin
  select rating_avg, rating_count, completed_orders_30d, cancelled_by_seller_30d, created_at
  into b from public.businesses where id = p_business_id;
  if not found then
    return 0;
  end if;

  v_l := (p_likes + (pr ->> 'likes')::numeric) / (p_likes + p_dislikes + 2 * (pr ->> 'likes')::numeric);
  v_r := ((b.rating_avg * b.rating_count + (pr ->> 'rating_mean')::numeric * (pr ->> 'rating_count')::numeric)
          / (b.rating_count + (pr ->> 'rating_count')::numeric) - 1) / 4;
  v_a := least(b.completed_orders_30d::numeric / (pr ->> 'activity_cap')::numeric, 1);
  v_n := greatest(0, 1 - extract(epoch from now() - b.created_at) / 86400 / (pr ->> 'novelty_days')::numeric);

  v_score := (w ->> 'likes')::numeric * v_l
           + (w ->> 'rating')::numeric * v_r
           + (w ->> 'activity')::numeric * v_a
           + (w ->> 'novelty')::numeric * v_n;

  -- Penalización: más de 20 % de pedidos cancelados por el vendedor en 30 días.
  if b.completed_orders_30d + b.cancelled_by_seller_30d > 0
     and b.cancelled_by_seller_30d::numeric / (b.completed_orders_30d + b.cancelled_by_seller_30d) > 0.2 then
    v_score := v_score - 0.1;
  end if;

  return round(greatest(0, least(1, v_score)), 5);
end;
$$;

-- Negocios publicados para el inicio: abiertos primero, después por calificación
-- (bayesiana, igual que el ranking) y por el mejor puntaje de sus productos.
create or replace function public.list_businesses(
  p_only_open boolean default false,
  p_limit integer default 20
)
returns table (
  business_id uuid,
  name text,
  type public.business_type,
  logo_path text,
  cover_path text,
  rating_avg numeric,
  rating_count integer,
  is_open boolean,
  offers_delivery boolean,
  delivery_fee_mode public.delivery_fee_mode,
  delivery_fee numeric,
  eta_min_minutes integer,
  eta_max_minutes integer
)
language sql stable security definer set search_path = public
as $$
  with prior as (select public.get_config('ranking_prior') as pr)
  select
    b.id, b.name, b.type, b.logo_path, b.cover_path, b.rating_avg, b.rating_count,
    public.is_business_open(b.id) as open_now,
    coalesce(d.offers_delivery, false), d.fee_mode, d.fee, d.eta_min_minutes, d.eta_max_minutes
  from public.businesses b
  cross join prior
  left join public.delivery_settings d on d.business_id = b.id
  where b.status = 'active'
    and exists (select 1 from public.products p where p.business_id = b.id and p.status = 'active')
    and (not p_only_open or public.is_business_open(b.id))
  order by
    open_now desc,
    (b.rating_avg * b.rating_count + (prior.pr ->> 'rating_mean')::numeric * (prior.pr ->> 'rating_count')::numeric)
      / (b.rating_count + (prior.pr ->> 'rating_count')::numeric) desc,
    (select max(p.score) from public.products p where p.business_id = b.id and p.status = 'active') desc nulls last
  limit least(p_limit, 50)
$$;

-- Perfil público de un negocio (o el propio, aunque esté en borrador).
create or replace function public.get_business_profile(p_business_id uuid)
returns table (
  business_id uuid,
  name text,
  type public.business_type,
  description text,
  ingredients text,
  address text,
  lat double precision,
  lng double precision,
  phone text,
  whatsapp text,
  logo_path text,
  cover_path text,
  status public.business_status,
  accepts_cash boolean,
  rating_avg numeric,
  rating_count integer,
  is_open boolean,
  offers_pickup boolean,
  offers_delivery boolean,
  delivery_fee_mode public.delivery_fee_mode,
  delivery_fee numeric,
  free_over numeric,
  radius_km numeric,
  eta_min_minutes integer,
  eta_max_minutes integer
)
language sql stable security definer set search_path = public
as $$
  select
    b.id, b.name, b.type, b.description, b.ingredients, b.address, b.lat, b.lng, b.phone, b.whatsapp,
    b.logo_path, b.cover_path, b.status, b.accepts_cash, b.rating_avg, b.rating_count,
    public.is_business_open(b.id),
    coalesce(d.offers_pickup, true), coalesce(d.offers_delivery, false), d.fee_mode, d.fee, d.free_over,
    d.radius_km, d.eta_min_minutes, d.eta_max_minutes
  from public.businesses b
  left join public.delivery_settings d on d.business_id = b.id
  where b.id = p_business_id
    and (b.status = 'active' or b.owner_id = auth.uid() or public.is_staff())
$$;

grant execute on function public.list_businesses(boolean, integer) to anon, authenticated;
grant execute on function public.get_business_profile(uuid) to anon, authenticated;
