-- Semana 4 (parte 1): estado "Aceptado" para los pedidos programados.
-- Va en un archivo aparte porque un valor nuevo de enum recién se puede usar
-- después de confirmar la transacción que lo agrega.
alter type public.order_status add value if not exists 'accepted' after 'new';
