import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';

import { BackHeader } from '@/components/back-header';
import { Button } from '@/components/button';
import { ChoiceChips } from '@/components/choice-chips';
import { PhotoPicker } from '@/components/photo-picker';
import { Screen } from '@/components/screen';
import { SwitchRow } from '@/components/switch-row';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatUnitPrice, friendlyError, parsePrice, SALE_UNITS } from '@/lib/business';
import { publicUrl, removeImage, uploadImage } from '@/lib/media';
import { supabase } from '@/lib/supabase';
import type { Product, SaleUnit } from '@/lib/types';
import { useMyBusiness } from '@/providers/my-business';

// Alta y edición de un producto. Sin id en la ruta, es uno nuevo.
export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { business, products } = useMyBusiness();
  const product = products.find((item) => item.id === id) ?? null;
  // El formulario arranca cuando el producto ya está cargado, para tomar sus valores.
  if (!business || (id && !product)) return null;
  return <ProductForm businessId={business.id} product={product} />;
}

function ProductForm({ businessId, product }: { businessId: string; product: Product | null }) {
  const theme = useTheme();
  const { categories, refresh } = useMyBusiness();

  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [price, setPrice] = useState(product ? String(Math.round(product.price)) : '');
  const [saleUnit, setSaleUnit] = useState<SaleUnit>(product?.sale_unit ?? 'unidad');
  const [categoryId, setCategoryId] = useState<number | null>(product?.category_id ?? null);
  const [isAvailable, setIsAvailable] = useState(product?.is_available ?? true);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function save() {
    const parsedPrice = parsePrice(price);
    if (name.trim().length < 2) return setError('Poné el nombre del producto.');
    if (!parsedPrice) return setError('Poné el precio, solo números.');
    if (!categoryId) return setError('Elegí una categoría.');
    setError(null);
    setIsSaving(true);

    try {
      const photoPath = photoUri ? await uploadImage('product-photos', businessId, 'producto', photoUri) : undefined;
      const values = {
        name: name.trim(),
        description: description.trim(),
        price: parsedPrice,
        sale_unit: saleUnit,
        category_id: categoryId,
        is_available: isAvailable,
        ...(photoPath ? { photo_path: photoPath } : {}),
      };
      const { error: saveError } = product
        ? await supabase.from('products').update(values).eq('id', product.id)
        : await supabase.from('products').insert({ ...values, business_id: businessId });
      if (saveError) {
        await removeImage('product-photos', photoPath ?? null);
        setError(friendlyError(saveError, 'No pudimos guardar el producto. Probá de nuevo.'));
        return;
      }
      if (photoPath && product?.photo_path) await removeImage('product-photos', product.photo_path);
      await refresh();
      router.back();
    } catch {
      setError('No pudimos subir la foto. Revisá la conexión y probá de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    if (!product) return;
    setIsDeleting(true);
    const { error: deleteError } = await supabase.from('products').delete().eq('id', product.id);
    setIsDeleting(false);
    if (deleteError) {
      setError('No pudimos borrar el producto. Probá de nuevo.');
      return;
    }
    await removeImage('product-photos', product.photo_path);
    await refresh();
    router.back();
  }

  function confirmRemove() {
    const question = `¿Borrar "${product?.name}"? Esto no se puede deshacer.`;
    if (Platform.OS === 'web') {
      if (window.confirm(question)) remove();
      return;
    }
    Alert.alert('Borrar producto', question, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: remove },
    ]);
  }

  return (
    <Screen>
      <BackHeader title={product ? 'Editar producto' : 'Nuevo producto'} />
      <PhotoPicker
        label="Foto"
        hint="Una foto propia, bien iluminada. Nada de fotos sacadas de internet."
        uri={photoUri ?? publicUrl('product-photos', product?.photo_path ?? null)}
        shape="wide"
        onPick={setPhotoUri}
      />
      <TextField label="Nombre" placeholder="Sánguche de milanesa" value={name} onChangeText={setName} maxLength={60} />
      <TextField
        label="Descripción"
        placeholder="Milanesa de carne con lechuga, tomate y mayonesa casera"
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={300}
        style={styles.multiline}
      />
      <TextField label="Precio ($)" placeholder="4500" keyboardType="number-pad" value={price} onChangeText={setPrice} />
      <ChoiceChips
        label="¿El precio es por…?"
        options={SALE_UNITS.map((option) => ({ value: option.value, label: option.label }))}
        value={saleUnit}
        onChange={setSaleUnit}
      />
      {parsePrice(price) ? (
        <ThemedText type="small" themeColor="textSecondary">
          El cliente va a ver: {formatUnitPrice(parsePrice(price)!, saleUnit)}
        </ThemedText>
      ) : null}
      <ChoiceChips
        label="Categoría"
        options={categories.map((category) => ({ value: category.id, label: category.name }))}
        value={categoryId}
        onChange={setCategoryId}
      />
      <SwitchRow
        label="Disponible"
        description="Apagalo cuando te quedes sin stock; no lo borres."
        value={isAvailable}
        onValueChange={setIsAvailable}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
      <Button title={product ? 'Guardar cambios' : 'Agregar producto'} onPress={save} loading={isSaving} />
      {product ? <Button title="Borrar producto" variant="ghost" onPress={confirmRemove} loading={isDeleting} /> : null}
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
