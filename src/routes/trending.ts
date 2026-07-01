import type { Context } from 'hono';
import { listRecentPlates } from '../db';
import type { Env } from '../types';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function handleTrending(c: Context<{ Bindings: Env }>): Promise<Response> {
  const limitParam = c.req.query('limit');
  const limit = limitParam
    ? Math.min(MAX_LIMIT, Math.max(1, parseInt(limitParam, 10) || DEFAULT_LIMIT))
    : DEFAULT_LIMIT;

  const plates = await listRecentPlates(c.env.DB, limit);

  return c.json({
    ok: true,
    plates: plates.map((row) => ({
      plate: row.plate,
      commentCount: row.comment_count,
      lastSeenAt: row.last_seen_at,
    })),
  });
}
