# Algopacome

La comida rápida de tu barrio: puestos, carritos y locales de Libertador General San Martín (Jujuy) publican sus productos, y los vecinos buscan, piden y pagan desde el celular. Lo desarrolla NOA Digital.

La especificación completa (módulos, pantallas, modelo de datos, estados de pedidos, ranking, moderación y comisiones) está en el documento del paso 2 del proyecto.

## Tecnología

- **App:** Expo SDK 58 (React Native, TypeScript, Expo Router). Android primero.
- **Backend:** Supabase (Postgres con RLS, Auth con Google y código por email, Storage, Realtime, Edge Functions).
- **Pagos:** Mercado Pago Marketplace con comisión automática (semana 5).

## Estructura

```
src/app/            pantallas (cada archivo es una ruta de Expo Router)
  (auth)/           ingreso con Google o código por email (SMS opcional)
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
2. Ingreso (ver el documento "Algopacome: cómo ingresan los usuarios"):
   - **Email:** el correo por defecto de Supabase no sirve en proyectos gratis nuevos. Configurar un SMTP propio (Brevo, gratis) en **Authentication > Emails > SMTP Settings** y agregar `{{ .Token }}` a las plantillas **Confirm signup** (primer ingreso) y **Magic Link** (ingresos siguientes).
   - **Google:** crear credenciales OAuth *Web* y *Android* en Google Cloud, activar Google en **Authentication > Sign In / Providers** con la credencial Web y poner su ID en `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`. No funciona en Expo Go: se prueba con la versión instalable de EAS.
   - **SMS** (opcional): proveedor pago en **Phone** y `EXPO_PUBLIC_LOGIN_METHOD=sms`.
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
6. Versión instalable para Android (necesaria para Google), con una cuenta gratis de expo.dev:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build --profile preview --platform android
   ```
   Al terminar, EAS da un link para descargar el APK e instalarlo en el celular. Las claves públicas de cada perfil están en `eas.json`.
7. Notificaciones de pedidos en Android: crear un proyecto en Firebase, agregar la app Android
   `ar.com.noadigital.algopacome`, guardar su `google-services.json` en la raíz del repo y poner
   `"googleServicesFile": "./google-services.json"` dentro de `android` en `app.json`. La clave de cuenta de servicio
   (privada) se sube en expo.dev > proyecto > Credentials > Android > FCM V1, nunca al repo. En Supabase tienen que
   estar las extensiones `pg_net` (manda los avisos) y `pg_cron` (vence pedidos cada minuto); la migración de la
   semana 4 intenta activarlas.

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
