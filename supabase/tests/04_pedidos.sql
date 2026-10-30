-- Pruebas de pedidos (semana 4). Corre después de 03_busqueda.sql.
-- "Lo de Coco" atiende todos los días de 00:00 a 23:59 y hace delivery a $500.

grant insert on test.ids to authenticated;
insert into test.ids select 'coco', id from public.businesses where slug = 'lo-de-coco';
insert into test.ids select 'milanesa', id from public.products where name = 'Sándwich de milanesa';
insert into test.ids select 'producto_ajeno', id from public.products where business_id = test.id('pancho_negocio') limit 1;
-- Para que la prueba no dependa de la hora: se puede programar hasta mañana.
update public.config set value = '1' where key = 'schedule_max_days';
update public.delivery_settings set eta_max_minutes = 30 where business_id = test.id('coco');

-- ---------------------------------------------------------------- pedido "lo antes posible"
select test.login('cliente');
set role authenticated;

insert into test.ids
select 'ya', public.create_order(
  test.id('coco'),
  jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 2, 'note', 'sin tomate')),
  'delivery', 'mercadopago',
  p_delivery_address => 'San Martín 123', p_contact_phone => '3886111111');

do $$
declare o public.orders;
begin
  select * into o from public.orders where id = test.id('ya');
  assert o.status = 'new', 'en modo de prueba, Mercado Pago entra como pagado';
  assert o.subtotal = 2 * (select price from public.products where id = test.id('milanesa')), 'precio de la base';
  assert o.delivery_fee = 500 and o.total = o.subtotal + 500, 'suma el envío';
  assert o.is_free_order and o.commission_pct = 0, 'entre los primeros 10 pedidos no hay comisión';
  assert o.accept_by between now() + interval '9 minutes' and now() + interval '11 minutes', '10 minutos para aceptar';
  assert (select note from public.order_items where order_id = o.id) = 'sin tomate', 'guarda la aclaración';
  assert (select count(*) from public.order_events where order_id = o.id) = 1, 'registra la creación';
end $$;

-- Validaciones
do $$ begin
  perform public.create_order(test.id('coco'), '[]', 'pickup', 'mercadopago');
  raise exception 'FALLA: aceptó un carrito vacío';
exception when check_violation then null;
end $$;
do $$ begin
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('producto_ajeno'), 'quantity', 1)), 'pickup', 'mercadopago');
  raise exception 'FALLA: aceptó un producto de otro negocio';
exception when check_violation then null;
end $$;
do $$ begin
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'delivery', 'mercadopago');
  raise exception 'FALLA: delivery sin dirección';
exception when check_violation then null;
end $$;
do $$ begin
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'cash');
  raise exception 'FALLA: efectivo en un negocio que no lo acepta';
exception when check_violation then null;
end $$;
do $$ begin
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago',
    p_scheduled_for => now() + interval '3 hours');
  raise exception 'FALLA: programó en un negocio que no toma programados';
exception when check_violation then null;
end $$;

-- El vendedor no se pide a sí mismo
select test.login('vendedor');
do $$ begin
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago');
  raise exception 'FALLA: el dueño se hizo un pedido';
exception when check_violation then null;
end $$;

-- El vendedor acepta y avanza el pedido
select public.set_order_status(test.id('ya'), 'preparing');
do $$ begin
  assert (select status from public.orders where id = test.id('ya')) = 'preparing', 'aceptado y en preparación';
end $$;

-- ---------------------------------------------------------------- pedidos programados
update public.businesses set accepts_scheduled = true, scheduled_daily_limit = 2 where id = test.id('coco');
reset role;
do $$ begin
  assert (select count(*) from public.get_schedule_slots(test.id('coco'))) > 0, 'ofrece horarios';
  assert (select min(s) from public.get_schedule_slots(test.id('coco')) s) >= now() + interval '40 minutes',
    'respeta la anticipación (demora + plazo para aceptar)';
end $$;

select test.login('cliente');
set role authenticated;
do $$ begin
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago',
    p_scheduled_for => now() + interval '15 minutes');
  raise exception 'FALLA: programó sin anticipación';
exception when check_violation then null;
end $$;
do $$ begin
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago',
    p_scheduled_for => now() + interval '3 days');
  raise exception 'FALLA: programó para otro día';
exception when check_violation then null;
end $$;

insert into test.ids
select 'prog', public.create_order(test.id('coco'),
  jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 12)), 'pickup', 'mercadopago',
  p_scheduled_for => (select min(s) from public.get_schedule_slots(test.id('coco')) s));
