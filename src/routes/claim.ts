import type { Context } from 'hono';
import { isValidPlate, normalizePlate } from '../plate';
import type { Env } from '../types';

/**
 * Placeholder for future plate-ownership claims. Intentionally does not
 * persist anything or perform auth yet — it only validates input shape so
 * the frontend/API contract is stable before verification is built.
 */
export async function handleClaim(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: { plate?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'INVALID_JSON' }, 400);
  }

  if (typeof body.plate !== 'string') {
    return c.json({ ok: false, error: 'PLATE_REQUIRED' }, 400);
  }
  const plate = normalizePlate(body.plate);
  if (!isValidPlate(plate)) {
    return c.json({ ok: false, error: 'INVALID_PLATE' }, 400);
  }

  return c.json(
    {
      ok: true,
      plate,
      status: 'NOT_IMPLEMENTED',
      message: 'Plate claiming is not yet available. This endpoint is a placeholder.',
    },
    202
  );
}
