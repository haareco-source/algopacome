-- Semana 5: cobros reales con Mercado Pago.
-- El vendedor vincula su cuenta (OAuth) y cobra directo; Mercado Pago le pasa la comisión
-- a NOA Digital en el mismo cobro (marketplace_fee). La confirmación llega por webhook a la
-- Edge Function "mercadopago", nunca desde el celular. Los tokens de Mercado Pago no salen
-- nunca hacia la app: las funciones marcadas "solo servidor" las llama únicamente la Edge Function.

insert into public.config (key, value, description) values
  ('functions_url', 'null', 'URL base de las Edge Functions: https://<proyecto>.supabase.co/functions/v1'),
  ('plus_price_ars', '1500', 'Precio mensual del plan Plus en pesos (el equivalente de plus_price_usd)')
on conflict (key) do nothing;

update public.config
set description = 'true = pago simulado: el pedido con Mercado Pago entra como pagado. En false cobra de verdad.'
where key = 'payments_test_mode';

-- ---------------------------------------------------------------------------
-- Negocio: cobra con Mercado Pago solo si vinculó su cuenta
-- ---------------------------------------------------------------------------

alter table public.businesses add column if not exists accepts_mercadopago boolean not null default false;
grant select (accepts_mercadopago) on public.businesses to anon, authenticated;

create or replace function public.protect_business_payments()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_client_write() then
    new.accepts_mercadopago := case when tg_op = 'INSERT' then false else old.accepts_mercadopago end;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_protect_payments on public.businesses;
create trigger businesses_protect_payments before insert or update on public.businesses
  for each row execute function public.protect_business_payments();

-- ---------------------------------------------------------------------------
-- Productos ocultos por el plan: el dueño los puede volver a mostrar (dentro de su límite)
-- ---------------------------------------------------------------------------

alter table public.products add column if not exists hidden_by_plan boolean not null default false;

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
      new.hidden_by_plan := false;
    else
      new.likes := old.likes;
      new.dislikes := old.dislikes;
      new.score := old.score;
      new.image_hash := old.image_hash;
      new.business_id := old.business_id;
      new.hidden_by_plan := old.hidden_by_plan;
      -- Un producto ocultado por moderación no lo puede reactivar el dueño.
      if old.status = 'hidden' and new.status = 'active' and not old.hidden_by_plan then
        raise exception 'Este producto fue ocultado por moderación' using errcode = 'check_violation';
      end if;
      -- Si el dueño lo oculta, lo puede volver a mostrar cuando quiera.
      if old.status = 'active' and new.status = 'hidden' then
        new.hidden_by_plan := true;
      end if;
    end if;
  end if;
  if new.status = 'active' then
    new.hidden_by_plan := false;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pagos: reembolsos y deuda de efectivo
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_attempts integer not null default 0,
  add column if not exists refund_error text;

create unique index if not exists payments_preference_idx on public.payments (mp_preference_id);

create table if not exists public.cash_debt_payments (
  mp_payment_id text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  amount numeric(12, 2) not null,
  created_at timestamptz not null default now()
);

