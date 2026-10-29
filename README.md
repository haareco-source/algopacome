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
  (auth)/           ingreso con código por email o SMS
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
2. Ingreso: por defecto la app usa un código por **email**. En **Authentication > Emails > Magic Link**, agregar `{{ .Token }}` al cuerpo del mail para que llegue el código. El email gratuito de Supabase manda pocos mails por hora: alcanza para probar.
   Para ingresar por **SMS**, activar **Authentication > Sign In / Providers > Phone** con un proveedor (Twilio necesita cuenta paga) y poner `EXPO_PUBLIC_LOGIN_METHOD=sms` en `.env.local`.
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
