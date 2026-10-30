import * as Location from 'expo-location';

export type Place = { lat: number; lng: number; address: string | null };

// Ubicación actual del celular y, si se puede, la dirección aproximada.
export async function getCurrentPlace(): Promise<Place | 'denied'> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return 'denied';

  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  const { latitude: lat, longitude: lng } = position.coords;

  let address: string | null = null;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (place) {
      const street = [place.street, place.streetNumber].filter(Boolean).join(' ');
      address = [street, place.district ?? place.city].filter(Boolean).join(', ') || null;
    }
  } catch {
    // Sin dirección aproximada: el vendedor la escribe.
  }
  return { lat, lng, address };
}
