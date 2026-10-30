-- Pruebas del alta de negocio (semana 2). Corre después de 01_reglas.sql.

insert into auth.users (phone, raw_user_meta_data) values
  ('5493887000001', '{"full_name":"Pancho Pérez"}'),
  ('5493887000002', '{"full_name":"Copión"}');
insert into test.ids select 'pancho', id from auth.users where phone = '5493887000001';
insert into test.ids select 'copion', id from auth.users where phone = '5493887000002';

select test.login('pancho');
set role authenticated;

select public.create_business(
  p_name => 'El Pancho Feliz!',
  p_type => 'carrito',
  p_phone => '+5493887000001',
  p_tax_id => '30111222',
  p_description => 'Panchos y papas',
  p_hours => '[{"weekday":5,"opens_at":"19:00","closes_at":"01:00"},{"weekday":6,"opens_at":"19:00","closes_at":"02:00"}]',
  p_delivery => '{"offers_delivery":true,"fee_mode":"fixed","fee":800,"radius_km":2}'
);
reset role;
insert into test.ids select 'pancho_negocio', id from public.businesses where owner_id = test.id('pancho');
set role authenticated;

do $$ begin
  assert (select slug from public.businesses where id = test.id('pancho_negocio')) = 'el-pancho-feliz', 'slug sin acentos ni signos';
  assert (select status from public.businesses where id = test.id('pancho_negocio')) = 'draft', 'nace en borrador';
  assert (select tax_id_hash is not null from public.businesses where id = test.id('pancho_negocio')), 'guarda el hash del DNI';
  assert (select count(*) from public.business_hours where business_id = test.id('pancho_negocio')) = 2, 'carga los horarios';
  assert (select fee from public.delivery_settings where business_id = test.id('pancho_negocio')) = 800, 'carga el delivery';
  assert (select offers_pickup from public.delivery_settings where business_id = test.id('pancho_negocio')), 'retiro por defecto';
end $$;

-- Segundo negocio del mismo dueño: error claro
do $$ begin
  perform public.create_business(p_name => 'Otro', p_type => 'local', p_phone => '+5493887000009', p_tax_id => '30111223');
  raise exception 'FALLA: permitió un segundo negocio';
exception when unique_violation then
  assert sqlerrm = 'Ya tenés un negocio', 'mensaje de segundo negocio';
end $$;

-- No se publica sin productos
do $$ begin
  update public.businesses set status = 'active' where id = test.id('pancho_negocio');
  raise exception 'FALLA: publicó un negocio sin productos';
exception when check_violation then null;
end $$;

insert into public.products (business_id, name, price) values (test.id('pancho_negocio'), 'Pancho', 1500);
update public.businesses set status = 'active' where id = test.id('pancho_negocio');
do $$ begin
  assert (select status from public.businesses where id = test.id('pancho_negocio')) = 'active', 'publica con un producto';
end $$;

-- Reemplazar horarios y delivery
select public.set_business_hours(test.id('pancho_negocio'), '[{"weekday":0,"opens_at":"12:00","closes_at":"15:00"}]');
select public.set_delivery_settings(test.id('pancho_negocio'), '{"offers_delivery":false}');
do $$ begin
  assert (select count(*) from public.business_hours where business_id = test.id('pancho_negocio')) = 1, 'reemplaza horarios';
  assert (select not offers_delivery from public.delivery_settings where business_id = test.id('pancho_negocio')), 'actualiza delivery';
  perform public.set_business_hours(test.id('pancho_negocio'), '[{"weekday":0,"opens_at":"12:00","closes_at":"12:00"}]');
  raise exception 'FALLA: aceptó abrir y cerrar a la misma hora';
exception when check_violation then null;
end $$;

-- Otro usuario: mismo DNI o mismo teléfono no dejan nada a medias; mismo nombre recibe otro slug
select test.login('copion');
do $$ begin
  perform public.create_business(p_name => 'Copia', p_type => 'local', p_phone => '+5493887000002', p_tax_id => '20-30111222-5');
  raise exception 'FALLA: aceptó el mismo DNI';
exception when unique_violation then null;
end $$;
do $$ begin
  perform public.create_business(p_name => 'Copia', p_type => 'local', p_phone => '+5493887000001', p_tax_id => '30999888');
  raise exception 'FALLA: aceptó el mismo teléfono';
exception when unique_violation then
  assert sqlerrm = 'Ese teléfono ya está en otro negocio', 'mensaje de teléfono repetido';
end $$;
do $$ begin
  assert (select count(*) from public.businesses where owner_id = test.id('copion')) = 0, 'no quedó un negocio a medias';
end $$;
select public.create_business(p_name => 'El Pancho Feliz', p_type => 'puesto', p_phone => '+5493887000002', p_tax_id => '30999888');
do $$ begin
  assert (select slug from public.businesses where owner_id = test.id('copion')) like 'el-pancho-feliz-____', 'slug repetido lleva sufijo';
end $$;

-- Horarios de un negocio ajeno
do $$ begin
  perform public.set_business_hours(test.id('pancho_negocio'), '[]');
  raise exception 'FALLA: cambió horarios ajenos';
exception when insufficient_privilege then null;
end $$;

-- Sin sesión no se crea nada
reset role;
select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$ begin
  perform public.create_business(p_name => 'Anónimo', p_type => 'local', p_phone => '+5493887000003', p_tax_id => '30777666');
  raise exception 'FALLA: creó un negocio sin sesión';
exception when insufficient_privilege then null;
end $$;
reset role;
