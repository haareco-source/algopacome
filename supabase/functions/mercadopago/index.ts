// Edge Function "mercadopago": todo lo que habla con Mercado Pago, en un solo archivo para
// poder pegarlo en el editor del panel de Supabase. Rutas (después de /functions/v1/mercadopago):
//   GET  /vincular      el vendedor conecta su cuenta (OAuth) y vuelve a la app
//   POST /pagar         arma el cobro de un pedido (Checkout Pro con la comisión de NOA Digital)
//   POST /plus          alta del plan Plus (suscripción mensual a la cuenta de NOA Digital)
//   POST /cancelar-plus baja del plan Plus
//   POST /deuda         link para pagar la comisión acumulada de pedidos en efectivo
//   POST /webhook       avisos de Mercado Pago (pagos y suscripciones)
//   GET  /volver        vuelve a la app después de pagar
//   POST /procesar      reembolsos pendientes y renovación de tokens (lo llama pg_cron)
//
// Secretos (Panel de Supabase > Edge Functions > Secrets): MP_CLIENT_ID, MP_CLIENT_SECRET,
// MP_ACCESS_TOKEN (cuenta de NOA Digital), TOKEN_KEY (cifra los tokens de los vendedores) y,
// opcional, MP_WEBHOOK_SECRET (firma de los avisos) y MP_TEST=true mientras se prueba. Se despliega sin "Verify JWT".

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/mercadopago`;
const MP_API = 'https://api.mercadopago.com';
const APP_SCHEME = 'algopacome://';

const db = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function env(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new HttpError(500, `Falta configurar ${name} en los secretos de la función`);
  return value;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function backToApp(path: string) {
  const target = APP_SCHEME + path;
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
      `<p style="font-family:sans-serif;text-align:center;margin-top:40vh">` +
      `<a href="${target}">Volver a Algopacome</a></p>`,
    { status: 302, headers: { Location: target, 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

// ---------------------------------------------------------------- cifrado de tokens

async function tokenKey() {
  const raw = Uint8Array.from(atob(env('TOKEN_KEY')), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encrypt(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await tokenKey(), new TextEncoder().encode(text)),
  );
  const joined = new Uint8Array(iv.length + data.length);
  joined.set(iv);
  joined.set(data, iv.length);
  return 'v1:' + btoa(String.fromCharCode(...joined));
}

async function decrypt(value: string) {
  const joined = Uint8Array.from(atob(value.slice(3)), (c) => c.charCodeAt(0));
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: joined.slice(0, 12) },
    await tokenKey(),
    joined.slice(12),
  );
  return new TextDecoder().decode(data);
}

// ---------------------------------------------------------------- llamadas a Mercado Pago

async function mp(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown; idempotencyKey?: string } = {},
) {
  const response = await fetch(MP_API + path, {
    method: init.method ?? 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      ...(init.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Mercado Pago', path, response.status, JSON.stringify(data));
    throw new HttpError(502, data?.message ?? 'Mercado Pago no respondió bien. Probá de nuevo.');
  }
  return data;
}

async function oauthToken(body: Record<string, string>) {
  return mp('/oauth/token', null, {
    method: 'POST',
    body: {
      client_id: env('MP_CLIENT_ID'),
      client_secret: env('MP_CLIENT_SECRET'),
      // Con MP_TEST=true los vendedores de prueba reciben credenciales de prueba.
      ...(Deno.env.get('MP_TEST') === 'true' ? { test_token: 'true' } : {}),
      ...body,
    },
  });
}

// ---------------------------------------------------------------- usuario de la app

async function currentUser(req: Request) {
  const jwt = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!jwt) throw new HttpError(401, 'Tenés que ingresar');
  const { data, error } = await db.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, 'Tenés que ingresar');
  return data.user;
}

async function ownBusiness(userId: string) {
  const { data } = await db
    .from('businesses')
    .select('id, name, plan, cash_commission_debt')
    .eq('owner_id', userId)
    .maybeSingle();
  if (!data) throw new HttpError(403, 'Primero tenés que dar de alta tu negocio');
  return data;
}

async function rpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new HttpError(400, error.message);
  return data as T;
}

async function config<T>(key: string) {
  const { data } = await db.from('config').select('value').eq('key', key).single();
  return data?.value as T;
}

// ---------------------------------------------------------------- rutas

// El vendedor conecta su cuenta: primero lo mandamos a Mercado Pago y después vuelve acá con el código.
async function link(url: URL) {
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state) return backToApp('vender/cobros?mp=error');

  if (!code) {
    const auth = new URL('https://auth.mercadopago.com.ar/authorization');
    auth.searchParams.set('client_id', env('MP_CLIENT_ID'));
    auth.searchParams.set('response_type', 'code');
    auth.searchParams.set('platform_id', 'mp');
    auth.searchParams.set('state', state);
    auth.searchParams.set('redirect_uri', `${FUNCTION_URL}/vincular`);
    return Response.redirect(auth.toString(), 302);
  }

  try {
    const tokens = await oauthToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${FUNCTION_URL}/vincular`,
    });
    await rpc('mp_link_seller', {
      p_state: state,
      p_mp_user_id: String(tokens.user_id),
      p_access_token: await encrypt(tokens.access_token),
      p_refresh_token: await encrypt(tokens.refresh_token),
      p_expires_in: tokens.expires_in,
    });
    return backToApp('vender/cobros?mp=ok');
  } catch (error) {
    console.error('vincular', error);
    return backToApp('vender/cobros?mp=error');
  }
}

