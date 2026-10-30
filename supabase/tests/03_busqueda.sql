-- Pruebas de listados y perfil público (semana 3). Corre después de 02_alta_negocio.sql.

grant usage on schema test to anon;
grant select on test.ids to anon;
grant execute on function test.id(text) to anon;

set role anon;
do $$ begin
  assert (select count(*) from public.list_businesses()) = 2, 'lista los dos negocios publicados con productos';
  assert (select name from public.list_businesses() limit 1) = 'Lo de Coco', 'el abierto va primero';
  assert (select count(*) from public.list_businesses(p_only_open => true)) = 1, 'filtro de abiertos';
  assert (select count(*) from public.get_business_profile(test.id('pancho_negocio'))) = 1, 'perfil público de un negocio publicado';
end $$;

-- Un borrador no se ve desde afuera, pero sí para su dueño
do $$ begin
  assert (select count(*) from public.get_business_profile(
    (select id from public.businesses where slug like 'el-pancho-feliz-%'))) = 0, 'el borrador ajeno no se ve';
end $$;
reset role;
insert into test.ids select 'copion_negocio', id from public.businesses where owner_id = test.id('copion');
select test.login('copion');
set role authenticated;
do $$ begin
  assert (select count(*) from public.get_business_profile(test.id('copion_negocio'))) = 1, 'el dueño ve su borrador';
end $$;

-- El hash del documento y la deuda no se leen desde la app
do $$ begin
  perform tax_id_hash from public.businesses limit 1;
  raise exception 'FALLA: se pudo leer el hash del CUIT/DNI';
exception when insufficient_privilege then null;
end $$;
do $$ begin
  perform cash_commission_debt from public.businesses limit 1;
  raise exception 'FALLA: se pudo leer la deuda de comisiones';
exception when insufficient_privilege then null;
end $$;

-- El dueño sigue pudiendo editar su negocio
update public.businesses set description = 'Panchos al paso' where id = test.id('copion_negocio');
do $$ begin
  assert (select description from public.businesses where id = test.id('copion_negocio')) = 'Panchos al paso', 'edita su negocio';
end $$;
reset role;
