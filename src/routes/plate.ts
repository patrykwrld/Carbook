import type { Context } from 'hono';
import { computeAggregate } from '../aggregate';
import { getEventsInWindow } from '../db';
import { isValidPlate, normalizePlate } from '../plate';
import type { Env } from '../types';

export async function handleGetPlate(c: Context<{ Bindings: Env }>): Promise<Response> {
  const rawPlate = c.req.param('plate') ?? '';
  const plate = normalizePlate(rawPlate);
  if (!isValidPlate(plate)) {
    return c.json({ ok: false, error: 'INVALID_PLATE' }, 400);
  }

  const nowMs = Date.now();
  const events = await getEventsInWindow(c.env.DB, plate, nowMs);
  const aggregate = computeAggregate(events, nowMs);

  if (!aggregate.visible) {
    return c.json({
      ok: true,
      plate,
      visible: false,
      reason: aggregate.reason,
    });
  }

  return c.json({
    ok: true,
    plate,
    visible: true,
    score: aggregate.score,
    trend: aggregate.trend,
    totalEvents: aggregate.totalEvents,
    uniqueUsers: aggregate.uniqueUsers,
    distinctDays: aggregate.distinctDays,
    ratios: aggregate.ratios,
  });
}
