import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChoiceChips } from '@/components/choice-chips';
import { DeliveryEditor, type DeliveryForm } from '@/components/delivery-editor';
import { HoursEditor } from '@/components/hours-editor';
import { Icon } from '@/components/icon';
import { LocationField } from '@/components/location-field';
import { PhotoPicker } from '@/components/photo-picker';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  BUSINESS_TYPES,
  DEFAULT_DELIVERY,
  deliveryToForm,
  EMPTY_WEEK,
  formToDelivery,
  friendlyError,
  isValidTaxId,
  rowsFromWeek,
  validateWeek,
  type WeekHours,
} from '@/lib/business';
import { uploadImage } from '@/lib/media';
import { normalizeArgentinePhone } from '@/lib/phone';
import { supabase } from '@/lib/supabase';
import type { BusinessType } from '@/lib/types';
import { useMyBusiness } from '@/providers/my-business';

const STEPS = ['Tu negocio', 'Contacto y ubicación', 'Fotos', 'Horarios y entrega'];

// Alta del negocio en 4 pasos. Se guarda todo junto al final; Mercado Pago se vincula en la semana 5.
export default function NewBusinessScreen() {
  const theme = useTheme();
  const { refresh } = useMyBusiness();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [type, setType] = useState<BusinessType | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappIsPhone, setWhatsappIsPhone] = useState(true);
  const [whatsapp, setWhatsapp] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [week, setWeek] = useState<WeekHours>(EMPTY_WEEK);
  const [delivery, setDelivery] = useState<DeliveryForm>(deliveryToForm(DEFAULT_DELIVERY));
  const [acceptsCash, setAcceptsCash] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);

  // Revisa el paso actual; devuelve el error a mostrar o null.
  function validateStep(): string | null {
    if (step === 0) {
      if (!type) return 'Elegí si es un puesto, un carrito o un local.';
      if (name.trim().length < 2) return 'Poné el nombre de tu negocio.';
    }
    if (step === 1) {
      if (!normalizeArgentinePhone(phone)) return 'Revisá el teléfono: código de área y número, sin el 0 ni el 15.';
      if (!whatsappIsPhone && whatsapp.trim() && !normalizeArgentinePhone(whatsapp)) return 'Revisá el WhatsApp.';
      if (!isValidTaxId(taxId)) return 'Poné tu CUIT o DNI, solo números.';
      if (!address.trim()) return 'Escribí la dirección o una referencia de dónde estás.';
    }
    if (step === 3) {
      if (rowsFromWeek(week).length === 0) return 'Marcá al menos un día de atención.';
      const weekError = validateWeek(week);
      if (weekError) return weekError;
      const deliveryResult = formToDelivery(delivery);
      if ('error' in deliveryResult) return deliveryResult.error;
      if (!acceptedRules) return 'Tenés que aceptar las reglas de convivencia.';
    }
    return null;
  }

  function next() {
    const stepError = validateStep();
    setError(stepError);
    if (stepError) return;
    if (step < STEPS.length - 1) setStep(step + 1);
    else create();
  }

  function back() {
    setError(null);
    if (step === 0) router.back();
    else setStep(step - 1);
  }

  async function create() {
    const deliveryResult = formToDelivery(delivery);
    if ('error' in deliveryResult || !type) return;
    const normalizedPhone = normalizeArgentinePhone(phone);

    setIsSaving(true);
    const { data: businessId, error: createError } = await supabase.rpc('create_business', {
      p_name: name.trim(),
      p_type: type,
      p_phone: normalizedPhone,
      p_tax_id: taxId,
      p_description: description.trim(),
      p_ingredients: ingredients.trim(),
      p_whatsapp: whatsappIsPhone ? normalizedPhone : normalizeArgentinePhone(whatsapp),
      p_address: address.trim(),
      p_lat: coordinates?.lat ?? null,
      p_lng: coordinates?.lng ?? null,
      p_accepts_cash: acceptsCash,
      p_hours: rowsFromWeek(week),
      p_delivery: deliveryResult.delivery,
    });
    if (createError || !businessId) {
      setIsSaving(false);
      setError(friendlyError(createError, 'No pudimos crear tu negocio. Probá de nuevo.'));
      return;
    }

    // Las fotos se suben después porque la carpeta lleva el id del negocio.
    try {
      const [logoPath, coverPath] = await Promise.all([
        logoUri ? uploadImage('business-media', businessId, 'logo', logoUri) : null,
        coverUri ? uploadImage('business-media', businessId, 'portada', coverUri) : null,
      ]);
      if (logoPath || coverPath) {
        await supabase.from('businesses').update({ logo_path: logoPath, cover_path: coverPath }).eq('id', businessId);
      }
    } catch (uploadError) {
      // El negocio ya quedó creado; las fotos se pueden cargar desde "Editar datos".
      console.warn('No se pudieron subir las fotos', uploadError);
    }

    await refresh();
    setIsSaving(false);
    router.replace('/vender');
  }

  return (
    // La clave por paso vuelve el scroll arriba al avanzar.
    <Screen
      key={step}
      header={
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={back}
            style={[styles.back, { backgroundColor: theme.background }]}>
            <Icon sf="chevron.left" md="arrow_back" size={22} color={theme.text} />
          </Pressable>
          <ThemedText type="small" style={{ color: theme.onPrimary }}>
            Paso {step + 1} de {STEPS.length}
          </ThemedText>
          <ThemedText type="subtitle" style={{ color: theme.onPrimary }}>
            {STEPS[step]}
          </ThemedText>
          <View style={styles.progress}>
            {STEPS.map((stepName, index) => (
              <View
                key={stepName}
                style={[
                  styles.progressPart,
                  { backgroundColor: index <= step ? theme.background : 'rgba(255,255,255,0.35)' },
                ]}
              />
            ))}
          </View>
        </>
      }>
      {step === 0 ? (
        <>
          <ChoiceChips
            label="¿Qué tipo de negocio es?"
            options={BUSINESS_TYPES}
            value={type}
            onChange={setType}
          />
          <TextField label="Nombre del negocio" placeholder="Lo de Coco" value={name} onChangeText={setName} maxLength={60} />
          <TextField
            label="Descripción"
            placeholder="Sánguches de milanesa y lomitos al paso"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={600}
            style={styles.multiline}
          />
          <TextField
            label="Ingredientes e insumos (opcional)"
            placeholder="Pan casero, carne vacuna, verduras frescas"
            value={ingredients}
            onChangeText={setIngredients}
            multiline
            maxLength={600}
            style={styles.multiline}
          />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <TextField
            label="Teléfono del negocio"
            placeholder="388 412 3456"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <SwitchRow
            label="Mi WhatsApp es el mismo número"
            value={whatsappIsPhone}
            onValueChange={setWhatsappIsPhone}
          />
          {!whatsappIsPhone ? (
            <TextField
              label="WhatsApp (opcional)"
              placeholder="388 412 3456"
              keyboardType="phone-pad"
              value={whatsapp}
              onChangeText={setWhatsapp}
            />
          ) : null}
          <TextField
            label="CUIT o DNI del titular"
            placeholder="20123456789"
            keyboardType="number-pad"
            value={taxId}
            onChangeText={setTaxId}
          />
          <ThemedText type="small" themeColor="textSecondary">
            No se muestra a nadie: lo usamos solo para evitar cuentas duplicadas.
          </ThemedText>
          <LocationField
            address={address}
            hasCoordinates={!!coordinates}
            onAddressChange={setAddress}
            onLocate={(lat, lng) => setCoordinates({ lat, lng })}
          />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <ThemedText themeColor="textSecondary">
            Con fotos propias vendés más. Podés saltear este paso y cargarlas después.
          </ThemedText>
          <PhotoPicker label="Logo" uri={logoUri} shape="square" onPick={setLogoUri} />
          <PhotoPicker
            label="Portada"
            hint="Una foto linda de tu puesto, carrito o local."
            uri={coverUri}
            shape="wide"
            onPick={setCoverUri}
          />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <ThemedText type="heading">¿Qué días y horarios atendés?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Si cerrás pasada la medianoche, poné por ejemplo de 20:00 a 02:00.
          </ThemedText>
          <HoursEditor week={week} onChange={setWeek} />
          <ThemedText type="heading">¿Cómo entregás?</ThemedText>
          <DeliveryEditor value={delivery} onChange={setDelivery} />
          <SwitchRow
            label="Acepto efectivo"
            description="Además de Mercado Pago. Podés cambiarlo cuando quieras."
            value={acceptsCash}
            onValueChange={setAcceptsCash}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedRules }}
            onPress={() => setAcceptedRules((value) => !value)}
            style={[styles.rules, { borderColor: theme.border }]}>
            <View
              style={[
                styles.checkbox,
                {
                  borderColor: acceptedRules ? theme.accent : theme.text,
                  backgroundColor: acceptedRules ? theme.accent : 'transparent',
                },
              ]}>
              {acceptedRules ? <Icon sf="checkmark" md="check" size={18} color={theme.onAccent} /> : null}
            </View>
            <ThemedText type="small" style={styles.flex}>
              Acepto las reglas de convivencia: fotos y datos reales, precios reales y un solo negocio por persona.
            </ThemedText>
          </Pressable>
        </>
      ) : null}

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}

      <Button
        title={step === STEPS.length - 1 ? 'Crear mi negocio' : step === 2 && !logoUri && !coverUri ? 'Saltear' : 'Siguiente'}
        onPress={next}
        loading={isSaving}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  progressPart: {
    flex: 1,
    height: 6,
    borderRadius: Radius.pill,
  },
  multiline: {
    minHeight: 96,
    paddingTop: Spacing.three,
    textAlignVertical: 'top',
  },
  rules: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1.5,
    borderRadius: Radius.card,
    padding: Spacing.three,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
