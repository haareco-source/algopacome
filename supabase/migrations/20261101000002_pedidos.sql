-- Semana 4 (parte 2): pedidos ya o programados, aceptación con plazo, vencimientos y avisos.

insert into public.config (key, value, description) values
  ('schedule_max_days', '0', 'Días hacia adelante para programar un pedido (0 = solo hoy)'),
  ('payments_test_mode', 'true', 'Mientras no esté Mercado Pago: el pedido con Mercado Pago se toma como pagado'),
  ('awaiting_payment_minutes', '30', 'Minutos para pagar antes de que el pedido se cancele solo')
on conflict (key) do nothing;

-- Opción del negocio: acepta pedidos programados y con qué tope por día.
alter table public.businesses
  add column if not exists accepts_scheduled boolean not null default false,
  add column if not exists scheduled_daily_limit integer check (scheduled_daily_limit between 1 and 500);
grant select (accepts_scheduled, scheduled_daily_limit) on public.businesses to anon, authenticated;

-- Pedido: para cuándo, hasta cuándo se puede aceptar y teléfono de contacto para el delivery.
alter table public.orders
  add column if not exists scheduled_for timestamptz,
  add column if not exists accept_by timestamptz,
  add column if not exists contact_phone text check (char_length(contact_phone) <= 30);
create index if not exists orders_business_scheduled_idx on public.orders (business_id, scheduled_for)
  where scheduled_for is not null;
create index if not exists orders_accept_by_idx on public.orders (accept_by) where status = 'new';

-- Perfil público: suma si toma pedidos programados (cambia las columnas, por eso se recrea).
drop function if exists public.get_business_profile(uuid);
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
  eta_max_minutes integer,
  accepts_scheduled boolean
)
language sql stable security definer set search_path = public
as $$
  select
    b.id, b.name, b.type, b.description, b.ingredients, b.address, b.lat, b.lng, b.phone, b.whatsapp,
    b.logo_path, b.cover_path, b.status, b.accepts_cash, b.rating_avg, b.rating_count,
    public.is_business_open(b.id),
    coalesce(d.offers_pickup, true), coalesce(d.offers_delivery, false), d.fee_mode, d.fee, d.free_over,
    d.radius_km, d.eta_min_minutes, d.eta_max_minutes, b.accepts_scheduled
  from public.businesses b
  left join public.delivery_settings d on d.business_id = b.id
  where b.id = p_business_id
    and (b.status = 'active' or b.owner_id = auth.uid() or public.is_staff())
$$;
grant execute on function public.get_business_profile(uuid) to anon, authenticated;

-- Transiciones: un pedido programado se acepta primero y se prepara después.
create or replace function public.order_transition_allowed(p_from public.order_status, p_to public.order_status)
returns boolean
language sql immutable
as $$
  select (p_from, p_to) in (
    ('awaiting_payment'::public.order_status, 'new'::public.order_status),
    ('awaiting_payment', 'cancelled'),
    ('new', 'accepted'),
    ('new', 'preparing'),
    ('new', 'rejected'),
    ('new', 'expired'),
    ('new', 'cancelled'),
    ('accepted', 'preparing'),
    ('accepted', 'cancelled'),
    ('preparing', 'ready'),
    ('preparing', 'cancelled'),
    ('ready', 'on_the_way'),
    ('ready', 'delivered'),
    ('ready', 'cancelled'),
    ('on_the_way', 'delivered')
  )
$$;

