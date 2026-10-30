import type { DeliveryForm } from '@/components/delivery-editor';
import type { BusinessHour, BusinessType, DeliverySettings } from '@/lib/types';

export const BUSINESS_TYPES: { value: BusinessType; label: string; emoji: string }[] = [
  { value: 'puesto', label: 'Puesto', emoji: '🏕️' },
  { value: 'carrito', label: 'Carrito', emoji: '🛒' },
  { value: 'local', label: 'Local', emoji: '🏪' },
];

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Orden de la semana que se muestra: lunes primero.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DEFAULT_DELIVERY: DeliverySettings = {
  offers_delivery: false,
  offers_pickup: true,
  fee_mode: 'fixed',
  fee: 0,
  free_over: null,
  radius_km: 3,
  eta_min_minutes: 20,
  eta_max_minutes: 45,
};

// Un horario por día; null = cerrado ese día.
export type WeekHours = (Pick<BusinessHour, 'opens_at' | 'closes_at'> | null)[];

export const EMPTY_WEEK: WeekHours = [null, null, null, null, null, null, null];

export function weekFromRows(rows: BusinessHour[]): WeekHours {
  const week = [...EMPTY_WEEK];
  for (const row of rows) {
    week[row.weekday] = { opens_at: row.opens_at.slice(0, 5), closes_at: row.closes_at.slice(0, 5) };
  }
  return week;
}

export function rowsFromWeek(week: WeekHours): BusinessHour[] {
  return week.flatMap((day, weekday) => (day ? [{ weekday, ...day }] : []));
}

export function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Devuelve el primer problema de los horarios, o null si están bien.
export function validateWeek(week: WeekHours): string | null {
  for (const weekday of WEEK_ORDER) {
    const day = week[weekday];
    if (!day) continue;
    if (!isValidTime(day.opens_at) || !isValidTime(day.closes_at)) {
      return `Revisá el horario del ${WEEKDAYS[weekday].toLowerCase()}: usá el formato 19:30.`;
    }
    if (day.opens_at === day.closes_at) {
      return `El ${WEEKDAYS[weekday].toLowerCase()} abre y cierra a la misma hora.`;
    }
  }
  return null;
}

// CUIT (11 dígitos) o DNI (7 u 8).
export function isValidTaxId(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 11 && digits.length !== 9 && digits.length !== 10;
}

export function formatPrice(value: number) {
  return `$ ${Math.round(value).toLocaleString('es-AR')}`;
}

// Acepta "4.500", "4500", "4500,50".
export function parsePrice(value: string): number | null {
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '');
  const price = Number(normalized);
  return normalized && Number.isFinite(price) && price > 0 ? price : null;
}

// Pasa los errores de la base a un mensaje para el vendedor.
export function friendlyError(error: { message?: string; hint?: string; code?: string } | null, fallback: string) {
  if (!error?.message) return fallback;
  // Los mensajes que arma la base ya están en castellano y pensados para mostrarse.
  if (error.code === 'P0001' || error.code === '23514' || error.code === '23505' || error.code === '42501') {
    if (/duplicate key|violates/.test(error.message)) return fallback;
    return error.message;
  }
  return fallback;
}

export function deliveryToForm(delivery: DeliverySettings): DeliveryForm {
  return {
    offers_pickup: delivery.offers_pickup,
    offers_delivery: delivery.offers_delivery,
    fee_mode: delivery.fee_mode,
    fee: delivery.fee ? String(Math.round(delivery.fee)) : '',
    free_over: delivery.free_over ? String(Math.round(delivery.free_over)) : '',
    radius_km: String(delivery.radius_km),
    eta_min_minutes: String(delivery.eta_min_minutes),
    eta_max_minutes: String(delivery.eta_max_minutes),
  };
}

// Convierte y valida el formulario de entrega; devuelve el error para mostrar o los datos para guardar.
export function formToDelivery(form: DeliveryForm): { error: string } | { delivery: DeliverySettings } {
  if (!form.offers_pickup && !form.offers_delivery) {
    return { error: 'Elegí al menos retiro en el lugar o delivery.' };
  }
  const number = (value: string) => Number(value.replace(',', '.'));
  const etaMin = number(form.eta_min_minutes);
  const etaMax = number(form.eta_max_minutes);
  if (!Number.isInteger(etaMin) || !Number.isInteger(etaMax) || etaMin <= 0 || etaMax < etaMin) {
    return { error: 'Revisá la demora: la máxima tiene que ser igual o mayor que la mínima.' };
  }
  const fee = form.offers_delivery && form.fee_mode !== 'included' ? number(form.fee || '0') : 0;
  const freeOver = form.offers_delivery && form.fee_mode === 'free_over' ? number(form.free_over) : null;
  const radius = form.offers_delivery ? number(form.radius_km) : DEFAULT_DELIVERY.radius_km;
  if (!Number.isFinite(fee) || fee < 0 || (freeOver !== null && !(freeOver > 0)) || !(radius > 0)) {
    return { error: 'Revisá el costo, el monto para envío gratis y los km.' };
  }
  return {
    delivery: {
      offers_pickup: form.offers_pickup,
      offers_delivery: form.offers_delivery,
      fee_mode: form.fee_mode,
      fee,
      free_over: freeOver,
      radius_km: radius,
      eta_min_minutes: etaMin,
      eta_max_minutes: etaMax,
    },
  };
}
