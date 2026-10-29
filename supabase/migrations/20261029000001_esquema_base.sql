-- Algopacome: esquema base del MVP (semana 1)
-- Tablas, reglas de negocio en triggers, búsqueda con ranking y políticas RLS.
-- Los pedidos se crean y cambian de estado solo con funciones (RPC); las de
-- creación de pedido y pagos llegan en las semanas 4 y 5.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('customer', 'moderator', 'admin');
create type public.account_status as enum ('active', 'suspended', 'banned');
create type public.business_type as enum ('local', 'puesto', 'carrito');
create type public.business_status as enum ('draft', 'active', 'hidden', 'suspended');
create type public.business_plan as enum ('free', 'plus');
create type public.delivery_fee_mode as enum ('fixed', 'included', 'free_over');
create type public.order_type as enum ('pickup', 'delivery');
create type public.payment_method as enum ('mercadopago', 'cash');
create type public.order_status as enum (
  'awaiting_payment', 'new', 'preparing', 'ready', 'on_the_way',
  'delivered', 'rejected', 'expired', 'cancelled'
);
create type public.payment_status as enum ('pending', 'approved', 'rejected', 'refunded', 'cancelled');
create type public.content_status as enum ('active', 'hidden');
create type public.reaction_type as enum ('like', 'dislike');
create type public.report_target as enum ('business', 'product', 'review', 'profile');
create type public.report_reason as enum (
  'inappropriate', 'plagiarism', 'duplicate_account', 'false_info',
  'scam', 'fake_review', 'other'
);
create type public.report_status as enum ('open', 'in_review', 'resolved', 'dismissed');
create type public.sanction_type as enum ('warning', 'hide_content', 'temporary_suspension', 'ban');
create type public.subscription_status as enum ('pending', 'authorized', 'paused', 'cancelled');

-- ---------------------------------------------------------------------------
-- Configuración (comisiones, límites, pesos del ranking)
-- ---------------------------------------------------------------------------

create table public.config (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now()
);

insert into public.config (key, value, description) values
  ('free_orders_threshold', '10', 'Pedidos concretados sin comisión por negocio'),
  ('commission_launch_pct', '3', 'Comisión (%) después de los pedidos gratis'),
  ('commission_standard_pct', '5', 'Comisión (%) desde la fecha de suba'),
  ('commission_standard_from', 'null', 'Fecha (ISO) desde la que rige la comisión estándar; null = todavía no'),
  ('free_product_limit', '5', 'Productos activos en el plan gratis'),
  ('plus_product_limit', '15', 'Productos activos en el plan Plus'),
  ('plus_price_usd', '1', 'Precio mensual del plan Plus en USD (se cobra en ARS)'),
  ('cash_debt_limit_ars', '20000', 'Deuda máxima de comisiones en efectivo antes de desactivar efectivo'),
  ('order_accept_minutes', '10', 'Minutos que tiene el vendedor para aceptar un pedido'),
  ('order_autoclose_hours', '3', 'Horas para cerrar solo un pedido listo o en camino'),
  ('reports_per_day', '5', 'Denuncias máximas por usuario por día'),
  ('reports_autohide', '3', 'Denuncias de usuarios distintos que ocultan el contenido'),
  ('ranking_weights', '{"likes":0.45,"rating":0.35,"activity":0.10,"novelty":0.10}', 'Pesos del puntaje de búsqueda'),
  ('ranking_prior', '{"likes":3,"rating_mean":4.0,"rating_count":5,"activity_cap":30,"novelty_days":30}', 'Ajustes bayesianos del ranking'),
  ('timezone', '"America/Argentina/Jujuy"', 'Zona horaria para horarios de atención');

create or replace function public.get_config(p_key text)
returns jsonb
language sql stable security definer set search_path = public
as $$ select value from public.config where key = p_key $$;



-- ---------------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  phone text unique,
  avatar_url text,
  role public.user_role not null default 'customer',
  status public.account_status not null default 'active',
  device_fingerprint text,
  accepted_rules_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_device_fingerprint_idx on public.profiles (device_fingerprint);

