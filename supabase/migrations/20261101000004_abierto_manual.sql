-- El interruptor "Abierto" manda, como la puerta de un local: si el vendedor lo prende,
-- está abierto aunque sea fuera de su horario habitual (un feriado, un día libre).
-- Los horarios cargados quedan como referencia para el cliente y para los pedidos programados.
create or replace function public.is_business_open(p_business_id uuid, p_at timestamptz default now())
returns boolean
language sql stable set search_path = public
as $$
  select coalesce((select b.is_open_now from public.businesses b where b.id = p_business_id), false)
$$;
