import { StyleSheet, View } from 'react-native';

import { ChoiceChips } from '@/components/choice-chips';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { Spacing } from '@/constants/theme';
import type { DeliveryFeeMode } from '@/lib/types';

// Los montos van como texto mientras se escriben; se convierten al guardar.
export type DeliveryForm = {
  offers_pickup: boolean;
  offers_delivery: boolean;
  fee_mode: DeliveryFeeMode;
  fee: string;
  free_over: string;
  radius_km: string;
  eta_min_minutes: string;
  eta_max_minutes: string;
};

const FEE_MODES: { value: DeliveryFeeMode; label: string }[] = [
  { value: 'fixed', label: 'Costo fijo' },
  { value: 'included', label: 'Incluido en el precio' },
  { value: 'free_over', label: 'Gratis desde un monto' },
];

type DeliveryEditorProps = {
  value: DeliveryForm;
  onChange: (value: DeliveryForm) => void;
};

export function DeliveryEditor({ value, onChange }: DeliveryEditorProps) {
  const set = <K extends keyof DeliveryForm>(key: K, next: DeliveryForm[K]) => onChange({ ...value, [key]: next });

  return (
    <View style={styles.container}>
      <SwitchRow
        label="Retiro en el lugar"
        description="El cliente pasa a buscar su pedido."
        value={value.offers_pickup}
        onValueChange={(next) => set('offers_pickup', next)}
      />
      <SwitchRow
        label="Delivery"
        description="Llevás el pedido a domicilio."
        value={value.offers_delivery}
        onValueChange={(next) => set('offers_delivery', next)}
      />
      {value.offers_delivery ? (
        <>
          <ChoiceChips label="Costo del envío" options={FEE_MODES} value={value.fee_mode} onChange={(next) => set('fee_mode', next)} />
          {value.fee_mode !== 'included' ? (
            <TextField
              label="Costo del envío ($)"
              placeholder="800"
              keyboardType="number-pad"
              value={value.fee}
              onChangeText={(next) => set('fee', next)}
            />
          ) : null}
          {value.fee_mode === 'free_over' ? (
            <TextField
              label="Envío gratis en pedidos desde ($)"
              placeholder="10000"
              keyboardType="number-pad"
              value={value.free_over}
              onChangeText={(next) => set('free_over', next)}
            />
          ) : null}
          <TextField
            label="Hasta cuántos km llevás"
            placeholder="3"
            keyboardType="decimal-pad"
            value={value.radius_km}
            onChangeText={(next) => set('radius_km', next)}
          />
        </>
      ) : null}
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Demora mínima (min)"
            placeholder="20"
            keyboardType="number-pad"
            value={value.eta_min_minutes}
            onChangeText={(next) => set('eta_min_minutes', next)}
          />
        </View>
        <View style={styles.flex}>
          <TextField
            label="Demora máxima (min)"
            placeholder="45"
            keyboardType="number-pad"
            value={value.eta_max_minutes}
            onChangeText={(next) => set('eta_max_minutes', next)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  flex: {
    flex: 1,
  },
});