-- Datos visibles de cualquier usuario (nombre en reseñas); sin teléfono.
create view public.public_profiles as
  select id, display_name, avatar_url from public.profiles;

create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('moderator', 'admin') and status = 'active'
  )
$$;

-- Escritura hecha por la app (rol anon o authenticated) y no por staff. Las funciones
-- SECURITY DEFINER (contadores, moderación automática) corren como el dueño de la base
-- y quedan fuera, así los triggers de protección no bloquean sus actualizaciones.
create or replace function public.is_client_write()
returns boolean
language sql stable set search_path = public
as $$ select current_user in ('anon', 'authenticated') and not public.is_staff() $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, phone, display_name)
  values (
    new.id,
    nullif(new.phone, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Un usuario no puede cambiarse el rol ni el estado.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_client_write() then
    new.role := old.role;
    new.status := old.status;
    new.phone := old.phone;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  label text not null default 'Casa',
  address text not null,
  reference text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

create index addresses_profile_idx on public.addresses (profile_id);

-- ---------------------------------------------------------------------------
-- Negocios
-- ---------------------------------------------------------------------------

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  slug text not null unique,
  type public.business_type not null,
  description text not null default '' check (char_length(description) <= 600),
  ingredients text not null default '' check (char_length(ingredients) <= 600),
  address text not null default '',
  lat double precision,
  lng double precision,
  phone text not null unique,
  whatsapp text,
  logo_path text,
  cover_path text,
  video_path text,
  plan public.business_plan not null default 'free',
  status public.business_status not null default 'draft',
  is_open_now boolean not null default false,
  accepts_cash boolean not null default false,
  tax_id_hash text unique,
  completed_orders integer not null default 0,
  completed_orders_30d integer not null default 0,
  cancelled_by_seller_30d integer not null default 0,
  cash_commission_debt numeric(12, 2) not null default 0,
  rating_avg numeric(3, 2) not null default 0,
  rating_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index businesses_status_idx on public.businesses (status);

-- El dueño no puede tocar plan, estado de moderación, contadores ni calificación.
create or replace function public.protect_business_columns()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_client_write() then
    new.plan := old.plan;
    new.tax_id_hash := old.tax_id_hash;
    new.completed_orders := old.completed_orders;
    new.completed_orders_30d := old.completed_orders_30d;
    new.cancelled_by_seller_30d := old.cancelled_by_seller_30d;
    new.cash_commission_debt := old.cash_commission_debt;
    new.rating_avg := old.rating_avg;
    new.rating_count := old.rating_count;
    -- El dueño solo puede pasar entre borrador y activo; ocultar o suspender es de moderación.
    if new.status is distinct from old.status
       and (old.status not in ('draft', 'active') or new.status not in ('draft', 'active')) then
      raise exception 'No podés cambiar el estado de un negocio % ', old.status
        using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger businesses_protect before update on public.businesses
  for each row execute function public.protect_business_columns();

create or replace function public.prepare_new_business()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_client_write() then
    new.plan := 'free';
    new.tax_id_hash := null;
    new.completed_orders := 0;
    new.completed_orders_30d := 0;
    new.cancelled_by_seller_30d := 0;
    new.cash_commission_debt := 0;
    new.rating_avg := 0;
    new.rating_count := 0;
    if new.status not in ('draft', 'active') then
      new.status := 'draft';
    end if;
  end if;
  return new;
end;
$$;

create trigger businesses_prepare before insert on public.businesses
  for each row execute function public.prepare_new_business();

-- El CUIT/DNI se guarda solo como hash, para detectar cuentas duplicadas sin guardar el dato.
create or replace function public.set_business_tax_id(p_business_id uuid, p_tax_id text)
returns void
language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_digits text := regexp_replace(coalesce(p_tax_id, ''), '\D', '', 'g');
  v_hash text;
begin
  if not exists (select 1 from public.businesses where id = p_business_id and owner_id = auth.uid()) then
    raise exception 'Negocio inexistente o ajeno' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_digits) not between 7 and 11 then
    raise exception 'CUIT o DNI inválido' using errcode = 'check_violation';
  end if;
  -- Un CUIT contiene el DNI en el medio: se normaliza al DNI para que ambos coincidan.
  if char_length(v_digits) = 11 then
    v_digits := substr(v_digits, 3, 8);
  end if;
  v_hash := encode(digest('algopacome:' || ltrim(v_digits, '0'), 'sha256'), 'hex');
  if exists (select 1 from public.businesses where tax_id_hash = v_hash and id <> p_business_id) then
    raise exception 'Ya existe un negocio con ese CUIT o DNI' using errcode = 'unique_violation';
  end if;
  update public.businesses set tax_id_hash = v_hash where id = p_business_id;
end;
$$;

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  opens_at time not null,
  closes_at time not null, -- si es menor que opens_at, cierra pasada la medianoche
  unique (business_id, weekday, opens_at)
);

