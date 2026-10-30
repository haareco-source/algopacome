import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getCurrentPlace } from '@/lib/location';

type LocationFieldProps = {
  address: string;
  hasCoordinates: boolean;
  onAddressChange: (address: string) => void;
  onLocate: (lat: number, lng: number) => void;
};

// Dirección escrita más el punto exacto tomado del GPS del celular, parado en el negocio.
export function LocationField({ address, hasCoordinates, onAddressChange, onLocate }: LocationFieldProps) {
  const theme = useTheme();
  const [isLocating, setIsLocating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function locate() {
    setIsLocating(true);
    setMessage(null);
    try {
      const place = await getCurrentPlace();
      if (place === 'denied') {
        setMessage('Necesitamos permiso de ubicación. Podés darlo desde los ajustes del celular.');
        return;
      }
      onLocate(place.lat, place.lng);
      if (place.address && !address.trim()) onAddressChange(place.address);
    } catch {
      setMessage('No pudimos tomar la ubicación. Revisá que el GPS esté prendido.');
    } finally {
      setIsLocating(false);
    }
  }

  return (
    <View style={styles.container}>
      <TextField
        label="Dirección"
        placeholder="Av. San Martín 123, barrio Centro"
        value={address}
        onChangeText={onAddressChange}
      />
      <Button
        title={hasCoordinates ? 'Actualizar ubicación' : 'Usar mi ubicación actual'}
        variant="outline"
        icon={<Icon sf="location.fill" md="my_location" size={20} color={theme.text} />}
        onPress={locate}
        loading={isLocating}
      />
      {hasCoordinates ? (
        <View style={styles.row}>
          <Icon sf="checkmark.circle.fill" md="check_circle" size={20} color={theme.accent} />
          <ThemedText type="small" style={{ color: theme.accent }}>
            Ubicación guardada
          </ThemedText>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Tocalo parado en tu puesto o local, así los clientes te encuentran en el mapa.
        </ThemedText>
      )}
      {message ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {message}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
