import type { Order, OrderStatus } from '@/lib/types';

export const ORDER_COLUMNS =
  'id, number, customer_id, business_id, type, delivery_address, contact_phone, subtotal, delivery_fee, total, payment_method, status, notes, eta_minutes, scheduled_for, accept_by, status_changed_at, created_at, order_items (id, product_id, product_name, unit_price, quantity, note)';

export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: 'Esperando el pago',
  new: 'Esperando que lo acepten',
  accepted: 'Aceptado',
  preparing: 'En preparación',
  ready: 'Listo',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  rejected: 'Rechazado',
  expired: 'Vencido',
  cancelled: 'Cancelado',
};

export type StatusTone = 'waiting' | 'active' | 'done' | 'failed';

export function statusTone(status: OrderStatus): StatusTone {
  if (status === 'awaiting_payment' || status === 'new') return 'waiting';
  if (status === 'delivered') return 'done';
  if (status === 'rejected' || status === 'expired' || status === 'cancelled') return 'failed';
  return 'active';
}

export function isFinished(status: OrderStatus) {
  return statusTone(status) === 'done' || statusTone(status) === 'failed';
}

// Pasos que ve el cliente en el seguimiento.
export function trackingSteps(order: Pick<Order, 'type' | 'scheduled_for'>): OrderStatus[] {
  return [
    'new',
    ...(order.scheduled_for ? (['accepted'] as const) : []),
    'preparing',
    'ready',
    ...(order.type === 'delivery' ? (['on_the_way'] as const) : []),
    'delivered',
  ];
}

// Próximo paso del vendedor con su botón.
export function sellerNextStep(
  order: Pick<Order, 'status' | 'type' | 'scheduled_for'>,
): { status: OrderStatus; label: string } | null {
  switch (order.status) {
    case 'new':
      return order.scheduled_for
        ? { status: 'accepted', label: 'Aceptar pedido' }
        : { status: 'preparing', label: 'Aceptar y preparar' };
    case 'accepted':
      return { status: 'preparing', label: 'Empezar a preparar' };
    case 'preparing':
      return { status: 'ready', label: 'Marcar como listo' };
    case 'ready':
      return order.type === 'delivery'
        ? { status: 'on_the_way', label: 'Salió el delivery' }
        : { status: 'delivered', label: 'Ya lo retiró' };
    case 'on_the_way':
      return { status: 'delivered', label: 'Entregado' };
    default:
      return null;
  }
}

const TIME_ZONE = 'America/Argentina/Jujuy';

export function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: TIME_ZONE,
  });
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  const sameDay =
    date.toLocaleDateString('es-AR', { timeZone: TIME_ZONE }) ===
    new Date().toLocaleDateString('es-AR', { timeZone: TIME_ZONE });
  const day = sameDay
    ? 'Hoy'
    : date.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TIME_ZONE });
  return `${day} ${formatTime(value)}`;
}

// "Hoy" en la zona del negocio, para agrupar la agenda.
export function localDay(value: string | Date) {
  return new Date(value).toLocaleDateString('es-AR', { timeZone: TIME_ZONE });
}

export function minutesLeft(until: string | null) {
  if (!until) return null;
  return Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 60000));
}

export function itemCount(order: Pick<Order, 'order_items'>) {
  return order.order_items.reduce((sum, item) => sum + item.quantity, 0);
}
