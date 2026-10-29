-- Buckets de archivos y quién puede subir a cada uno.
-- Rutas: <business_id>/<archivo> para fotos y videos de negocios y productos,
--        <user_id>/<archivo> para la evidencia de denuncias.
-- Solo corre si existe el esquema storage (en Supabase siempre existe).

do $migration$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'Sin esquema storage: se omiten los buckets';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('business-media', 'business-media', true, 52428800,
     array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']),
    ('product-photos', 'product-photos', true, 5242880,
     array['image/jpeg', 'image/png', 'image/webp']),
    ('report-evidence', 'report-evidence', false, 5242880,
     array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $sql$
    create policy media_owner_insert on storage.objects for insert to authenticated
      with check (bucket_id in ('business-media', 'product-photos')
                  and public.owns_business(((storage.foldername(name))[1])::uuid))
  $sql$;
  execute $sql$
    create policy media_owner_update on storage.objects for update to authenticated
      using (bucket_id in ('business-media', 'product-photos')
             and public.owns_business(((storage.foldername(name))[1])::uuid))
  $sql$;
  execute $sql$
    create policy media_owner_delete on storage.objects for delete to authenticated
      using (bucket_id in ('business-media', 'product-photos')
             and (public.owns_business(((storage.foldername(name))[1])::uuid) or public.is_staff()))
  $sql$;
  execute $sql$
    create policy evidence_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'report-evidence' and (storage.foldername(name))[1] = auth.uid()::text)
  $sql$;
  execute $sql$
    create policy evidence_read on storage.objects for select to authenticated
      using (bucket_id = 'report-evidence'
             and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()))
  $sql$;
end
$migration$;
