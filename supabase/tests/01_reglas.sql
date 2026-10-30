-- Pruebas de las reglas de negocio del esquema base.
-- Cada bloque falla con un error si la regla no se cumple.

create schema test;
create table test.ids (name text primary key, id uuid not null);
grant usage on schema test to authenticated;
grant select on test.ids to authenticated;

create function test.id(p_name text) returns uuid language sql stable
as $$ select id from test.ids where name = p_name $$;
grant execute on function test.id(text) to authenticated;

create function test.login(p_name text) returns void language sql
as $$ select set_config('request.jwt.claim.sub', test.id(p_name)::text, false) $$;
grant execute on function test.login(text) to authenticated;

-- Usuarios: vendedor, cliente, tres denunciantes, otro vendedor
insert into auth.users (phone, raw_user_meta_data) values
  ('5493886000001', '{"full_name":"Vendedor Uno"}'),
  ('5493886000002', '{"full_name":"Cliente Dos"}'),
  ('5493886000003', '{}'), ('5493886000004', '{}'), ('5493886000005', '{}'),
  ('5493886000006', '{"full_name":"Vendedor Seis"}');
insert into test.ids select 'vendedor', id from auth.users where phone = '5493886000001';
insert into test.ids select 'cliente', id from auth.users where phone = '5493886000002';
insert into test.ids select 'den1', id from auth.users where phone = '5493886000003';
insert into test.ids select 'den2', id from auth.users where phone = '5493886000004';
insert into test.ids select 'den3', id from auth.users where phone = '5493886000005';
insert into test.ids select 'vendedor2', id from auth.users where phone = '5493886000006';

do $$ begin
  assert (select count(*) from public.profiles) = 6, 'se crea un perfil por usuario';
  assert (select display_name from public.profiles where id = test.id('vendedor')) = 'Vendedor Uno', 'nombre copiado';
end $$;

-- ---------------------------------------------------------------- negocio
select test.login('vendedor');
set role authenticated;

insert into public.businesses (owner_id, name, slug, type, phone, status, plan, rating_avg, is_open_now)
values (test.id('vendedor'), 'Lo de Coco', 'lo-de-coco', 'carrito', '3886000001', 'active', 'plus', 5, true);

do $$ begin
  assert (select plan from public.businesses where slug = 'lo-de-coco') = 'free', 'el dueño no se asigna Plus';
  assert (select rating_avg from public.businesses where slug = 'lo-de-coco') = 0, 'el dueño no se pone calificación';
end $$;

-- Un dueño, un negocio
do $$ begin
  insert into public.businesses (owner_id, name, slug, type, phone)
  values (test.id('vendedor'), 'Otro', 'otro', 'local', '3886000099');
  raise exception 'FALLA: permitió un segundo negocio al mismo dueño';
exception when unique_violation then null;
end $$;

-- CUIT guardado como hash
select public.set_business_tax_id((select id from public.businesses where slug = 'lo-de-coco'), '20-12345678-9');
reset role;
do $$ begin
  assert (select tax_id_hash from public.businesses where slug = 'lo-de-coco') is not null, 'se guarda el hash del CUIT';
end $$;

-- Horario: todos los días de 00:00 a 23:59 para que esté abierto en la prueba
insert into public.business_hours (business_id, weekday, opens_at, closes_at)
select id, d, '00:00', '23:59' from public.businesses, generate_series(0, 6) d where slug = 'lo-de-coco';
insert into public.delivery_settings (business_id, offers_delivery, fee_mode, fee)
select id, true, 'fixed', 500 from public.businesses where slug = 'lo-de-coco';

-- ---------------------------------------------------------------- productos y límite del plan
select test.login('vendedor');
set role authenticated;

insert into public.products (business_id, name, description, price, likes)
select id, x.name, x.description, x.price, 999
from public.businesses,
  (values ('Sándwich de milanesa', 'Milanesa de carne con lechuga y tomate', 4500),
          ('Lomito completo', 'Lomo, jamón, queso y huevo', 6000),
          ('Pancho', 'Salchicha con salsas', 1500),
          ('Hamburguesa doble', 'Doble carne y cheddar', 5500),
          ('Papas fritas', 'Porción grande', 2500)) as x(name, description, price)
where slug = 'lo-de-coco';

do $$ begin
  assert (select max(likes) from public.products) = 0, 'el dueño no se carga likes';
  insert into public.products (business_id, name, price)
  select id, 'Sexto producto', 1000 from public.businesses where slug = 'lo-de-coco';
  raise exception 'FALLA: permitió un sexto producto en el plan gratis';
exception when check_violation then null;
end $$;

