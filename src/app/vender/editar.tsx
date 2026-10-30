import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { Button } from '@/components/button';
import { ChoiceChips } from '@/components/choice-chips';
import { LocationField } from '@/components/location-field';
import { PhotoPicker } from '@/components/photo-picker';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { BUSINESS_TYPES } from '@/lib/business';
import { publicUrl, removeImage, uploadImage } from '@/lib/media';
import { normalizeArgentinePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import type { Business, BusinessType } from '@/lib/types';
import { useMyBusiness } from '@/providers/my-business';

// Muestra el teléfono guardado (+5493884123456) como lo escribe la gente (3884123456).
function localPhone(phone: string | null) {
  return phone?.replace(/^\+549/, '') ?? '';
}

export default function EditBusinessScreen() {
  const { business } = useMyBusiness();
  if (!business) return null;
  return <EditBusinessForm business={business} />;
}

function EditBusinessForm({ business }: { business: Business }) {
  const theme = useTheme();
  const { refresh } = useMyBusiness();
  const [type, setType] = useState<BusinessType>(business.type);
  const [name, setName] = useState(business.name);
  const [description, setDescription] = useState(business.description);
  const [ingredients, setIngredients] = useState(business.ingredients);
  const [phone, setPhone] = useState(localPhone(business.phone));
  const [whatsapp, setWhatsapp] = useState(localPhone(business.whatsapp));
  const [address, setAddress] = useState(business.address);
  const [coordinates, setCoordinates] = useState(
    business.lat !== null && business.lng !== null ? { lat: business.lat, lng: business.lng } : null,
  );
  const [acceptsCash, setAcceptsCash] = useState(business.accepts_cash);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function save() {
    const normalizedPhone = normalizeArgentinePhone(phone);
    if (name.trim().length < 2) return setError('Poné el nombre de tu negocio.');
    if (!normalizedPhone) return setError('Revisá el teléfono: código de área y número, sin el 0 ni el 15.');
    if (whatsapp.trim() && !normalizeArgentinePhone(whatsapp)) return setError('Revisá el WhatsApp.');
    if (!address.trim()) return setError('Escribí la dirección o una referencia de dónde estás.');
    setError(null);
    setIsSaving(true);

    try {
      const [logoPath, coverPath] = await Promise.all([
        logoUri ? uploadImage('business-media', business.id, 'logo', logoUri) : null,
        coverUri ? uploadImage('business-media', business.id, 'portada', coverUri) : null,
      ]);
      const { error: saveError } = await supabase
        .from('businesses')
        .update({
          type,
          name: name.trim(),
          description: description.trim(),
          ingredients: ingredients.trim(),
          phone: normalizedPhone,
          whatsapp: whatsapp.trim() ? normalizeArgentinePhone(whatsapp) : null,
          address: address.trim(),
          lat: coordinates?.lat ?? null,
          lng: coordinates?.lng ?? null,
          accepts_cash: acceptsCash,
          ...(logoPath ? { logo_path: logoPath } : {}),
          ...(coverPath ? { cover_path: coverPath } : {}),
        })
        .eq('id', business.id);
      if (saveError) {
        setError(
          saveError.message.includes('businesses_phone_key')
            ? 'Ese teléfono ya está en otro negocio.'
            : 'No pudimos guardar los cambios. Probá de nuevo.',
        );
        return;
      }
      if (logoPath) await removeImage('business-media', business.logo_path);
      if (coverPath) await removeImage('business-media', business.cover_path);
      await refresh();
      router.back();
    } catch {
      setError('No pudimos subir las fotos. Revisá la conexión y probá de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Screen>
      <BackHeader title="Datos del negocio" />
      <PhotoPicker
        label="Logo"
        uri={logoUri ?? publicUrl('business-media', business.logo_path)}
        shape="square"
        onPick={setLogoUri}
      />
      <PhotoPicker
        label="Portada"
        uri={coverUri ?? publicUrl('business-media', business.cover_path)}
        shape="wide"
        onPick={setCoverUri}
      />
      <ChoiceChips label="Tipo de negocio" options={BUSINESS_TYPES} value={type} onChange={setType} />
      <TextField label="Nombre del negocio" value={name} onChangeText={setName} maxLength={60} />
      <TextField
        label="Descripción"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={600}
        style={styles.multiline}
      />
      <TextField
        label="Ingredientes e insumos"
        value={ingredients}
        onChangeText={setIngredients}
        multiline
        maxLength={600}
        style={styles.multiline}
      />
      <TextField label="Teléfono" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <TextField label="WhatsApp (opcional)" keyboardType="phone-pad" value={whatsapp} onChangeText={setWhatsapp} />
      <LocationField
        address={address}
        hasCoordinates={!!coordinates}
        onAddressChange={setAddress}
        onLocate={(lat, lng) => setCoordinates({ lat, lng })}
      />
      <SwitchRow
        label="Acepto efectivo"
        description="Además de Mercado Pago."
        value={acceptsCash}
        onValueChange={setAcceptsCash}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
      <Button title="Guardar cambios" onPress={save} loading={isSaving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  multiline: {
    minHeight: 96,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
});
