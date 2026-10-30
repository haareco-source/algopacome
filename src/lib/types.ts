// Tipos de las tablas que usa la app. Cuando el proyecto de Supabase esté creado,
// se pueden generar completos con `npx supabase gen types typescript`.

export type UserRole = 'customer' | 'moderator' | 'admin';
export type AccountStatus = 'active' | 'suspended' | 'banned';

export type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: AccountStatus;
  accepted_rules_at: string | null;
};
