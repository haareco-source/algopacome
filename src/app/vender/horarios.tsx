import { router } from 'expo-router';
import { useState } from 'react';

import { BackHeader } from '@/components/back-header';
import { Button } from '@/components/button';
import { DeliveryEditor } from '@/components/delivery-editor';
import { HoursEditor } from '@/components/hours-editor';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import {
  deliveryToForm,
  formToDelivery,
  friendlyError,
  rowsFromWeek,
  validateWeek,
  weekFromRows,
} from '@/lib/business';
import { supabase } from '@/lib/supabase';
import { useMyBusiness } from '@/providers/my-business';

export default function HoursScreen() {
  const { business } = useMyBusiness();
  // El formulario arranca cuando el negocio ya está cargado, para tomar sus valores.
  if (!business) return null;
  return <HoursForm businessId={business.id} />;
}

function HoursForm({ businessId }: { businessId: string }) {
  const theme = useTheme();
  const { business, hours, delivery, refresh } = useMyBusiness();
  const [acceptsScheduled, setAcceptsScheduled] = useState(!!business?.accepts_scheduled);
  const [dailyLimit, setDailyLimit] = useState(
    business?.scheduled_daily_limit ? String(business.scheduled_daily_limit) : '',
  );
  const [week, setWeek] = useState(() => weekFromRows(hours));
  const [deliveryForm, setDeliveryForm] = useState(() => deliveryToForm(delivery));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    const weekError = validateWeek(week);
    if (weekError) return setError(weekError);
    const deliveryResult = formToDelivery(deliveryForm);
    if ('error' in deliveryResult) return setError(deliveryResult.error);
    const limit = dailyLimit.trim() ? Number(dailyLimit) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1 || limit > 500)) {
      return setError('El tope de pedidos programados tiene que ser un número entre 1 y 500, o quedar vacío.');
    }
    setError(null);
    setIsSaving(true);

    const [hoursResult, deliveryResultSave, scheduledResult] = await Promise.all([
      supabase.rpc('set_business_hours', { p_business_id: businessId, p_hours: rowsFromWeek(week) }),
      supabase.rpc('set_delivery_settings', { p_business_id: businessId, p_delivery: deliveryResult.delivery }),
      supabase
        .from('businesses')
        .update({ accepts_scheduled: acceptsScheduled, scheduled_daily_limit: limit })
        .eq('id', businessId),
    ]);
    setIsSaving(false);
    const saveError = hoursResult.error ?? deliveryResultSave.error ?? scheduledResult.error;
    if (saveError) {
      setError(friendlyError(saveError, 'No pudimos guardar los cambios. Probá de nuevo.'));
      return;
    }
    await refresh();
    router.back();
  }

  return (
    <Screen>
      <BackHeader title="Horarios, entrega y programados" />
      <ThemedText type="small" themeColor="textSecondary">
        Si cerrás pasada la medianoche, poné por ejemplo de 20:00 a 02:00.
      </ThemedText>
      <HoursEditor week={week} onChange={setWeek} />
      <ThemedText type="heading">¿Cómo entregás?</ThemedText>
      <DeliveryEditor value={deliveryForm} onChange={setDeliveryForm} />
      <ThemedText type="heading">Pedidos programados</ThemedText>
      <SwitchRow
        label="Acepto pedidos programados"
        description="El cliente elige un horario de hoy y paga por adelantado. Vos lo aceptás antes; si no, se cancela y se le devuelve el dinero."
        value={acceptsScheduled}
        onValueChange={setAcceptsScheduled}
      />
      {acceptsScheduled ? (
        <TextField
          label="Tope de pedidos programados por día (opcional)"
          value={dailyLimit}
          onChangeText={setDailyLimit}
          placeholder="Sin tope"
          keyboardType="number-pad"
        />
      ) : null}
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
      <Button title="Guardar cambios" onPress={save} loading={isSaving} />
    </Screen>
  );
}
