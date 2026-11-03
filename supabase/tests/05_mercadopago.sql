-- Pruebas de cobros con Mercado Pago (semana 5). Corre después de 04_pedidos.sql.
-- Las funciones "solo servidor" se prueban como service_role, que es lo que usa la Edge Function.

reset role;
update public.config set value = 'false' where key = 'payments_test_mode';
update public.businesses set is_open_now = true where id = test.id('coco');
grant execute on function test.login(text) to service_role;
grant usage on schema test to service_role;
grant select on test.ids to service_role;
grant execute on function test.id(text) to service_role;
grant insert on test.ids to service_role;

-- ---------------------------------------------------------------- sin vincular no cobra
select test.login('cliente');
set role authenticated;
do $$ begin
  assert not (public.get_payment_options(test.id('coco')) ->> 'mercadopago')::boolean, 'sin vincular no ofrece Mercado Pago';
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago');
  raise exception 'FALLA: aceptó Mercado Pago sin cuenta vinculada';
exception when check_violation then null;
end $$;

-- ---------------------------------------------------------------- vinculación
select test.login('vendedor');
set role authenticated;
select set_config('test.estado', public.start_mp_link(), false);

do $$ begin
  perform public.mp_link_seller(current_setting('test.estado'), '111', 'tok', 'ref', 3600);
  raise exception 'FALLA: la app pudo guardar tokens';
exception when insufficient_privilege then null;
end $$;
update public.businesses set accepts_mercadopago = true where id = test.id('coco');
do $$ begin
  assert not (select accepts_mercadopago from public.businesses where id = test.id('coco')), 'el dueño no se habilita solo';
end $$;
do $$ begin
  perform 1 from public.seller_accounts;
  raise exception 'FALLA: la app pudo leer cuentas de Mercado Pago';
exception when insufficient_privilege then null;
end $$;

set role service_role;
do $$ begin
  assert public.mp_link_seller(current_setting('test.estado'), '111', 'tok', 'ref', 3600) = test.id('coco'), 'vincula el negocio';
  assert (select accepts_mercadopago from public.businesses where id = test.id('coco')), 'habilita Mercado Pago';
end $$;
do $$ begin
  perform public.mp_link_seller(current_setting('test.estado'), '111', 'tok', 'ref', 3600);
  raise exception 'FALLA: el código de vinculación se usó dos veces';
exception when check_violation then null;
end $$;

-- ---------------------------------------------------------------- pago de un pedido
select test.login('cliente');
set role authenticated;
insert into test.ids
select 'mp1', public.create_order(test.id('coco'),
  jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 2)), 'pickup', 'mercadopago');
do $$ begin
  assert (select status from public.orders where id = test.id('mp1')) = 'awaiting_payment', 'espera el pago';
end $$;

set role service_role;
do $$
declare v jsonb;
begin
  begin
    perform public.mp_order_for_checkout(test.id('mp1'), test.id('vendedor'));
    raise exception 'FALLA: armó el cobro para otra persona';
  exception when no_data_found then null;
  end;
  v := public.mp_order_for_checkout(test.id('mp1'), test.id('cliente'));
  assert v ->> 'access_token' = 'tok', 'usa el token del vendedor';
  assert (v ->> 'total')::numeric = (select total from public.orders where id = test.id('mp1')), 'cobra el total';
  assert jsonb_array_length(v -> 'items') = 1, 'manda los productos';
end $$;

do $$
declare v_total numeric := (select total from public.orders where id = test.id('mp1'));
begin
  assert public.mp_record_payment(test.id('mp1'), 'pay-1', 'approved', v_total, 0, '999', '{}')
    = 'el cobro no es de la cuenta del negocio', 'ignora cobros de otra cuenta';
  assert public.mp_record_payment(test.id('mp1'), 'pay-1', 'pending', v_total, 0, '111', '{}') = 'pago pending', 'pendiente';
  assert (select status from public.orders where id = test.id('mp1')) = 'awaiting_payment', 'pendiente no confirma';
  assert public.mp_record_payment(test.id('mp1'), 'pay-1', 'approved', v_total, 0, '111', '{}')
    = 'pedido confirmado', 'aprobado confirma';
  assert (select status from public.orders where id = test.id('mp1')) = 'new', 'pasa a Nuevo';
  assert (select accept_by from public.orders where id = test.id('mp1')) > now(), 'arranca el plazo para aceptar';
  assert public.mp_record_payment(test.id('mp1'), 'pay-1', 'approved', v_total, 0, '111', '{}')
    = 'ya estaba confirmado', 'el aviso repetido no hace nada';
  assert (select count(*) from public.payments where order_id = test.id('mp1')) = 1, 'un solo pago';
end $$;

-- El vendedor lo rechaza: se pide el reembolso
select test.login('vendedor');
set role authenticated;
select public.set_order_status(test.id('mp1'), 'rejected');
set role service_role;
do $$
declare v_payment uuid := (select id from public.payments where mp_payment_id = 'pay-1');
begin
  assert (select count(*) from public.mp_refunds_due() where payment_id = v_payment) = 1, 'queda para reembolsar';
  perform public.mp_mark_refund(v_payment, false, 'error de prueba');
  assert (select refund_attempts from public.payments where id = v_payment) = 1, 'cuenta el intento fallido';
  perform public.mp_mark_refund(v_payment, true);
  assert (select status from public.payments where id = v_payment) = 'refunded', 'reembolsado';
  assert (select count(*) from public.mp_refunds_due()) = 0, 'no queda nada pendiente';
