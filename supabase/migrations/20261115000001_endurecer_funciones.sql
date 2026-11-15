-- Endurecimiento (primer paso de la semana 6, avisos del Security Advisor de Supabase).
-- Las funciones de trigger no tienen que poder llamarse por la API (/rest/v1/rpc).
-- Los triggers siguen funcionando: Postgres no pide EXECUTE para disparar un trigger.
-- expire_overdue_orders queda pública a propósito: la app la llama al abrir pedidos.

do $$
declare f text;
begin
  foreach f in array array[
    'check_order_payment()', 'enforce_product_limit()', 'handle_new_user()', 'notify_order_change()',
    'on_order_status_change()', 'on_report_insert()', 'refresh_business_rating()',
    'refresh_product_reactions()', 'request_refund_on_cancel()', 'validate_reaction()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;

alter function public.order_transition_allowed set search_path = public;