create table public.delivery_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  offers_delivery boolean not null default false,
  offers_pickup boolean not null default true,
  fee_mode public.delivery_fee_mode not null default 'fixed',
  fee numeric(12, 2) not null default 0 check (fee >= 0),
  free_over numeric(12, 2),
  radius_km numeric(5, 2) not null default 3,
  eta_min_minutes integer not null default 20,
  eta_max_minutes integer not null default 45,
  check (offers_delivery or offers_pickup),
  check (eta_min_minutes <= eta_max_minutes)
);

-- Abierto = interruptor manual encendido y dentro de algún horario cargado.
create or replace function public.is_business_open(p_business_id uuid, p_at timestamptz default now())
returns boolean
language sql stable set search_path = public
as $$
  with local as (
    select (p_at at time zone (public.get_config('timezone') #>> '{}')) as ts
  )
  select coalesce((
    select b.is_open_now and exists (
      select 1 from public.business_hours h, local
      where h.business_id = b.id
        and (
          (h.opens_at <= h.closes_at
            and h.weekday = extract(dow from local.ts)
            and local.ts::time >= h.opens_at and local.ts::time < h.closes_at)
          or (h.opens_at > h.closes_at and (
            (h.weekday = extract(dow from local.ts) and local.ts::time >= h.opens_at)
            or (h.weekday = (extract(dow from local.ts)::int + 6) % 7 and local.ts::time < h.closes_at)
          ))
        )
    )
    from public.businesses b where b.id = p_business_id
  ), false)
$$;

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.categories (
  id smallserial primary key,
  name text not null unique,
  icon text,
  sort_order smallint not null default 0
);

insert into public.categories (name, sort_order) values
  ('Sánguches', 1), ('Hamburguesas', 2), ('Pizzas', 3), ('Empanadas', 4),
  ('Panchos', 5), ('Lomitos', 6), ('Papas fritas', 7), ('Postres', 8), ('Bebidas', 9), ('Otros', 10);

-- Sinónimos locales para la búsqueda ("sanguche" encuentra "sándwich").
create table public.search_synonyms (
  term text primary key,
  expands_to text not null
);

insert into public.search_synonyms (term, expands_to) values
  ('sanguche', 'sandwich'), ('sanguchito', 'sandwich'), ('sandwich', 'sanguche'),
  ('milanga', 'milanesa'), ('mila', 'milanesa'),
  ('pancho', 'hot dog'), ('hotdog', 'pancho'),
  ('lomito', 'lomo'), ('hamburguesa', 'burger'), ('burger', 'hamburguesa'),
  ('papas', 'papas fritas'), ('gaseosa', 'bebida');

create or replace function public.f_unaccent(text)
returns text
language sql immutable parallel safe strict set search_path = public, extensions
as $$ select unaccent('unaccent', $1) $$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  category_id smallint references public.categories (id),
  name text not null check (char_length(name) between 2 and 60),
  description text not null default '' check (char_length(description) <= 300),
  price numeric(12, 2) not null check (price > 0),
  photo_path text,
  image_hash text, -- hash perceptual para detectar fotos copiadas
  is_available boolean not null default true,
  status public.content_status not null default 'active',
  likes integer not null default 0,
  dislikes integer not null default 0,
  score numeric(6, 5) not null default 0,
  search_text text generated always as (
    lower(public.f_unaccent(name || ' ' || description))
  ) stored,
  search_vector tsvector generated always as (
    to_tsvector('spanish', lower(public.f_unaccent(name || ' ' || description)))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index products_business_idx on public.products (business_id);
create index products_search_idx on public.products using gin (search_vector);
create index products_trgm_idx on public.products using gin (search_text extensions.gin_trgm_ops);
create index products_image_hash_idx on public.products (image_hash);

-- Límite de productos activos según el plan (5 gratis, 15 Plus).
create or replace function public.enforce_product_limit()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.business_plan;
  v_limit integer;
  v_count integer;
begin
  if new.status <> 'active' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.business_id = new.business_id then
    return new;
  end if;

  select plan into v_plan from public.businesses where id = new.business_id for update;
  v_limit := (public.get_config(case when v_plan = 'plus' then 'plus_product_limit' else 'free_product_limit' end))::int;

  select count(*) into v_count
  from public.products
  where business_id = new.business_id and status = 'active' and id <> new.id;

  if v_count >= v_limit then
    raise exception 'Llegaste al límite de % productos de tu plan', v_limit
      using errcode = 'check_violation', hint = 'plan_limit';
  end if;
  return new;
end;
$$;

create trigger products_limit before insert or update of status, business_id on public.products
  for each row execute function public.enforce_product_limit();

create or replace function public.protect_product_columns()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_client_write() then
    if tg_op = 'INSERT' then
      new.likes := 0;
      new.dislikes := 0;
      new.score := 0;
      new.image_hash := null;
    else
      new.likes := old.likes;
      new.dislikes := old.dislikes;
      new.score := old.score;
      new.image_hash := old.image_hash;
      new.business_id := old.business_id;
      -- Un producto ocultado por moderación no lo puede reactivar el dueño.
      if old.status = 'hidden' and new.status = 'active' then
        raise exception 'Este producto fue ocultado por moderación' using errcode = 'check_violation';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger products_protect before insert or update on public.products
  for each row execute function public.protect_product_columns();

-- Al bajar de Plus a gratis, se ocultan (no se borran) los productos que sobran;
-- quedan como 'hidden' por plan y el dueño elige cuáles reactivar.
-- (Lo implementa la Edge Function de suscripciones en la semana 5.)

-- ---------------------------------------------------------------------------
-- Ranking
-- ---------------------------------------------------------------------------

-- score = w_likes·L + w_rating·R + w_activity·A + w_novelty·N, todo entre 0 y 1.
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
  select * into b from public.businesses where id = p_business_id;
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

-- Corre después de products_protect (los triggers se ejecutan en orden alfabético),
-- así el puntaje siempre sale de los valores finales de la fila.
create or replace function public.products_score_on_write()
returns trigger
language plpgsql set search_path = public
as $$
begin
  new.score := public.compute_product_score(new.likes, new.dislikes, new.business_id);
  return new;
end;
$$;

create trigger products_zscore before insert or update on public.products
  for each row execute function public.products_score_on_write();

create or replace function public.refresh_business_scores(p_business_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.products set updated_at = now() where business_id = p_business_id
$$;

-- Recalcula todo; lo llama pg_cron cada noche para actualizar actividad y novedad.
create or replace function public.refresh_all_scores()
returns void
language sql security definer set search_path = public
as $$
  update public.products set updated_at = now()
$$;

-- Búsqueda: relevancia del texto como filtro, puntaje de calidad como orden.
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
  eta_max_minutes integer
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
    coalesce(d.offers_delivery, false), d.fee_mode, d.fee, d.eta_min_minutes, d.eta_max_minutes
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

-- ---------------------------------------------------------------------------
-- Pedidos
-- ---------------------------------------------------------------------------

create sequence public.order_number_seq start 1000;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number bigint not null unique default nextval('public.order_number_seq'),
  customer_id uuid not null references public.profiles (id),
  business_id uuid not null references public.businesses (id),
  type public.order_type not null,
  delivery_address text,
  delivery_lat double precision,
  delivery_lng double precision,
  subtotal numeric(12, 2) not null check (subtotal >= 0),
  delivery_fee numeric(12, 2) not null default 0 check (delivery_fee >= 0),
  total numeric(12, 2) not null check (total >= 0),
  payment_method public.payment_method not null,
  status public.order_status not null,
  is_free_order boolean not null default false,
  commission_pct numeric(5, 2) not null default 0,
  commission_amount numeric(12, 2) not null default 0,
  notes text check (char_length(notes) <= 300),
  eta_minutes integer,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  check (type = 'pickup' or delivery_address is not null)
);

create index orders_business_status_idx on public.orders (business_id, status);
create index orders_customer_idx on public.orders (customer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  unit_price numeric(12, 2) not null,
  quantity integer not null check (quantity between 1 and 50),
  note text check (char_length(note) <= 140)
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_events (
  id bigserial primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  actor_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

create index order_events_order_idx on public.order_events (order_id);

-- Transiciones permitidas (ver diagrama del documento de especificación).
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql immutable
as $$
  select (p_from, p_to) in (
    ('awaiting_payment'::public.order_status, 'new'::public.order_status),
    ('awaiting_payment', 'cancelled'),
    ('new', 'preparing'),
    ('new', 'rejected'),
    ('new', 'expired'),
    ('new', 'cancelled'),
    ('preparing', 'ready'),
    ('preparing', 'cancelled'),
    ('ready', 'on_the_way'),
    ('ready', 'delivered'),
    ('ready', 'cancelled'),
    ('on_the_way', 'delivered')
  )
$$;

create or replace function public.on_order_status_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if not public.order_transition_allowed(old.status, new.status) then
    raise exception 'No se puede pasar un pedido de % a %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  new.status_changed_at := now();

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (new.id, old.status, new.status, auth.uid());

  -- Solo "Entregado" cuenta como concretado: suma al contador de pedidos gratis.
  if new.status = 'delivered' then
    new.delivered_at := now();
    update public.businesses
      set completed_orders = completed_orders + 1,
          completed_orders_30d = completed_orders_30d + 1,
          cash_commission_debt = cash_commission_debt
            + case when new.payment_method = 'cash' then new.commission_amount else 0 end
      where id = new.business_id;
  elsif new.status = 'cancelled' and old.status in ('preparing', 'ready')
        and auth.uid() = (select owner_id from public.businesses where id = new.business_id) then
    update public.businesses
      set cancelled_by_seller_30d = cancelled_by_seller_30d + 1
      where id = new.business_id;
  end if;

  return new;
end;
$$;

create trigger orders_status_change before update of status on public.orders
  for each row execute function public.on_order_status_change();

-- Cambio de estado desde la app: el vendedor avanza su pedido; el cliente solo
-- cancela mientras está "Nuevo" o confirma la entrega.
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_is_owner boolean;
  v_is_customer boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Pedido inexistente' using errcode = 'no_data_found';
  end if;

  v_is_owner := exists (select 1 from public.businesses where id = v_order.business_id and owner_id = auth.uid());
  v_is_customer := v_order.customer_id = auth.uid();

  if not (
    public.is_staff()
    or (v_is_owner and p_status in ('preparing', 'ready', 'on_the_way', 'delivered', 'rejected', 'cancelled'))
    or (v_is_customer and (
          (p_status = 'cancelled' and v_order.status = 'new')
          or (p_status = 'delivered' and v_order.status in ('ready', 'on_the_way'))
        ))
  ) then
    raise exception 'No tenés permiso para este cambio' using errcode = 'insufficient_privilege';
  end if;

  update public.orders set status = p_status where id = p_order_id returning * into v_order;

  if p_reason is not null then
    update public.order_events set reason = p_reason
    where id = (select max(id) from public.order_events where order_id = p_order_id);
  end if;

  return v_order;
end;
$$;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  mp_preference_id text,
  mp_payment_id text unique,
  status public.payment_status not null default 'pending',
  amount numeric(12, 2) not null,
  marketplace_fee numeric(12, 2) not null default 0,
  raw_webhook jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payments_order_idx on public.payments (order_id);

-- Tokens de Mercado Pago de cada vendedor: solo los leen las Edge Functions (service_role).
create table public.seller_accounts (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  mp_user_id text unique,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  linked_at timestamptz
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  mp_preapproval_id text unique,
  plan public.business_plan not null default 'plus',
  status public.subscription_status not null default 'pending',
  next_charge_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.commission_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id),
  period date not null, -- primer día del mes facturado
  commissions_total numeric(12, 2) not null default 0,
  subscription_total numeric(12, 2) not null default 0,
  invoice_type text not null default 'C',
  invoice_number text,
  cae text,
  issued_at timestamptz,
  unique (business_id, period)
);

-- ---------------------------------------------------------------------------
-- Calificaciones
-- ---------------------------------------------------------------------------

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  business_id uuid not null references public.businesses (id) on delete cascade,
  customer_id uuid not null references public.profiles (id),
  stars smallint not null check (stars between 1 and 5),
  comment text check (char_length(comment) <= 500),
  seller_reply text check (char_length(seller_reply) <= 500),
  status public.content_status not null default 'active',
  created_at timestamptz not null default now()
);

create index reviews_business_idx on public.reviews (business_id, created_at desc);

-- Solo califica quien recibió el pedido; nadie se califica a sí mismo.
create or replace function public.validate_review()
returns trigger
language plpgsql set search_path = public
as $$
declare
  v_order public.orders;
begin
  if tg_op = 'INSERT' then
    select * into v_order from public.orders where id = new.order_id;
    if v_order.status is distinct from 'delivered' or v_order.customer_id <> auth.uid() then
      raise exception 'Solo podés calificar pedidos tuyos ya entregados' using errcode = 'check_violation';
    end if;
    new.business_id := v_order.business_id;
    new.customer_id := v_order.customer_id;
    new.seller_reply := null;
    new.status := 'active';
  elsif public.is_client_write() then
    new.order_id := old.order_id;
    new.business_id := old.business_id;
    new.customer_id := old.customer_id;
    if auth.uid() = old.customer_id then
      new.seller_reply := old.seller_reply;
      new.status := old.status;
    else
      -- El vendedor solo responde.
      new.stars := old.stars;
      new.comment := old.comment;
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

create trigger reviews_validate before insert or update on public.reviews
  for each row execute function public.validate_review();

create or replace function public.refresh_business_rating()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_business uuid := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
begin
  update public.businesses b set
    rating_avg = coalesce((select round(avg(stars), 2) from public.reviews where business_id = v_business and status = 'active'), 0),
    rating_count = (select count(*) from public.reviews where business_id = v_business and status = 'active')
  where b.id = v_business;
  perform public.refresh_business_scores(v_business);
  return null;
end;
$$;

create trigger reviews_rating after insert or delete or update of stars, status on public.reviews
  for each row execute function public.refresh_business_rating();

create table public.product_reactions (
  product_id uuid not null references public.products (id) on delete cascade,
  customer_id uuid not null references public.profiles (id) on delete cascade,
  type public.reaction_type not null,
  created_at timestamptz not null default now(),
  primary key (product_id, customer_id)
);

create or replace function public.validate_reaction()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.order_items i
    join public.orders o on o.id = i.order_id
    where i.product_id = new.product_id
      and o.customer_id = new.customer_id
      and o.status = 'delivered'
  ) then
    raise exception 'Solo podés reaccionar a productos que recibiste' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger product_reactions_validate before insert or update on public.product_reactions
  for each row execute function public.validate_reaction();

create or replace function public.refresh_product_reactions()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_product uuid := case when tg_op = 'DELETE' then old.product_id else new.product_id end;
begin
  update public.products set
    likes = (select count(*) from public.product_reactions where product_id = v_product and type = 'like'),
    dislikes = (select count(*) from public.product_reactions where product_id = v_product and type = 'dislike')
  where id = v_product;
  return null;
end;
$$;

create trigger product_reactions_count after insert or update or delete on public.product_reactions
  for each row execute function public.refresh_product_reactions();

-- ---------------------------------------------------------------------------
-- Moderación
-- ---------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id),
  target_type public.report_target not null,
  target_id uuid not null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  evidence_path text,
  status public.report_status not null default 'open',
  priority smallint not null default 2, -- 1 alta, 2 normal
  resolution text,
  moderator_id uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (reporter_id, target_type, target_id)
);

