# Algopacome

La comida rápida de tu barrio: puestos, carritos y locales de Libertador General San Martín (Jujuy) publican sus productos, y los vecinos buscan, piden y pagan desde el celular. Lo desarrolla NOA Digital.

La especificación completa (módulos, pantallas, modelo de datos, estados de pedidos, ranking, moderación y comisiones) está en el documento del paso 2 del proyecto.

## Tecnología

- **App:** Expo SDK 58 (React Native, TypeScript, Expo Router). Android primero.
- **Backend:** Supabase (Postgres con RLS, Auth por SMS, Storage, Realtime, Edge Functions).
- **Pagos:** Mercado Pago Marketplace con comisión automática (semana 5).

## Estructura

```
src/app/            pantallas (cada archivo es una ruta de Expo Router)
  (auth)/           ingreso con celular y código SMS
  bienvenida.tsx    nombre y aceptación de las reglas de convivencia
  (tabs)/           inicio, pedidos y perfil
src/components/     componentes reutilizables
src/lib/            cliente de Supabase y utilidades
src/providers/      sesión y perfil del usuario
supabase/
  migrations/       esquema de la base, reglas de negocio y políticas RLS
  tests/            pruebas de las reglas (scripts/probar-db.sh)
```

## Puesta en marcha

1. Crear un proyecto en [Supabase](https://supabase.com) (región São Paulo).
2. En **Authentication > Providers > Phone**, activar el ingreso por teléfono y cargar un proveedor de SMS (Twilio, MessageBird o Vonage).
3. Aplicar las migraciones:
   ```bash
   npx supabase login
   npx supabase link --project-ref TU-PROYECTO
   npx supabase db push
   ```
4. Copiar `.env.example` como `.env.local` y completar la URL y la clave anon del proyecto.
5. Instalar y arrancar la app:
   ```bash
   npm install
   npx expo start
   ```
   Abrirla en un Android con Expo Go escaneando el código QR.

Para darle rol de moderador a alguien, en el editor SQL de Supabase:

```sql
update public.profiles set role = 'admin' where phone = '+5493880000000';
```

## Comprobaciones

```bash
npx tsc --noEmit          # tipos
npx expo lint             # estilo
scripts/probar-db.sh      # reglas de la base en un Postgres temporal (no como root)
```

## Valores configurables

Comisiones, pedidos gratis, límites de productos, precio del plan Plus, pesos del ranking y tiempos de pedidos están en la tabla `config`, y se cambian sin tocar código:

| Clave | Valor inicial |
| --- | --- |
| `free_orders_threshold` | 10 pedidos sin comisión |
| `commission_launch_pct` | 3 % |
| `commission_standard_pct` | 5 % (desde `commission_standard_from`) |
| `free_product_limit` / `plus_product_limit` | 5 / 15 productos |
| `plus_price_usd` | USD 1 por mes |
| `order_accept_minutes` | 10 minutos |
| `reports_autohide` | 3 denuncias ocultan el contenido |