type CheckoutOrder = {
  id: string;
  number: number;
  total: number;
  commission: number;
  business_name: string;
  access_token: string;
  items: { title: string; quantity: number; unit_price: number }[];
};

async function pay(req: Request) {
  const user = await currentUser(req);
  const { order_id: orderId } = await req.json();
  const order = await rpc<CheckoutOrder>('mp_order_for_checkout', { p_order_id: orderId, p_customer_id: user.id });

  const items = order.items.map((item) => ({ ...item, currency_id: 'ARS' }));
  const itemsTotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  if (order.total > itemsTotal) {
    items.push({
      title: 'Envío',
      quantity: 1,
      unit_price: Math.round((order.total - itemsTotal) * 100) / 100,
      currency_id: 'ARS',
    });
  }
  const back = `${FUNCTION_URL}/volver?a=${encodeURIComponent(`pedido/${order.id}`)}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const preference = await mp('/checkout/preferences', await decrypt(order.access_token), {
    method: 'POST',
    body: {
      items,
      marketplace_fee: order.commission,
      external_reference: `pedido:${order.id}`,
      statement_descriptor: 'ALGOPACOME',
      notification_url: `${FUNCTION_URL}/webhook?source_news=webhooks`,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
      expires: true,
      expiration_date_to: expiresAt,
      metadata: { order_number: order.number },
    },
  });

  await db.from('payments').delete().eq('order_id', order.id).is('mp_payment_id', null);
  await db.from('payments').insert({
    order_id: order.id,
    mp_preference_id: preference.id,
    amount: order.total,
    marketplace_fee: order.commission,
  });
  return json({ url: preference.init_point });
}

async function startPlus(req: Request) {
  const user = await currentUser(req);
  const business = await ownBusiness(user.id);
  if (business.plan === 'plus') throw new HttpError(400, 'Ya tenés el plan Plus');
  if (!user.email) throw new HttpError(400, 'Tu cuenta no tiene email para la suscripción');

  const price = await config<number>('plus_price_ars');
  const subscription = await mp('/preapproval', env('MP_ACCESS_TOKEN'), {
    method: 'POST',
    body: {
      reason: `Algopacome Plus · ${business.name}`,
      external_reference: business.id,
      payer_email: user.email,
      back_url: `${FUNCTION_URL}/volver?a=${encodeURIComponent('vender/cobros?plus=1')}`,
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: price, currency_id: 'ARS' },
      status: 'pending',
    },
  });
  await rpc('mp_record_subscription', {
    p_business_id: business.id,
    p_preapproval_id: subscription.id,
    p_status: 'pending',
  });
  return json({ url: subscription.init_point });
}

async function cancelPlus(req: Request) {
  const user = await currentUser(req);
  const business = await ownBusiness(user.id);
  const { data: subscriptions } = await db
    .from('subscriptions')
    .select('mp_preapproval_id')
    .eq('business_id', business.id)
    .in('status', ['authorized', 'paused', 'pending']);
  for (const subscription of subscriptions ?? []) {
    const result = await mp(`/preapproval/${subscription.mp_preapproval_id}`, env('MP_ACCESS_TOKEN'), {
      method: 'PUT',
      body: { status: 'cancelled' },
    });
    await rpc('mp_record_subscription', {
      p_business_id: business.id,
      p_preapproval_id: subscription.mp_preapproval_id,
      p_status: result.status,
    });
  }
  return json({ ok: true });
}

async function payDebt(req: Request) {
  const user = await currentUser(req);
  const business = await ownBusiness(user.id);
  const amount = Number(business.cash_commission_debt);
  if (!(amount > 0)) throw new HttpError(400, 'No tenés comisiones pendientes');
  const back = `${FUNCTION_URL}/volver?a=${encodeURIComponent('vender/cobros')}`;
  const preference = await mp('/checkout/preferences', env('MP_ACCESS_TOKEN'), {
    method: 'POST',
    body: {
      items: [
        { title: `Comisiones en efectivo · ${business.name}`, quantity: 1, unit_price: amount, currency_id: 'ARS' },
      ],
      external_reference: `deuda:${business.id}`,
      statement_descriptor: 'ALGOPACOME',
      notification_url: `${FUNCTION_URL}/webhook?source_news=webhooks`,
      back_urls: { success: back, pending: back, failure: back },
      auto_return: 'approved',
    },
  });
  return json({ url: preference.init_point });
}

// Firma de los avisos (si se configuró MP_WEBHOOK_SECRET en el panel de Mercado Pago).
async function validSignature(req: Request, dataId: string) {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  if (!secret) return true;
  const parts = Object.fromEntries(
    (req.headers.get('x-signature') ?? '').split(',').map((part) => part.trim().split('=') as [string, string]),
  );
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${req.headers.get('x-request-id') ?? ''};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)));
  const hex = Array.from(signature, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return hex === parts.v1;
}

async function sellerToken(mpUserId: string | undefined) {
  if (!mpUserId) return null;
  const { data } = await db
    .from('seller_accounts')
    .select('access_token_encrypted')
    .eq('mp_user_id', mpUserId)
    .maybeSingle();
  return data?.access_token_encrypted ? decrypt(data.access_token_encrypted) : null;
}

async function webhook(req: Request, url: URL) {
  const body = await req.json().catch(() => ({}));
  const type: string = body.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic') ?? '';
  const dataId = String(body.data?.id ?? url.searchParams.get('data.id') ?? url.searchParams.get('id') ?? '');
  if (!dataId) return json({ ok: true });
  if (!(await validSignature(req, dataId))) return json({ error: 'firma inválida' }, 401);

  if (type === 'payment') {
    // Los cobros de pedidos son del vendedor; los de la deuda, de NOA Digital.
    const token = (await sellerToken(body.user_id ? String(body.user_id) : undefined)) ?? env('MP_ACCESS_TOKEN');
    const payment = await mp(`/v1/payments/${dataId}`, token);
    const [kind, id] = String(payment.external_reference ?? '').split(':');

    if (kind === 'pedido') {
      const fee = (payment.fee_details ?? [])
        .filter((detail: { type: string }) => detail.type === 'application_fee')
        .reduce((sum: number, detail: { amount: number }) => sum + detail.amount, 0);
      const result = await rpc<string>('mp_record_payment', {
        p_order_id: id,
        p_mp_payment_id: String(payment.id),
        p_status: payment.status,
        p_amount: payment.transaction_amount,
        p_fee: fee,
        p_collector_id: String(payment.collector_id),
        p_raw: {
          id: payment.id,
          status: payment.status,
          status_detail: payment.status_detail,
          payment_method_id: payment.payment_method_id,
          date_approved: payment.date_approved,
        },
      });
      console.log('pago', payment.id, payment.status, result);
      if (result === 'se devuelve') await processRefunds();
    } else if (kind === 'deuda' && payment.status === 'approved') {
      await rpc('mp_record_debt_payment', {
        p_business_id: id,
        p_mp_payment_id: String(payment.id),
        p_amount: payment.transaction_amount,
      });
    }
  } else if (type === 'subscription_preapproval') {
    const subscription = await mp(`/preapproval/${dataId}`, env('MP_ACCESS_TOKEN'));
    await rpc('mp_record_subscription', {
      p_business_id: subscription.external_reference,
      p_preapproval_id: subscription.id,
      p_status: subscription.status,
      p_next_charge: subscription.next_payment_date ?? null,
    });
  }
  return json({ ok: true });
}

async function processRefunds() {
  const due = await rpc<{ payment_id: string; mp_payment_id: string; access_token: string }[]>('mp_refunds_due', {});
  for (const refund of due ?? []) {
    try {
      await mp(`/v1/payments/${refund.mp_payment_id}/refunds`, await decrypt(refund.access_token), {
        method: 'POST',
        body: {},
        idempotencyKey: `reembolso-${refund.payment_id}`,
      });
      await rpc('mp_mark_refund', { p_payment_id: refund.payment_id, p_ok: true });
    } catch (error) {
      await rpc('mp_mark_refund', { p_payment_id: refund.payment_id, p_ok: false, p_error: String(error) });
    }
  }
  return due?.length ?? 0;
}

// Los tokens de los vendedores duran unos 6 meses: se renuevan con un mes de margen.
async function refreshTokens() {
  const limit = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: accounts } = await db
    .from('seller_accounts')
    .select('business_id, refresh_token_encrypted')
    .lt('token_expires_at', limit)
    .not('refresh_token_encrypted', 'is', null);
  for (const account of accounts ?? []) {
    try {
      const tokens = await oauthToken({
        grant_type: 'refresh_token',
        refresh_token: await decrypt(account.refresh_token_encrypted),
      });
      await db
        .from('seller_accounts')
        .update({
          access_token_encrypted: await encrypt(tokens.access_token),
          refresh_token_encrypted: await encrypt(tokens.refresh_token),
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        })
        .eq('business_id', account.business_id);
    } catch (error) {
      console.error('renovar token', account.business_id, error);
    }
  }
}

function back(url: URL) {
  const target = url.searchParams.get('a') ?? '';
  // Solo rutas propias de la app.
  return backToApp(/^(pedido\/[0-9a-f-]{36}|vender\/cobros(\?[a-z]+=[a-z0-9]+)?)$/.test(target) ? target : '');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const route = url.pathname.split('/').filter(Boolean).pop();
  try {
    switch (route) {
      case 'vincular':
        return await link(url);
      case 'volver':
        return back(url);
      case 'pagar':
        return await pay(req);
      case 'plus':
        return await startPlus(req);
      case 'cancelar-plus':
        return await cancelPlus(req);
      case 'deuda':
        return await payDebt(req);
      case 'webhook':
        return await webhook(req, url);
      case 'procesar':
        await refreshTokens();
        return json({ refunds: await processRefunds() });
      default:
        return json({ error: 'Ruta desconocida' }, 404);
    }
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: 'Algo salió mal. Probá de nuevo.' }, 500);
  }
});