create index reports_queue_idx on public.reports (status, priority, created_at);
create index reports_target_idx on public.reports (target_type, target_id);

create or replace function public.on_report_insert()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_reporters integer;
begin
  if (select count(*) from public.reports
      where reporter_id = new.reporter_id and created_at > now() - interval '1 day')
     >= (public.get_config('reports_per_day'))::int then
    raise exception 'Llegaste al máximo de denuncias por hoy' using errcode = 'check_violation';
  end if;

  new.status := 'open';
  new.moderator_id := null;
  new.resolution := null;
  new.priority := case when new.reason in ('scam', 'inappropriate') then 1 else 2 end;

  select count(distinct reporter_id) + 1 into v_reporters
  from public.reports
  where target_type = new.target_type and target_id = new.target_id and status in ('open', 'in_review');

  -- Con varias denuncias distintas el contenido se oculta hasta que lo revise un moderador.
  if v_reporters >= (public.get_config('reports_autohide'))::int then
    case new.target_type
      when 'product' then update public.products set status = 'hidden' where id = new.target_id;
      when 'review' then update public.reviews set status = 'hidden' where id = new.target_id;
      when 'business' then update public.businesses set status = 'hidden' where id = new.target_id and status = 'active';
      else null;
    end case;
  end if;

  return new;