-- Estados de vinculación (OAuth): un código de un solo uso que vence a los 15 minutos.
create table if not exists public.mp_link_states (
  state text primary key,
  business_id uuid not null references public.businesses (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.cash_debt_payments enable row level security;
alter table public.mp_link_states enable row level security;
revoke all on public.cash_debt_payments, public.mp_link_states, public.seller_accounts from anon, authenticated;

-- Con qué puede pagar el cliente en este negocio.
create or replace function public.get_payment_options(p_business_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'simulated', (public.get_config('payments_test_mode') #>> '{}')::boolean,
    'mercadopago', b.accepts_mercadopago or (public.get_config('payments_test_mode') #>> '{}')::boolean,
    'cash', b.accepts_cash and b.cash_commission_debt < (public.get_config('cash_debt_limit_ars') #>> '{}')::numeric
  )
  from public.businesses b
  where b.id = p_business_id
$$;

-- Controles de cobro al crear el pedido (se suman a los de create_order).
create or replace function public.check_order_payment()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  b public.businesses;
begin
  select * into b from public.businesses where id = new.business_id;
  if new.payment_method = 'mercadopago'
     and not b.accepts_mercadopago
     and not (public.get_config('payments_test_mode') #>> '{}')::boolean then
    raise exception 'Este negocio todavía no cobra con Mercado Pago' using errcode = 'check_violation';
  end if;
  if new.payment_method = 'cash'
     and b.cash_commission_debt >= (public.get_config('cash_debt_limit_ars') #>> '{}')::numeric then
    raise exception 'Este negocio no está tomando pagos en efectivo por ahora' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_check_payment on public.orders;
create trigger orders_check_payment before insert on public.orders
  for each row execute function public.check_order_payment();

-- Si un pedido pagado se rechaza, vence o se cancela, se pide el reembolso.
create or replace function public.request_refund_on_cancel()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status in ('rejected', 'expired', 'cancelled') and old.status is distinct from new.status then
    update public.payments
    set refund_requested_at = now(), updated_at = now()
    where order_id = new.id and status = 'approved' and refund_requested_at is null;
  end if;
  return null;
end;
$$;

drop trigger if exists orders_request_refund on public.orders;
create trigger orders_request_refund after update of status on public.orders
  for each row execute function public.request_refund_on_cancel();

-- ---------------------------------------------------------------------------
-- Vinculación de la cuenta de Mercado Pago del vendedor
-- ---------------------------------------------------------------------------

-- Desde la app: el dueño pide un código para abrir la pantalla de Mercado Pago.
create or replace function public.start_mp_link()
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_business uuid;
  v_state text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select id into v_business from public.businesses where owner_id = auth.uid();
  if v_business is null then
    raise exception 'Primero tenés que dar de alta tu negocio' using errcode = 'insufficient_privilege';
  end if;
  delete from public.mp_link_states where created_at < now() - interval '15 minutes' or business_id = v_business;
  insert into public.mp_link_states (state, business_id) values (v_state, v_business);
  return v_state;
end;
$$;

-- Solo servidor: guarda los tokens (ya cifrados) y habilita el cobro con Mercado Pago.
create or replace function public.mp_link_seller(
  p_state text,
  p_mp_user_id text,
  p_access_token text,
  p_refresh_token text,
  p_expires_in integer
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_business uuid;
begin
  delete from public.mp_link_states
  where state = p_state and created_at > now() - interval '15 minutes'
  returning business_id into v_business;
  if v_business is null then
    raise exception 'El enlace venció. Volvé a intentar desde la app.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.seller_accounts where mp_user_id = p_mp_user_id and business_id <> v_business) then
    raise exception 'Esa cuenta de Mercado Pago ya está vinculada a otro negocio' using errcode = 'unique_violation';
  end if;

  insert into public.seller_accounts (business_id, mp_user_id, access_token_encrypted, refresh_token_encrypted,
    token_expires_at, linked_at)
  values (v_business, p_mp_user_id, p_access_token, p_refresh_token, now() + make_interval(secs => p_expires_in), now())
  on conflict (business_id) do update
    set mp_user_id = excluded.mp_user_id,
        access_token_encrypted = excluded.access_token_encrypted,
        refresh_token_encrypted = excluded.refresh_token_encrypted,
        token_expires_at = excluded.token_expires_at,
        linked_at = excluded.linked_at;

  update public.businesses set accepts_mercadopago = true where id = v_business;
  return v_business;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cobro de pedidos
-- ---------------------------------------------------------------------------

-- Solo servidor: datos para armar el cobro de un pedido que espera el pago.
create or replace function public.mp_order_for_checkout(p_order_id uuid, p_customer_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  o public.orders;
  v_result jsonb;
begin
  select * into o from public.orders where id = p_order_id and customer_id = p_customer_id;
  if not found then
    raise exception 'Pedido inexistente' using errcode = 'no_data_found';
  end if;
  if o.status <> 'awaiting_payment' or o.payment_method <> 'mercadopago' then
    raise exception 'Este pedido no espera un pago' using errcode = 'check_violation';
  end if;

  select jsonb_build_object(
    'id', o.id,
    'number', o.number,
    'total', o.total,
    'commission', o.commission_amount,
    'business_name', b.name,
    'access_token', s.access_token_encrypted,
    'items', (
      select jsonb_agg(jsonb_build_object('title', i.product_name, 'quantity', i.quantity, 'unit_price', i.unit_price))
      from public.order_items i where i.order_id = o.id
    )
  ) into v_result
  from public.businesses b
  join public.seller_accounts s on s.business_id = b.id
  where b.id = o.business_id;

  if v_result is null then
    raise exception 'Este negocio todavía no cobra con Mercado Pago' using errcode = 'check_violation';
  end if;
  return v_result;
end;
$$;

-- Solo servidor: registra lo que informa Mercado Pago sobre el pago de un pedido.
-- Devuelve qué se hizo, para el registro de la Edge Function.
create or replace function public.mp_record_payment(
  p_order_id uuid,
  p_mp_payment_id text,
  p_status text,
  p_amount numeric,
  p_fee numeric,
  p_collector_id text,
  p_raw jsonb
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  o public.orders;
  v_status public.payment_status;
  v_payment uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    return 'pedido inexistente';
  end if;
  if not exists (select 1 from public.seller_accounts where business_id = o.business_id and mp_user_id = p_collector_id) then
    return 'el cobro no es de la cuenta del negocio';
  end if;

  v_status := case p_status
    when 'approved' then 'approved'
    when 'rejected' then 'rejected'
    when 'cancelled' then 'cancelled'
    when 'refunded' then 'refunded'
    when 'charged_back' then 'refunded'
    else 'pending'
  end;

  select id into v_payment from public.payments where mp_payment_id = p_mp_payment_id;
  if v_payment is null then
    select id into v_payment from public.payments
    where order_id = o.id and mp_payment_id is null
    order by created_at desc limit 1;
  end if;
  if v_payment is null then
    insert into public.payments (order_id, amount) values (o.id, p_amount) returning id into v_payment;
  end if;

  update public.payments
  set mp_payment_id = p_mp_payment_id,
      status = v_status,
      amount = p_amount,
      marketplace_fee = coalesce(p_fee, 0),
      raw_webhook = p_raw,
      refunded_at = case when v_status = 'refunded' then coalesce(refunded_at, now()) else refunded_at end,
      updated_at = now()
  where id = v_payment;

  if v_status <> 'approved' then
    return 'pago ' || v_status;
  end if;

  -- Pagado: el pedido pasa a "Nuevo". Si ya no corresponde (vencido, cancelado, otro pago,
  -- monto distinto), se devuelve.
  if o.status = 'awaiting_payment' and p_amount >= o.total
     and not exists (select 1 from public.payments
                     where order_id = o.id and status = 'approved' and id <> v_payment and refund_requested_at is null) then
    update public.orders set status = 'new' where id = o.id;
    return 'pedido confirmado';
  end if;
  if o.status in ('new', 'accepted', 'preparing', 'ready', 'on_the_way', 'delivered')
     and not exists (select 1 from public.payments
                     where order_id = o.id and status = 'approved' and id <> v_payment and refund_requested_at is null) then
    return 'ya estaba confirmado';
  end if;
  update public.payments set refund_requested_at = coalesce(refund_requested_at, now()) where id = v_payment;
  return 'se devuelve';
end;
$$;

-- Solo servidor: reembolsos pendientes, con el token del vendedor que cobró.
create or replace function public.mp_refunds_due()
returns table (payment_id uuid, mp_payment_id text, access_token text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.mp_payment_id, s.access_token_encrypted
  from public.payments p
  join public.orders o on o.id = p.order_id
  join public.seller_accounts s on s.business_id = o.business_id
  where p.status = 'approved' and p.refund_requested_at is not null and p.refunded_at is null
    and p.mp_payment_id is not null and p.refund_attempts < 10
  order by p.refund_requested_at
  limit 20
$$;

create or replace function public.mp_mark_refund(p_payment_id uuid, p_ok boolean, p_error text default null)
returns void
language sql security definer set search_path = public
as $$
  update public.payments
  set status = case when p_ok then 'refunded'::public.payment_status else status end,
      refunded_at = case when p_ok then now() else refunded_at end,
      refund_attempts = refund_attempts + case when p_ok then 0 else 1 end,
      refund_error = case when p_ok then null else left(p_error, 500) end,
      updated_at = now()
  where id = p_payment_id
$$;

-- ---------------------------------------------------------------------------
-- Plan Plus (suscripción mensual a la cuenta de NOA Digital)
-- ---------------------------------------------------------------------------

alter table public.subscriptions add column if not exists updated_at timestamptz not null default now();

-- Solo servidor: guarda el estado de la suscripción y ajusta el plan del negocio.
-- Al volver al plan gratis se ocultan (no se borran) los productos que sobran.
create or replace function public.mp_record_subscription(
  p_business_id uuid,
  p_preapproval_id text,
  p_status text,
  p_next_charge timestamptz default null
)
returns public.business_plan
language plpgsql security definer set search_path = public
as $$
declare
  v_plan public.business_plan;
  v_old public.business_plan;
begin
  insert into public.subscriptions (business_id, mp_preapproval_id, status, next_charge_at)
  values (p_business_id, p_preapproval_id,
          case when p_status in ('pending', 'authorized', 'paused', 'cancelled')
               then p_status::public.subscription_status else 'pending' end,
          p_next_charge)
  on conflict (mp_preapproval_id) do update
    set status = excluded.status, next_charge_at = coalesce(excluded.next_charge_at, subscriptions.next_charge_at),
        updated_at = now();

  select plan into v_old from public.businesses where id = p_business_id for update;
  v_plan := case when exists (select 1 from public.subscriptions where business_id = p_business_id and status = 'authorized')
                 then 'plus' else 'free' end;
  update public.businesses set plan = v_plan where id = p_business_id;

  if v_old = 'plus' and v_plan = 'free' then
    update public.products set status = 'hidden', hidden_by_plan = true
    where id in (
      select id from public.products
      where business_id = p_business_id and status = 'active'
      order by score desc, created_at
      offset (public.get_config('free_product_limit') #>> '{}')::int
    );
  end if;
  return v_plan;
end;
$$;

-- Solo servidor: un pago de la deuda de comisiones en efectivo (se aplica una sola vez).
create or replace function public.mp_record_debt_payment(p_business_id uuid, p_mp_payment_id text, p_amount numeric)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.cash_debt_payments (mp_payment_id, business_id, amount)
  values (p_mp_payment_id, p_business_id, p_amount)
  on conflict do nothing;
  if not found then
    return false;
  end if;
  update public.businesses
  set cash_commission_debt = greatest(0, cash_commission_debt - p_amount)
  where id = p_business_id;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Resumen para el vendedor y para facturar
-- ---------------------------------------------------------------------------

create or replace function public.get_my_billing()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  b public.businesses;
  v_tz text := public.get_config('timezone') #>> '{}';
  v_month_start timestamptz := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_free_limit integer := (public.get_config('free_orders_threshold') #>> '{}')::int;
  v_standard_from timestamptz := (public.get_config('commission_standard_from') #>> '{}')::timestamptz;
begin
  select * into b from public.businesses where owner_id = auth.uid();
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'plan', b.plan,
    'product_limit', (public.get_config(case when b.plan = 'plus' then 'plus_product_limit' else 'free_product_limit' end) #>> '{}')::int,
    'plus_product_limit', (public.get_config('plus_product_limit') #>> '{}')::int,
    'plus_price_ars', (public.get_config('plus_price_ars') #>> '{}')::numeric,
    'subscription_status', (select status from public.subscriptions where business_id = b.id
                            order by (status = 'authorized') desc, created_at desc limit 1),
    'next_charge_at', (select next_charge_at from public.subscriptions where business_id = b.id and status = 'authorized'
                       order by created_at desc limit 1),
    'accepts_mercadopago', b.accepts_mercadopago,
    'payments_simulated', (public.get_config('payments_test_mode') #>> '{}')::boolean,
    'free_orders_left', greatest(0, v_free_limit - b.completed_orders),
    'commission_pct', case
      when b.completed_orders < v_free_limit then 0
      when v_standard_from is not null and now() >= v_standard_from
        then (public.get_config('commission_standard_pct') #>> '{}')::numeric
      else (public.get_config('commission_launch_pct') #>> '{}')::numeric
    end,
    'next_commission_pct', case
      when v_standard_from is not null and now() >= v_standard_from
        then (public.get_config('commission_standard_pct') #>> '{}')::numeric
      else (public.get_config('commission_launch_pct') #>> '{}')::numeric
    end,
    'month_orders', (select count(*) from public.orders
                     where business_id = b.id and status = 'delivered' and delivered_at >= v_month_start),
    'month_sales', (select coalesce(sum(subtotal), 0) from public.orders
                    where business_id = b.id and status = 'delivered' and delivered_at >= v_month_start),
    'month_commission', (select coalesce(sum(commission_amount), 0) from public.orders
                         where business_id = b.id and status = 'delivered' and delivered_at >= v_month_start),
    'accepts_cash', b.accepts_cash,
    'cash_debt', b.cash_commission_debt,
    'cash_debt_limit', (public.get_config('cash_debt_limit_ars') #>> '{}')::numeric
  );
end;
$$;

-- Para facturar (lo corre Ariel en el SQL Editor): comisiones y Plus de un mes por negocio.
-- Ejemplo: select * from public.commission_report('2026-11-01');
create or replace function public.commission_report(p_month date)
returns table (
  business_id uuid,
  business_name text,
  delivered_orders bigint,
  sales numeric,
  commission_mercadopago numeric,
  commission_cash numeric,
  plus boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_tz text := public.get_config('timezone') #>> '{}';
  v_from timestamptz := date_trunc('month', p_month::timestamp) at time zone v_tz;
  v_to timestamptz := (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone v_tz;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Solo para administración' using errcode = 'insufficient_privilege';
  end if;
  return query
  select b.id, b.name,
    count(o.id),
    coalesce(sum(o.subtotal), 0),
    coalesce(sum(o.commission_amount) filter (where o.payment_method = 'mercadopago'), 0),
    coalesce(sum(o.commission_amount) filter (where o.payment_method = 'cash'), 0),
    b.plan = 'plus'
  from public.businesses b
  left join public.orders o on o.business_id = b.id and o.status = 'delivered'
    and o.delivered_at >= v_from and o.delivered_at < v_to
    and not exists (select 1 from public.payments p where p.order_id = o.id and p.status = 'refunded')
  group by b.id
  having count(o.id) > 0 or b.plan = 'plus'
  order by b.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos y tarea programada
-- ---------------------------------------------------------------------------

revoke execute on function public.mp_link_seller(text, text, text, text, integer) from public, anon, authenticated;
revoke execute on function public.mp_order_for_checkout(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mp_record_payment(uuid, text, text, numeric, numeric, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.mp_refunds_due() from public, anon, authenticated;
revoke execute on function public.mp_mark_refund(uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.mp_record_subscription(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.mp_record_debt_payment(uuid, text, numeric) from public, anon, authenticated;
revoke execute on function public.commission_report(date) from public, anon;
grant execute on function public.mp_link_seller(text, text, text, text, integer) to service_role;
grant execute on function public.mp_order_for_checkout(uuid, uuid) to service_role;
grant execute on function public.mp_record_payment(uuid, text, text, numeric, numeric, text, jsonb) to service_role;
grant execute on function public.mp_refunds_due() to service_role;
grant execute on function public.mp_mark_refund(uuid, boolean, text) to service_role;
grant execute on function public.mp_record_subscription(uuid, text, text, timestamptz) to service_role;
grant execute on function public.mp_record_debt_payment(uuid, text, numeric) to service_role;
grant execute on function public.get_payment_options(uuid) to anon, authenticated;
grant execute on function public.start_mp_link() to authenticated;
grant execute on function public.get_my_billing() to authenticated;
grant execute on function public.commission_report(date) to authenticated;

-- Cada 5 minutos: reembolsos pendientes y renovación de tokens (si está configurada la URL).
create or replace function public.run_mercadopago_tasks()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text := public.get_config('functions_url') #>> '{}';
begin
  if v_url is null then
    return;
  end if;
  perform net.http_post(url := v_url || '/mercadopago/procesar', body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb);
exception when others then
  raise notice 'No se pudieron procesar las tareas de Mercado Pago: %', sqlerrm;
end;
$$;

revoke execute on function public.run_mercadopago_tasks() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('mercadopago', '*/5 * * * *', 'select public.run_mercadopago_tasks()');
exception when others then
  raise notice 'pg_cron no disponible: los reembolsos se procesan al llegar cada aviso (%).', sqlerrm;
end $$;