reset role;
update public.businesses set plan = 'plus' where slug = 'lo-de-coco';
select test.login('vendedor');
set role authenticated;
insert into public.products (business_id, name, price)
select id, 'Sexto producto', 1000 from public.businesses where slug = 'lo-de-coco';
do $$ begin
  assert (select count(*) from public.products where status = 'active') = 6, 'con Plus entra el sexto';
end $$;

-- Otro usuario no puede cargar productos en un negocio ajeno
select test.login('cliente');
do $$ begin
  insert into public.products (business_id, name, price)
  select id, 'Intruso', 1000 from public.businesses where slug = 'lo-de-coco';
  raise exception 'FALLA: un cliente cargó un producto ajeno';
exception when insufficient_privilege then null;
end $$;

select test.login('vendedor');

-- ---------------------------------------------------------------- búsqueda
set role anon;
do $$ begin
  assert (select product_name from public.search_products('sanguche de milanga') limit 1) = 'Sándwich de milanesa',
    'sinónimos: sanguche de milanga encuentra Sándwich de milanesa';
  assert (select product_name from public.search_products('milanesa') limit 1) = 'Sándwich de milanesa', 'busca en descripción y nombre';
  assert (select product_name from public.search_products('hamburgesa') limit 1) = 'Hamburguesa doble', 'tolera errores de tipeo';
  assert (select count(*) from public.search_products('')) = 6, 'sin texto lista todo';
  assert (select bool_and(is_open) from public.search_products('')), 'el horario cargado está abierto';
end $$;
-- con el interruptor manual apagado, el negocio figura cerrado
reset role;
update public.businesses set is_open_now = false where slug = 'lo-de-coco';
do $$ begin
  assert (select count(*) from public.search_products('', p_only_open => true)) = 0, 'cerrado no aparece con filtro abiertos';
end $$;
update public.businesses set is_open_now = true where slug = 'lo-de-coco';
do $$ begin
  assert (select count(*) from public.search_products('', p_only_open => true)) = 6, 'abierto aparece con filtro abiertos';
end $$;

-- ---------------------------------------------------------------- pedido y estados
reset role;
insert into public.orders (customer_id, business_id, type, subtotal, total, payment_method, status, commission_pct, commission_amount)
select test.id('cliente'), id, 'pickup', 4500, 4500, 'cash', 'new', 3, 135
from public.businesses where slug = 'lo-de-coco';
insert into test.ids select 'pedido', id from public.orders;
insert into public.order_items (order_id, product_id, product_name, unit_price, quantity)
select test.id('pedido'), id, name, price, 1 from public.products where name = 'Sándwich de milanesa';

select test.login('cliente');
set role authenticated;
do $$ begin
  perform public.set_order_status(test.id('pedido'), 'preparing');
  raise exception 'FALLA: el cliente pasó su pedido a preparación';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  insert into public.reviews (order_id, stars) values (test.id('pedido'), 5);
  raise exception 'FALLA: calificó un pedido no entregado';
exception when check_violation then null;
end $$;

select test.login('vendedor');
select public.set_order_status(test.id('pedido'), 'preparing');
do $$ begin
  perform public.set_order_status(test.id('pedido'), 'delivered');
  raise exception 'FALLA: permitió saltar de preparación a entregado';
exception when check_violation then null;
end $$;
select public.set_order_status(test.id('pedido'), 'ready');
select public.set_order_status(test.id('pedido'), 'delivered');

reset role;
do $$ begin
  assert (select completed_orders from public.businesses where slug = 'lo-de-coco') = 1, 'entregado suma un concretado';
  assert (select cash_commission_debt from public.businesses where slug = 'lo-de-coco') = 135, 'comisión en efectivo queda como deuda';
  assert (select count(*) from public.order_events where order_id = test.id('pedido')) = 3, 'cada cambio queda registrado';
  assert (select actor_id from public.order_events order by id desc limit 1) = test.id('vendedor'), 'registra quién lo cambió';
end $$;

-- ---------------------------------------------------------------- likes, reseñas y ranking
create temp table score_antes as select score from public.products where name = 'Sándwich de milanesa';
grant select on score_antes to authenticated;

select test.login('cliente');
set role authenticated;
insert into public.product_reactions (product_id, customer_id, type)
select id, test.id('cliente'), 'like' from public.products where name = 'Sándwich de milanesa';
insert into public.reviews (order_id, stars, comment) values (test.id('pedido'), 5, 'Riquísimo');

do $$ begin
  insert into public.product_reactions (product_id, customer_id, type)
  select id, test.id('cliente'), 'like' from public.products where name = 'Pancho';
  raise exception 'FALLA: reaccionó a un producto que no compró';