end;
$$;

create trigger reports_insert before insert on public.reports
  for each row execute function public.on_report_insert();

create table public.sanctions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id),
  business_id uuid references public.businesses (id),
  type public.sanction_type not null,
  reason text not null,
  report_id uuid references public.reports (id),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  appeal text,
  appeal_resolved boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (profile_id is not null or business_id is not null)
);

-- Posibles cuentas duplicadas: mismo dispositivo, mismo teléfono o ubicación a menos de 30 m.
create or replace view public.possible_duplicate_businesses
with (security_invoker = true) as
  select a.id as business_id, b.id as other_business_id,
    case
      when a.phone = b.phone then 'phone'
      when pa.device_fingerprint is not null and pa.device_fingerprint = pb.device_fingerprint then 'device'
      else 'location'
    end as match_type
  from public.businesses a
  join public.businesses b on a.id < b.id
  join public.profiles pa on pa.id = a.owner_id
  join public.profiles pb on pb.id = b.owner_id
  where a.phone = b.phone
     or (pa.device_fingerprint is not null and pa.device_fingerprint = pb.device_fingerprint)
     or (a.lat is not null and b.lat is not null
         and abs(a.lat - b.lat) < 0.0003 and abs(a.lng - b.lng) < 0.0003);

-- ---------------------------------------------------------------------------
-- Seguridad (RLS)
-- ---------------------------------------------------------------------------

