-- Unidad de venta del producto: aclara si el precio es por unidad, media docena, docena o porción.

create type public.sale_unit as enum ('unidad', 'media_docena', 'docena', 'porcion');

alter table public.products add column if not exists sale_unit public.sale_unit not null default 'unidad';
alter table public.order_items add column if not exists sale_unit public.sale_unit not null default 'unidad';

-- La búsqueda devuelve la unidad (cambian las columnas, por eso se recrea).
drop function if exists public.search_products(text, boolean, boolean, smallint, integer, integer);
create or replace function public.search_products(
  p_query text default '',
  p_only_open boolean default false,
  p_only_delivery boolean default false,
  p_category_id smallint default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  product_id uuid,
  product_name text,
  description text,
  price numeric,
  photo_path text,
  likes integer,
  score numeric,
  business_id uuid,
  business_name text,
  business_type public.business_type,
  rating_avg numeric,
  rating_count integer,
  is_open boolean,
  offers_delivery boolean,
  delivery_fee_mode public.delivery_fee_mode,
  delivery_fee numeric,
  eta_min_minutes integer,
  eta_max_minutes integer,
  sale_unit public.sale_unit
)
language plpgsql stable security definer set search_path = public, extensions
as $$
declare
  v_q text := lower(public.f_unaccent(trim(coalesce(p_query, ''))));
  v_terms text[];
  v_tsquery tsquery;
begin
  if v_q <> '' then
    -- Cada palabra se busca con sus sinónimos: (sanguche | sandwich) & milanesa
    select array_agg(
      '(' || quote_literal(w) || ':*' ||
      coalesce((select string_agg(' | ' || quote_literal(s) || ':*', '')
                from public.search_synonyms ss,
                     regexp_split_to_table(ss.expands_to, '\s+') s
                where ss.term = w), '') || ')'
    )
    into v_terms
    from regexp_split_to_table(v_q, '\s+') w
    where char_length(w) > 1 and w not in ('de', 'con', 'la', 'el', 'y', 'a', 'al', 'del');

    if v_terms is not null then
      v_tsquery := to_tsquery('spanish', array_to_string(v_terms, ' & '));
    end if;
  end if;

  return query
  select
    p.id, p.name, p.description, p.price, p.photo_path, p.likes, p.score,
    b.id, b.name, b.type, b.rating_avg, b.rating_count,
    public.is_business_open(b.id),
    coalesce(d.offers_delivery, false), d.fee_mode, d.fee, d.eta_min_minutes, d.eta_max_minutes, p.sale_unit
  from public.products p
  join public.businesses b on b.id = p.business_id
  left join public.delivery_settings d on d.business_id = b.id
  where p.status = 'active'
    and p.is_available
    and b.status = 'active'
    and (p_category_id is null or p.category_id = p_category_id)
    and (not p_only_delivery or coalesce(d.offers_delivery, false))
    and (not p_only_open or public.is_business_open(b.id))
    and (
      v_q = ''
      or (v_tsquery is not null and p.search_vector @@ v_tsquery)
      or word_similarity(v_q, p.search_text) > 0.45
    )
  order by
    public.is_business_open(b.id) desc,
    p.score desc,
    p.likes desc
  limit least(p_limit, 50) offset greatest(p_offset, 0);
end;
$$;
grant execute on function public.search_products(text, boolean, boolean, smallint, integer, integer) to anon, authenticated;

