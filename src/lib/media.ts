import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/lib/supabase';

export type MediaBucket = 'business-media' | 'product-photos';

// Elige una foto de la galería, recortada al formato pedido.
export async function pickImage(aspect: [number, number]) {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 1,
  });
  return result.canceled ? null : result.assets[0].uri;
}

// Achica a 1080 px de ancho, la pasa a WebP y la sube a <businessId>/<nombre>.webp.
export async function uploadImage(bucket: MediaBucket, businessId: string, name: string, uri: string) {
  const context = ImageManipulator.manipulate(uri).resize({ width: 1080 });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.WEBP, compress: 0.8 });

  const body = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${businessId}/${name}-${Date.now()}.webp`;
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'image/webp' });
  if (error) throw error;
  return path;
}

export function publicUrl(bucket: MediaBucket, path: string | null) {
  return path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
}

// Borra la foto anterior cuando se reemplaza; si falla no pasa nada grave.
export async function removeImage(bucket: MediaBucket, path: string | null) {
  if (path) await supabase.storage.from(bucket).remove([path]).catch(() => undefined);
}