alter table public.config enable row level security;
alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.businesses enable row level security;
alter table public.business_hours enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.categories enable row level security;
alter table public.search_synonyms enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.commission_invoices enable row level security;
alter table public.reviews enable row level security;
alter table public.product_reactions enable row level security;
alter table public.reports enable row level security;
alter table public.sanctions enable row level security;

create or replace function public.owns_business(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.businesses where id = p_business_id and owner_id = auth.uid()) $$;

create or replace function public.business_is_visible(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.businesses where id = p_business_id and status = 'active') $$;

-- config: lectura pública, escritura de staff
create policy config_read on public.config for select using (true);
create policy config_write on public.config for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- profiles
create policy profiles_read_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_staff()) with check (id = auth.uid() or public.is_staff());
grant select on public.public_profiles to anon, authenticated;

-- addresses
create policy addresses_own on public.addresses for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- businesses
create policy businesses_read on public.businesses for select
  using (status = 'active' or owner_id = auth.uid() or public.is_staff());
create policy businesses_insert on public.businesses for insert to authenticated
  with check (owner_id = auth.uid());
create policy businesses_update on public.businesses for update to authenticated
  using (owner_id = auth.uid() or public.is_staff())
  with check (owner_id = auth.uid() or public.is_staff());

-- horarios y delivery
create policy business_hours_read on public.business_hours for select
  using (public.business_is_visible(business_id) or public.owns_business(business_id) or public.is_staff());
