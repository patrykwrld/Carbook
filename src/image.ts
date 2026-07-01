const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB, keeps well under KV per-value limits
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ImageInput {
  base64: string;
  contentType: string;
}

export class InvalidImageError extends Error {}

export async function storeImage(kv: KVNamespace, plate: string, image: ImageInput): Promise<string> {
  if (!ALLOWED_CONTENT_TYPES.has(image.contentType)) {
    throw new InvalidImageError('Unsupported image type');
  }

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
  } catch {
    throw new InvalidImageError('Invalid base64 image data');
  }

  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new InvalidImageError('Image exceeds maximum allowed size');
  }

  const key = `image:${plate}:${crypto.randomUUID()}`;
  await kv.put(key, bytes, { metadata: { contentType: image.contentType } });
  return key;
}

export async function getImage(kv: KVNamespace, key: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const value = await kv.getWithMetadata<{ contentType: string }>(key, 'arrayBuffer');
  if (!value.value) return null;
  return { bytes: value.value, contentType: value.metadata?.contentType ?? 'application/octet-stream' };
}