end $$;

-- Pago que llega tarde, con el pedido ya cancelado: se devuelve
select test.login('cliente');
set role authenticated;
insert into test.ids
select 'mp2', public.create_order(test.id('coco'),
  jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago');
select public.set_order_status(test.id('mp2'), 'cancelled');
set role service_role;
do $$ begin
  assert public.mp_record_payment(test.id('mp2'), 'pay-2', 'approved',
    (select total from public.orders where id = test.id('mp2')), 0, '111', '{}') = 'se devuelve', 'pago tardío';
  assert (select count(*) from public.mp_refunds_due()) = 1, 'queda para reembolsar';
end $$;

-- Pago por menos del total: no confirma y se devuelve
select test.login('cliente');
set role authenticated;
insert into test.ids
select 'mp3', public.create_order(test.id('coco'),
  jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'mercadopago');
set role service_role;
do $$ begin
  assert public.mp_record_payment(test.id('mp3'), 'pay-3', 'approved', 1, 0, '111', '{}') = 'se devuelve', 'monto menor';
  assert (select status from public.orders where id = test.id('mp3')) = 'awaiting_payment', 'sigue esperando el pago';
end $$;

-- ---------------------------------------------------------------- efectivo con deuda
reset role;
update public.businesses set accepts_cash = true, cash_commission_debt = 20000 where id = test.id('coco');
select test.login('cliente');
set role authenticated;
do $$ begin
  assert not (public.get_payment_options(test.id('coco')) ->> 'cash')::boolean, 'con deuda no ofrece efectivo';
  perform public.create_order(test.id('coco'),
    jsonb_build_array(jsonb_build_object('product_id', test.id('milanesa'), 'quantity', 1)), 'pickup', 'cash');
  raise exception 'FALLA: aceptó efectivo con la deuda al tope';
exception when check_violation then null;
end $$;
set role service_role;
do $$ begin
  assert public.mp_record_debt_payment(test.id('coco'), 'deuda-1', 5000), 'aplica el pago';
  assert not public.mp_record_debt_payment(test.id('coco'), 'deuda-1', 5000), 'no lo aplica dos veces';
  assert (select cash_commission_debt from public.businesses where id = test.id('coco')) = 15000, 'baja la deuda';
end $$;
select test.login('cliente');
set role authenticated;
do $$ begin
  assert (public.get_payment_options(test.id('coco')) ->> 'cash')::boolean, 'vuelve el efectivo';
end $$;

-- ---------------------------------------------------------------- plan Plus
reset role;
set role service_role;
do $$ begin
  assert public.mp_record_subscription(test.id('coco'), 'sub-1', 'authorized', now() + interval '1 month') = 'plus', 'Plus';
end $$;
reset role;
-- Con Plus carga un sexto producto a la vista
insert into public.products (business_id, name, price) values (test.id('coco'), 'Empanada árabe', 900);
set role service_role;
do $$ begin
  assert public.mp_record_subscription(test.id('coco'), 'sub-1', 'cancelled') = 'free', 'vuelve a gratis';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.products where business_id = test.id('coco') and status = 'active') = 5,
    'quedan 5 productos a la vista';
  assert (select count(*) from public.products where business_id = test.id('coco') and hidden_by_plan) = 1,
    'el que sobra queda oculto, no borrado';
end $$;
insert into test.ids select 'sobrante', id from public.products where business_id = test.id('coco') and hidden_by_plan;
insert into test.ids select 'visible', id from public.products
  where business_id = test.id('coco') and status = 'active' order by created_at limit 1;

select test.login('vendedor');
set role authenticated;
do $$ begin
  update public.products set status = 'active' where id = test.id('sobrante');
  raise exception 'FALLA: superó el límite del plan gratis';
exception when check_violation then null;
end $$;
-- Oculta otro y muestra el que había quedado afuera
update public.products set status = 'hidden' where id = test.id('visible');
update public.products set status = 'active' where id = test.id('sobrante');
do $$ begin
  assert (select status from public.products where id = test.id('sobrante')) = 'active', 'eligió cuál mostrar';
  assert (select hidden_by_plan from public.products where id = test.id('visible')), 'el que ocultó lo puede volver a mostrar';
  assert (public.get_my_billing() ->> 'plan') = 'free', 'resumen: plan';
  assert (public.get_my_billing() ->> 'cash_debt')::numeric = 15000, 'resumen: deuda';
  assert (public.get_my_billing() ->> 'accepts_mercadopago')::boolean, 'resumen: Mercado Pago';
end $$;

select test.login('cliente');
do $$ begin
  perform * from public.commission_report(current_date);
  raise exception 'FALLA: un cliente vio el reporte de comisiones';
exception when insufficient_privilege then null;
end $$;
reset role;
-- Desde el SQL Editor (sin usuario de la app) se puede.
select set_config('request.jwt.claim.sub', '', false);
do $$ begin
  assert (select count(*) from public.commission_report(current_date)) >= 1, 'reporte del mes';
end $$;

update public.config set value = 'true' where key = 'payments_test_mode';
