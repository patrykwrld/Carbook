import type { Context } from 'hono';
import { getImage } from '../image';
import type { Env } from '../types';

export async function handleGetImage(c: Context<{ Bindings: Env }>): Promise<Response> {
  const key = c.req.param('key') ?? '';
  if (!key.startsWith('image:')) {
    return c.json({ ok: false, error: 'INVALID_IMAGE_KEY' }, 400);
  }

  const image = await getImage(c.env.IMAGES_KV, key);
  if (!image) {
    return c.json({ ok: false, error: 'IMAGE_NOT_FOUND' }, 404);
  }

  return new Response(image.bytes, {
    headers: {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