exception when check_violation then null;
end $$;
do $$ begin
  insert into public.reviews (order_id, stars) values (test.id('pedido'), 1);
  raise exception 'FALLA: dos reseñas para el mismo pedido';
exception when unique_violation then null;
end $$;

reset role;
do $$ begin
  assert (select likes from public.products where name = 'Sándwich de milanesa') = 1, 'el like se cuenta';
  assert (select rating_avg from public.businesses where slug = 'lo-de-coco') = 5, 'promedio de estrellas';
  assert (select rating_count from public.businesses where slug = 'lo-de-coco') = 1, 'cantidad de reseñas';
  assert (select score from public.products where name = 'Sándwich de milanesa') > (select score from score_antes),
    'el like y la reseña suben el puntaje';
  assert (select product_name from public.search_products('') limit 1) = 'Sándwich de milanesa', 'el más votado sale primero';
end $$;

-- El vendedor responde pero no cambia las estrellas
select test.login('vendedor');
set role authenticated;
update public.reviews set seller_reply = 'Gracias!', stars = 1 where order_id = test.id('pedido');
reset role;
do $$ begin
  assert (select stars from public.reviews where order_id = test.id('pedido')) = 5, 'el vendedor no cambia estrellas';
  assert (select seller_reply from public.reviews where order_id = test.id('pedido')) = 'Gracias!', 'el vendedor responde';
end $$;

-- ---------------------------------------------------------------- denuncias
set role authenticated;
select test.login('den1');
insert into public.reports (reporter_id, target_type, target_id, reason)
select test.id('den1'), 'product', id, 'plagiarism' from public.products where name = 'Pancho';
select test.login('den2');
insert into public.reports (reporter_id, target_type, target_id, reason)
select test.id('den2'), 'product', id, 'plagiarism' from public.products where name = 'Pancho';
reset role;
do $$ begin
  assert (select status from public.products where name = 'Pancho') = 'active', 'dos denuncias no ocultan';
end $$;
set role authenticated;
select test.login('den3');
insert into public.reports (reporter_id, target_type, target_id, reason)
select test.id('den3'), 'product', id, 'inappropriate' from public.products where name = 'Pancho';
reset role;
do $$ begin
  assert (select status from public.products where name = 'Pancho') = 'hidden', 'tres denuncias ocultan el producto';
  assert (select priority from public.reports where reporter_id = test.id('den3')) = 1, 'contenido inapropiado es prioridad alta';
end $$;

-- El dueño no puede reactivar lo que ocultó moderación
select test.login('vendedor');
set role authenticated;
do $$ begin
  update public.products set status = 'active' where name = 'Pancho';
  raise exception 'FALLA: el dueño reactivó un producto ocultado';
exception when check_violation then null;
end $$;

-- Tope de denuncias por día
select test.login('den1');
insert into public.reports (reporter_id, target_type, target_id, reason)
select test.id('den1'), 'profile', gen_random_uuid(), 'other' from generate_series(1, 4);
do $$ begin
  insert into public.reports (reporter_id, target_type, target_id, reason)
  values (test.id('den1'), 'profile', gen_random_uuid(), 'other');
  raise exception 'FALLA: permitió una sexta denuncia en el día';
exception when check_violation then null;
end $$;

-- ---------------------------------------------------------------- cuentas duplicadas
select test.login('vendedor2');
insert into public.businesses (owner_id, name, slug, type, phone)
values (test.id('vendedor2'), 'Lo de Coco 2', 'lo-de-coco-2', 'carrito', '3886000002');
do $$ begin
  perform public.set_business_tax_id((select id from public.businesses where slug = 'lo-de-coco-2'), '12.345.678');
  raise exception 'FALLA: aceptó el mismo DNI (contenido en el CUIT) en otro negocio';
exception when unique_violation then null;
end $$;
do $$ begin
  update public.businesses set phone = '3886000001' where slug = 'lo-de-coco-2';
  raise exception 'FALLA: aceptó el mismo teléfono en otro negocio';
exception when unique_violation then null;
end $$;

-- Un perfil no se da rol de moderador
update public.profiles set role = 'admin' where id = test.id('vendedor2');
reset role;
do $$ begin
  assert (select role from public.profiles where id = test.id('vendedor2')) = 'customer', 'nadie se asigna rol de admin';
end $$;

-- Un cliente no ve pedidos ajenos
select test.login('den1');
set role authenticated;
do $$ begin
  assert (select count(*) from public.orders) = 0, 'no ve pedidos ajenos';
  assert (select count(*) from public.profiles) = 1, 'solo ve su propio perfil';
end $$;
reset role;
