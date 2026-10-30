-- Semana 2: alta del negocio, horarios y publicación.

create or replace function public.slugify(p_text text)
returns text
language sql immutable set search_path = public
as $$ select trim(both '-' from regexp_replace(lower(public.f_unaccent(p_text)), '[^a-z0-9]+', '-', 'g')) $$;

-- Reemplaza todos los horarios del negocio. p_hours: [{"weekday":1,"opens_at":"19:00","closes_at":"01:00"}, ...]
create or replace function public.set_business_hours(p_business_id uuid, p_hours jsonb)
returns void
language plpgsql set search_path = public
as $$
begin
  if not public.owns_business(p_business_id) then
    raise exception 'Negocio inexistente o ajeno' using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_hours, '[]')) h
    where (h ->> 'opens_at')::time = (h ->> 'closes_at')::time
  ) then
    raise exception 'El horario de apertura y cierre no puede ser el mismo' using errcode = 'check_violation';
  end if;

  delete from public.business_hours where business_id = p_business_id;
  insert into public.business_hours (business_id, weekday, opens_at, closes_at)
  select p_business_id, (h ->> 'weekday')::smallint, (h ->> 'opens_at')::time, (h ->> 'closes_at')::time
  from jsonb_array_elements(coalesce(p_hours, '[]')) h;
end;
$$;

-- Guarda (o crea) la configuración de retiro y delivery. p_delivery usa los nombres de columna.
create or replace function public.set_delivery_settings(p_business_id uuid, p_delivery jsonb)
returns void
language plpgsql set search_path = public
as $$
begin
  if not public.owns_business(p_business_id) then
    raise exception 'Negocio inexistente o ajeno' using errcode = 'insufficient_privilege';
  end if;
  insert into public.delivery_settings as d (
    business_id, offers_delivery, offers_pickup, fee_mode, fee, free_over, radius_km, eta_min_minutes, eta_max_minutes
  ) values (
    p_business_id,
    coalesce((p_delivery ->> 'offers_delivery')::boolean, false),
    coalesce((p_delivery ->> 'offers_pickup')::boolean, true),
    coalesce((p_delivery ->> 'fee_mode')::public.delivery_fee_mode, 'fixed'),
    coalesce((p_delivery ->> 'fee')::numeric, 0),
    (p_delivery ->> 'free_over')::numeric,
    coalesce((p_delivery ->> 'radius_km')::numeric, 3),
    coalesce((p_delivery ->> 'eta_min_minutes')::integer, 20),
    coalesce((p_delivery ->> 'eta_max_minutes')::integer, 45)
  )
  on conflict (business_id) do update set
    offers_delivery = excluded.offers_delivery,
    offers_pickup = excluded.offers_pickup,
    fee_mode = excluded.fee_mode,
    fee = excluded.fee,
    free_over = excluded.free_over,
    radius_km = excluded.radius_km,
    eta_min_minutes = excluded.eta_min_minutes,
    eta_max_minutes = excluded.eta_max_minutes;
end;
$$;

-- Alta completa en una sola transacción: si el CUIT/DNI o el teléfono ya existen, no queda nada a medias.
-- El negocio nace en borrador; se publica cuando tiene al menos un producto.
create or replace function public.create_business(
  p_name text,
  p_type public.business_type,
  p_phone text,
  p_tax_id text,
  p_description text default '',
  p_ingredients text default '',
  p_whatsapp text default null,
  p_address text default '',
  p_lat double precision default null,
  p_lng double precision default null,
  p_accepts_cash boolean default false,
  p_hours jsonb default '[]',
  p_delivery jsonb default '{}'
)
returns uuid
language plpgsql set search_path = public
as $$
declare
  v_id uuid;
  v_base text := coalesce(nullif(public.slugify(p_name), ''), 'negocio');
  v_slug text := v_base;
  v_constraint text;
begin
  if auth.uid() is null then
    raise exception 'Tenés que ingresar para crear un negocio' using errcode = 'insufficient_privilege';
  end if;

  for attempt in 1..5 loop
    begin
      insert into public.businesses (
        owner_id, name, slug, type, phone, whatsapp, description, ingredients, address, lat, lng, accepts_cash
      ) values (
        auth.uid(), trim(p_name), v_slug, p_type, p_phone, nullif(p_whatsapp, ''), coalesce(p_description, ''),
        coalesce(p_ingredients, ''), coalesce(p_address, ''), p_lat, p_lng, coalesce(p_accepts_cash, false)
      )
      returning id into v_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      case v_constraint
        when 'businesses_slug_key' then
          v_slug := v_base || '-' || substr(md5(random()::text), 1, 4);
        when 'businesses_owner_id_key' then
          raise exception 'Ya tenés un negocio' using errcode = 'unique_violation', hint = 'owner';
        when 'businesses_phone_key' then
          raise exception 'Ese teléfono ya está en otro negocio' using errcode = 'unique_violation', hint = 'phone';
        else
          raise;
      end case;
    end;
  end loop;

  if v_id is null then
    raise exception 'No pudimos crear el negocio, probá con otro nombre' using errcode = 'unique_violation';
  end if;

  perform public.set_business_tax_id(v_id, p_tax_id);
  perform public.set_business_hours(v_id, p_hours);
  perform public.set_delivery_settings(v_id, p_delivery);
  return v_id;
end;
$$;

-- Para publicar (borrador → activo) hace falta al menos un producto activo.
create or replace function public.check_business_publish()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if public.is_client_write() and old.status = 'draft' and new.status = 'active'
     and not exists (select 1 from public.products where business_id = new.id and status = 'active') then
    raise exception 'Cargá al menos un producto antes de publicar' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger businesses_publish before update of status on public.businesses
  for each row execute function public.check_business_publish();

grant execute on function public.create_business(text, public.business_type, text, text, text, text, text, text,
  double precision, double precision, boolean, jsonb, jsonb) to authenticated;
grant execute on function public.set_business_hours(uuid, jsonb) to authenticated;
grant execute on function public.set_delivery_settings(uuid, jsonb) to authenticated;