create policy business_hours_write on public.business_hours for all to authenticated
  using (public.owns_business(business_id)) with check (public.owns_business(business_id));
create policy delivery_settings_read on public.delivery_settings for select
  using (public.business_is_visible(business_id) or public.owns_business(business_id) or public.is_staff());
create policy delivery_settings_write on public.delivery_settings for all to authenticated
  using (public.owns_business(business_id)) with check (public.owns_business(business_id));

-- catálogo
create policy categories_read on public.categories for select using (true);
create policy categories_write on public.categories for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy synonyms_read on public.search_synonyms for select using (true);
create policy synonyms_write on public.search_synonyms for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy products_read on public.products for select
  using ((status = 'active' and public.business_is_visible(business_id))
         or public.owns_business(business_id) or public.is_staff());
create policy products_write on public.products for insert to authenticated
  with check (public.owns_business(business_id));
create policy products_update on public.products for update to authenticated
  using (public.owns_business(business_id) or public.is_staff())
  with check (public.owns_business(business_id) or public.is_staff());
create policy products_delete on public.products for delete to authenticated
  using (public.owns_business(business_id));

-- pedidos: lectura para las partes; escritura solo por funciones
create policy orders_read on public.orders for select to authenticated
  using (customer_id = auth.uid() or public.owns_business(business_id) or public.is_staff());
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.customer_id = auth.uid() or public.owns_business(o.business_id) or public.is_staff())));
create policy order_events_read on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.customer_id = auth.uid() or public.owns_business(o.business_id) or public.is_staff())));
create policy payments_read on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.customer_id = auth.uid() or public.owns_business(o.business_id) or public.is_staff())));