-- Guarda en el pedido por qué unidad era el precio.
create or replace function public.create_order(
  p_business_id uuid,
  p_items jsonb,
  p_type public.order_type,
  p_payment_method public.payment_method,
  p_scheduled_for timestamptz default null,
  p_delivery_address text default null,
  p_delivery_lat double precision default null,
  p_delivery_lng double precision default null,
  p_contact_phone text default null,
  p_notes text default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_customer uuid := auth.uid();
  v_tz text := public.get_config('timezone') #>> '{}';
  b public.businesses;
  d public.delivery_settings;
  v_count integer;
  v_subtotal numeric(12, 2);
  v_fee numeric(12, 2) := 0;
  v_free boolean;
  v_pct numeric(5, 2);
  v_standard_from timestamptz;
  v_status public.order_status;
  v_order_id uuid;
begin
  if v_customer is null then
    raise exception 'Tenés que ingresar para hacer un pedido' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.profiles where id = v_customer and status <> 'active') then
    raise exception 'Tu cuenta no puede hacer pedidos' using errcode = 'insufficient_privilege';
  end if;

  select * into b from public.businesses where id = p_business_id and status = 'active';
  if not found then
    raise exception 'Este negocio no está disponible' using errcode = 'check_violation';
  end if;
  if b.owner_id = v_customer then
    raise exception 'No podés hacerle un pedido a tu propio negocio' using errcode = 'check_violation';
  end if;

  select * into d from public.delivery_settings where business_id = b.id;
  if p_type = 'delivery' and not coalesce(d.offers_delivery, false) then
    raise exception 'Este negocio no hace delivery' using errcode = 'check_violation';
  end if;
  if p_type = 'pickup' and not coalesce(d.offers_pickup, true) then
    raise exception 'Este negocio no tiene retiro en el lugar' using errcode = 'check_violation';
  end if;
  if p_type = 'delivery' and coalesce(btrim(p_delivery_address), '') = '' then
    raise exception 'Falta la dirección de entrega' using errcode = 'check_violation';
  end if;
  if p_payment_method = 'cash' and not b.accepts_cash then
    raise exception 'Este negocio no acepta efectivo' using errcode = 'check_violation';
  end if;

  if p_scheduled_for is null then
    if not public.is_business_open(b.id) then
      raise exception '%', case when b.accepts_scheduled
        then 'El negocio está cerrado ahora. Podés programar el pedido para cuando abra.'
        else 'El negocio está cerrado ahora.' end
        using errcode = 'check_violation';
    end if;
  else
    if not b.accepts_scheduled then
      raise exception 'Este negocio no toma pedidos programados' using errcode = 'check_violation';
    end if;
    if p_payment_method = 'cash' then
      raise exception 'Los pedidos programados se pagan por adelantado' using errcode = 'check_violation';
    end if;
    if p_scheduled_for < now() + make_interval(mins => public.schedule_lead_minutes(b.id)) then
      raise exception 'Elegí un horario con al menos % minutos de anticipación', public.schedule_lead_minutes(b.id)
        using errcode = 'check_violation';
    end if;
    if (p_scheduled_for at time zone v_tz)::date
       > (now() at time zone v_tz)::date + (public.get_config('schedule_max_days') #>> '{}')::int then
      raise exception 'Por ahora solo se puede programar para hoy' using errcode = 'check_violation';
    end if;
    if not public.within_business_hours(b.id, p_scheduled_for) then
      raise exception 'A esa hora el negocio no atiende' using errcode = 'check_violation';
    end if;
    if b.scheduled_daily_limit is not null then
      select count(*) into v_count from public.orders
      where business_id = b.id
        and scheduled_for is not null
        and (scheduled_for at time zone v_tz)::date = (p_scheduled_for at time zone v_tz)::date
        and status not in ('cancelled', 'rejected', 'expired');
      if v_count >= b.scheduled_daily_limit then
        raise exception 'El negocio ya completó los pedidos programados de ese día' using errcode = 'check_violation';
      end if;
    end if;
  end if;

  -- Productos: deben ser de este negocio, estar publicados y con stock.
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El carrito está vacío' using errcode = 'check_violation';
  end if;
  select count(*), coalesce(sum(p.price * x.quantity), 0) into v_count, v_subtotal
  from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer, note text)
  join public.products p on p.id = x.product_id
  where p.business_id = b.id and p.status = 'active' and p.is_available
    and x.quantity between 1 and 50;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'Algún producto ya no está disponible. Revisá el carrito.' using errcode = 'check_violation';
  end if;

  if p_type = 'delivery' then
    v_fee := case
      when d.fee_mode = 'included' then 0
      when d.fee_mode = 'free_over' and d.free_over is not null and v_subtotal >= d.free_over then 0
      else d.fee
    end;
  end if;

  -- Comisión: los primeros pedidos concretados son gratis; después, la de lanzamiento o la estándar.
  v_free := b.completed_orders < (public.get_config('free_orders_threshold') #>> '{}')::int;
  v_standard_from := (public.get_config('commission_standard_from') #>> '{}')::timestamptz;
  v_pct := case
    when v_free then 0
    when v_standard_from is not null and now() >= v_standard_from
      then (public.get_config('commission_standard_pct') #>> '{}')::numeric
    else (public.get_config('commission_launch_pct') #>> '{}')::numeric
  end;

  -- Con efectivo entra directo; con Mercado Pago espera el pago (salvo en modo de prueba).
  v_status := case
    when p_payment_method = 'cash' or (public.get_config('payments_test_mode') #>> '{}')::boolean then 'new'
    else 'awaiting_payment'
  end;

  insert into public.orders (
    customer_id, business_id, type, delivery_address, delivery_lat, delivery_lng, contact_phone,
    subtotal, delivery_fee, total, payment_method, status, is_free_order, commission_pct, commission_amount,
    notes, eta_minutes, scheduled_for, accept_by
  ) values (
    v_customer, b.id, p_type,
    case when p_type = 'delivery' then btrim(p_delivery_address) end,
    case when p_type = 'delivery' then p_delivery_lat end,
    case when p_type = 'delivery' then p_delivery_lng end,
    nullif(btrim(p_contact_phone), ''),
    v_subtotal, v_fee, v_subtotal + v_fee, p_payment_method, v_status, v_free, v_pct, round(v_subtotal * v_pct / 100, 2),
    nullif(btrim(p_notes), ''), d.eta_max_minutes, p_scheduled_for,
    case when v_status = 'new' then public.order_accept_deadline(b.id, p_scheduled_for) end
  ) returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, unit_price, sale_unit, quantity, note)
  select v_order_id, p.id, p.name, p.price, p.sale_unit, x.quantity, nullif(btrim(x.note), '')
  from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer, note text)
  join public.products p on p.id = x.product_id;

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, v_status, v_customer);

  return v_order_id;
end;
$$;