insert into test.ids
select 'prog2', public.create_order(test.id('coco'),
  jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago',
  p_scheduled_for => (select min(s) from public.get_schedule_slots(test.id('coco')) s));

do $$
declare o public.orders;
begin
  select * into o from public.orders where id = test.id('prog');
  assert o.accept_by = o.scheduled_for - interval '30 minutes', 'se acepta hasta la hora menos la demora';
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago',
    p_scheduled_for => o.scheduled_for);
  raise exception 'FALLA: superó el tope de programados del día';
exception when check_violation then null;
end $$;

-- El cliente no puede aceptar su propio pedido; sí cancelarlo mientras nadie lo aceptó
do $$ begin
  perform public.set_order_status(test.id('prog'), 'accepted');
  raise exception 'FALLA: el cliente aceptó el pedido';
exception when insufficient_privilege then null;
end $$;
select public.set_order_status(test.id('prog2'), 'cancelled');

-- El vendedor lo acepta a la mañana y lo prepara más tarde
select test.login('vendedor');
select public.set_order_status(test.id('prog'), 'accepted');
select test.login('cliente');
do $$ begin
  perform public.set_order_status(test.id('prog'), 'cancelled');
  raise exception 'FALLA: el cliente canceló un pedido ya aceptado';
exception when insufficient_privilege then null;
end $$;
select test.login('vendedor');
select public.set_order_status(test.id('prog'), 'preparing');
do $$ begin
  assert (select status from public.orders where id = test.id('prog')) = 'preparing', 'aceptado → preparando';
end $$;

-- ---------------------------------------------------------------- vencimientos
reset role;
-- Un pedido nuevo cuyo plazo ya pasó
insert into public.orders (customer_id, business_id, type, subtotal, total, payment_method, status, accept_by)
values (test.id('cliente'), test.id('coco'), 'pickup', 100, 100, 'mercadopago', 'new', now() - interval '1 minute');
insert into test.ids select 'tarde', id from public.orders where accept_by < now() and status = 'new';

select test.login('vendedor');
set role authenticated;
do $$ begin
  perform public.set_order_status(test.id('tarde'), 'accepted');
  raise exception 'FALLA: aceptó fuera de plazo';
exception when check_violation then null;
end $$;
do $$ begin
  assert public.expire_overdue_orders() >= 1, 'vence lo que nadie aceptó';
  assert (select status from public.orders where id = test.id('tarde')) = 'expired', 'queda vencido';
end $$;

-- ---------------------------------------------------------------- avisos
do $$ begin
  perform public.send_push(test.id('vendedor'), 'x', 'y', '{}');
  raise exception 'FALLA: la app pudo mandar notificaciones';
exception when insufficient_privilege then null;
end $$;
select public.register_push_token('ExponentPushToken[abc]', 'android');
reset role;
do $$ begin
  assert (select profile_id from public.push_tokens where token = 'ExponentPushToken[abc]') = test.id('vendedor'), 'guarda el token';
end $$;
select test.login('cliente');
set role authenticated;
select public.register_push_token('ExponentPushToken[abc]', 'android');
do $$ begin
  assert (select count(*) from public.push_tokens) = 0, 'la tabla de tokens no se lee desde la app';
end $$;
reset role;
do $$ begin
  assert (select profile_id from public.push_tokens where token = 'ExponentPushToken[abc]') = test.id('cliente'),
    'el token pasa a la cuenta que entró en ese teléfono';
end $$;

update public.config set value = '0' where key = 'schedule_max_days';

-- ---------------------------------------------------------------- unidad de venta
select test.login('vendedor');
set role authenticated;
update public.products set sale_unit = 'docena' where id = test.id('milanesa');
select test.login('cliente');
insert into test.ids
select 'docena', public.create_order(test.id('coco'),
  jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago');
do $$ begin
  assert (select sale_unit from public.order_items where order_id = test.id('docena')) = 'docena', 'el pedido guarda la unidad';
  assert (select sale_unit from public.search_products('milanesa') limit 1) = 'docena', 'la búsqueda devuelve la unidad';
end $$;
reset role;

-- ---------------------------------------------------------------- abierto fuera de horario
-- Sin horario para hoy, pero con el interruptor prendido: está abierto.
delete from public.business_hours where business_id = test.id('coco');
do $$ begin
  assert public.is_business_open(test.id('coco')), 'el interruptor manda sobre el horario';
end $$;
update public.businesses set is_open_now = false where id = test.id('coco');
do $$ begin
  assert not public.is_business_open(test.id('coco')), 'apagado está cerrado';
end $$;