-- seller_accounts: sin políticas, solo service_role

create policy subscriptions_read on public.subscriptions for select to authenticated
  using (public.owns_business(business_id) or public.is_staff());
create policy commission_invoices_read on public.commission_invoices for select to authenticated
  using (public.owns_business(business_id) or public.is_staff());

-- reseñas
create policy reviews_read on public.reviews for select
  using (status = 'active' or customer_id = auth.uid() or public.owns_business(business_id) or public.is_staff());
create policy reviews_insert on public.reviews for insert to authenticated
  with check (customer_id = auth.uid());
create policy reviews_update on public.reviews for update to authenticated
  using (customer_id = auth.uid() or public.owns_business(business_id) or public.is_staff())
  with check (customer_id = auth.uid() or public.owns_business(business_id) or public.is_staff());

create policy reactions_own on public.product_reactions for all to authenticated
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- denuncias
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_staff());
create policy reports_update on public.reports for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy sanctions_read on public.sanctions for select to authenticated
  using (profile_id = auth.uid() or public.owns_business(business_id) or public.is_staff());
create policy sanctions_write on public.sanctions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Funciones expuestas a la app
revoke execute on function public.refresh_all_scores() from public, anon, authenticated;
revoke execute on function public.refresh_business_scores(uuid) from public, anon, authenticated;
grant execute on function public.search_products(text, boolean, boolean, smallint, integer, integer) to anon, authenticated;
grant execute on function public.is_business_open(uuid, timestamptz) to anon, authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.set_business_tax_id(uuid, text) to authenticated;

-- Tiempo real para el panel del vendedor y el seguimiento del cliente
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;