-- Atiende a esa hora según los horarios cargados (sin mirar el interruptor de abierto).
create or replace function public.within_business_hours(p_business_id uuid, p_at timestamptz)
returns boolean
language sql stable set search_path = public
as $$
  with local as (
    select (p_at at time zone (public.get_config('timezone') #>> '{}')) as ts
  )
  select exists (
    select 1 from public.business_hours h, local
    where h.business_id = p_business_id
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
$$;

-- Plazo para aceptar: 10 minutos si es "lo antes posible"; si es programado,
-- hasta la hora pedida menos la demora máxima del negocio.
create or replace function public.order_accept_deadline(p_business_id uuid, p_scheduled_for timestamptz)
returns timestamptz
language sql stable set search_path = public
as $$
  select case
    when p_scheduled_for is null
      then now() + make_interval(mins => (public.get_config('order_accept_minutes') #>> '{}')::int)
    else p_scheduled_for - make_interval(mins => coalesce(
      (select eta_max_minutes from public.delivery_settings where business_id = p_business_id), 45))
  end
$$;

-- Anticipación mínima para programar: demora del negocio más el plazo para aceptar.
create or replace function public.schedule_lead_minutes(p_business_id uuid)
returns integer
language sql stable set search_path = public
as $$
  select coalesce((select eta_max_minutes from public.delivery_settings where business_id = p_business_id), 45)
       + (public.get_config('order_accept_minutes') #>> '{}')::int
$$;

-- Horarios que se pueden elegir para programar, cada 15 minutos.
create or replace function public.get_schedule_slots(p_business_id uuid)
returns setof timestamptz
language sql stable security definer set search_path = public
as $$
  with params as (
    select
      public.get_config('timezone') #>> '{}' as tz,
      (public.get_config('schedule_max_days') #>> '{}')::int as max_days,
      now() + make_interval(mins => public.schedule_lead_minutes(p_business_id)) as earliest
  ),
  candidates as (
    select generate_series(
      date_bin('15 minutes', p.earliest, timestamptz '2000-01-01') + interval '15 minutes',
      (((now() at time zone p.tz)::date + p.max_days + 1)::timestamp at time zone p.tz) - interval '1 minute',
      interval '15 minutes'
    ) as slot
    from params p
  )
  select c.slot
  from candidates c, params p
  where exists (
      select 1 from public.businesses b
      where b.id = p_business_id and b.status = 'active' and b.accepts_scheduled
    )
    and c.slot >= p.earliest
    and public.within_business_hours(p_business_id, c.slot)
  order by c.slot
  limit 200
$$;

-- Crea el pedido con los precios de la base (no los del teléfono) y valida todo.
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

  insert into public.order_items (order_id, product_id, product_name, unit_price, quantity, note)
  select v_order_id, p.id, p.name, p.price, x.quantity, nullif(btrim(x.note), '')
  from jsonb_to_recordset(p_items) as x(product_id uuid, quantity integer, note text)
  join public.products p on p.id = x.product_id;

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (v_order_id, null, v_status, v_customer);

  return v_order_id;
end;
$$;

-- Al pasar a "Nuevo" (por ejemplo, cuando se acredita el pago) arranca el plazo para aceptar.
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
  if new.status = 'new' then
    new.accept_by := public.order_accept_deadline(new.business_id, new.scheduled_for);
  end if;

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
  elsif new.status = 'cancelled' and old.status in ('accepted', 'preparing', 'ready')
        and auth.uid() = (select owner_id from public.businesses where id = new.business_id) then
    update public.businesses
      set cancelled_by_seller_30d = cancelled_by_seller_30d + 1
      where id = new.business_id;
  end if;

  return new;
end;
$$;

-- Cambio de estado desde la app: el vendedor acepta y avanza su pedido; el cliente
-- solo cancela antes de que lo acepten o confirma la entrega.
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
    or (v_is_owner and p_status in ('accepted', 'preparing', 'ready', 'on_the_way', 'delivered', 'rejected', 'cancelled'))
    or (v_is_customer and (
          (p_status = 'cancelled' and v_order.status in ('awaiting_payment', 'new'))
          or (p_status = 'delivered' and v_order.status in ('ready', 'on_the_way'))
        ))
  ) then
    raise exception 'No tenés permiso para este cambio' using errcode = 'insufficient_privilege';
  end if;

  if v_order.status = 'new' and v_order.accept_by < now() and p_status in ('accepted', 'preparing') then
    raise exception 'Se pasó el plazo para aceptar este pedido' using errcode = 'check_violation';
  end if;

  update public.orders set status = p_status where id = p_order_id returning * into v_order;

  if p_reason is not null then
    update public.order_events set reason = left(p_reason, 200)
    where id = (select max(id) from public.order_events where order_id = p_order_id);
  end if;

  return v_order;
end;
$$;

-- Vence lo que nadie aceptó a tiempo, cancela lo que no se pagó y cierra lo entregado
-- hace rato. Lo corre pg_cron cada minuto; la app también lo llama al abrir los pedidos.
create or replace function public.expire_overdue_orders()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_total integer := 0;
  v_rows integer;
begin
  update public.orders set status = 'expired' where status = 'new' and accept_by < now();
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update public.orders set status = 'cancelled'
  where status = 'awaiting_payment'
    and created_at < now() - make_interval(mins => (public.get_config('awaiting_payment_minutes') #>> '{}')::int);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update public.orders set status = 'delivered'
  where status in ('ready', 'on_the_way')
    and status_changed_at < now() - make_interval(hours => (public.get_config('order_autoclose_hours') #>> '{}')::int);
  get diagnostics v_rows = row_count;
  return v_total + v_rows;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notificaciones push (Expo)
-- ---------------------------------------------------------------------------

create table if not exists public.push_tokens (
  token text primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);
create index if not exists push_tokens_profile_idx on public.push_tokens (profile_id);
alter table public.push_tokens enable row level security;

-- Cada teléfono registra su token; si otra cuenta entra en el mismo teléfono, el token pasa a esa cuenta.
create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void
language sql security definer set search_path = public
as $$
  insert into public.push_tokens (token, profile_id, platform)
  select p_token, auth.uid(), p_platform where auth.uid() is not null
  on conflict (token) do update set profile_id = excluded.profile_id, platform = excluded.platform, updated_at = now()
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language sql security definer set search_path = public
as $$
  delete from public.push_tokens where token = p_token and profile_id = auth.uid()
$$;

-- Manda el aviso con pg_net al servicio de Expo. Si pg_net no está, no hace nada.
create or replace function public.send_push(p_profile_id uuid, p_title text, p_body text, p_data jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_messages jsonb;
begin
  if to_regnamespace('net') is null then
    return;
  end if;
  select jsonb_agg(jsonb_build_object(
    'to', token, 'title', p_title, 'body', p_body, 'data', p_data,
    'sound', 'default', 'priority', 'high', 'channelId', 'pedidos'))
  into v_messages
  from public.push_tokens where profile_id = p_profile_id;
  if v_messages is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
  using 'https://exp.host/--/api/v2/push/send', v_messages, '{"Content-Type": "application/json"}'::jsonb;
exception when others then
  raise warning 'No se pudo mandar la notificación: %', sqlerrm;
end;
$$;

create or replace function public.notify_order_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_owner uuid;
  v_business text;
  v_tz text := public.get_config('timezone') #>> '{}';
  v_when text;
  v_data jsonb := jsonb_build_object('orderId', new.id);
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;
  select owner_id, name into v_owner, v_business from public.businesses where id = new.business_id;
  v_when := to_char(new.scheduled_for at time zone v_tz, 'HH24:MI');

  if new.status = 'new' then
    perform public.send_push(v_owner,
      case when new.scheduled_for is null then 'Pedido nuevo #' || new.number
           else 'Pedido programado #' || new.number || ' para las ' || v_when end,
      'Total $ ' || to_char(new.total, 'FM999G999G990') || '. Aceptalo antes de las '
        || to_char(new.accept_by at time zone v_tz, 'HH24:MI') || '.',
      v_data);
  elsif new.status = 'cancelled' and tg_op = 'UPDATE' and auth.uid() = new.customer_id then
    perform public.send_push(v_owner, 'Pedido #' || new.number || ' cancelado', 'El cliente canceló el pedido.', v_data);
  elsif new.status in ('accepted', 'preparing', 'ready', 'on_the_way', 'rejected', 'expired', 'cancelled') then
    perform public.send_push(new.customer_id, v_business,
      case new.status
        when 'accepted' then 'Aceptó tu pedido' || coalesce(' para las ' || v_when, '') || '.'
        when 'preparing' then 'Está preparando tu pedido.'
        when 'ready' then case when new.type = 'pickup' then 'Tu pedido está listo para retirar.' else 'Tu pedido está listo.' end
        when 'on_the_way' then 'Tu pedido está en camino.'
        when 'rejected' then 'No pudo tomar tu pedido. Te devolvemos el dinero.'
        when 'expired' then 'No respondió a tiempo. Cancelamos el pedido y te devolvemos el dinero.'
        else 'Canceló tu pedido. Te devolvemos el dinero.'
      end,
      v_data);
  end if;
  return null;
end;
$$;

drop trigger if exists orders_notify on public.orders;
create trigger orders_notify after insert or update of status on public.orders
  for each row execute function public.notify_order_change();

-- ---------------------------------------------------------------------------
-- Tareas programadas (pg_cron) y envío de avisos (pg_net), si están disponibles
-- ---------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net no disponible: no se mandan notificaciones (%).', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('vencer-pedidos', '* * * * *', 'select public.expire_overdue_orders()');
  perform cron.schedule('puntajes-noche', '0 7 * * *', 'select public.refresh_all_scores()');
exception when others then
  raise notice 'pg_cron no disponible: los pedidos vencen cuando se abre la app (%).', sqlerrm;
end $$;

-- Permisos
revoke execute on function public.send_push(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_order_change() from public, anon, authenticated;
grant execute on function public.create_order(uuid, jsonb, public.order_type, public.payment_method, timestamptz, text,
  double precision, double precision, text, text) to authenticated;
grant execute on function public.get_schedule_slots(uuid) to anon, authenticated;
grant execute on function public.expire_overdue_orders() to authenticated;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
revoke execute on function public.create_order(uuid, jsonb, public.order_type, public.payment_method, timestamptz, text,
  double precision, double precision, text, text) from public, anon;

-- Nombre visible del cliente para el vendedor (sin teléfono ni email).
grant select on public.public_profiles to authenticated;
