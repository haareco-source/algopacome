// Normaliza un celular argentino al formato E.164 que usa Supabase Auth (+549...).
// Acepta "388 412-3456", "0388 15 412 3456", "+54 9 388 4123456", etc.
export function normalizeArgentinePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');

  if (digits.startsWith('54')) digits = digits.slice(2);
  if (digits.startsWith('9')) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = digits.slice(1);

  // Saca el "15" que va después del código de área (2 a 4 dígitos).
  for (const areaLength of [4, 3, 2]) {
    if (digits.length === 12 && digits.slice(areaLength, areaLength + 2) === '15') {
      digits = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
      break;
    }
  }

  if (digits.length !== 10) return null;
  return `+549${digits}`;
}
