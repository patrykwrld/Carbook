import type { Context } from 'hono';
import { hasAlreadyFlagged, recordFlag } from '../abuse';
import { flagComment, getComment } from '../db';
import { hashUser } from '../hash';
import { shouldAutoHide } from '../moderation';
import type { Env } from '../types';

export async function handleFlagComment(c: Context<{ Bindings: Env }>): Promise<Response> {
  const idParam = c.req.param('id') ?? '';
  const commentId = parseInt(idParam, 10);
  if (!Number.isInteger(commentId) || commentId <= 0) {
    return c.json({ ok: false, error: 'INVALID_COMMENT_ID' }, 400);
  }

  const comment = await getComment(c.env.DB, commentId);
  if (!comment) {
    return c.json({ ok: false, error: 'COMMENT_NOT_FOUND' }, 404);
  }

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const userAgent = c.req.header('User-Agent') ?? 'unknown';
  const userHash = await hashUser(c.env.USER_HASH_SALT, ip, userAgent);

  if (await hasAlreadyFlagged(c.env.RATE_LIMIT_KV, userHash, commentId)) {
    return c.json({ ok: false, error: 'ALREADY_FLAGGED' }, 429);
  }

  const newFlagCount = comment.flag_count + 1;
  await flagComment(c.env.DB, commentId, shouldAutoHide(newFlagCount));
  await recordFlag(c.env.RATE_LIMIT_KV, userHash, commentId);

  return c.json({ ok: true, flagCount: newFlagCount, hidden: shouldAutoHide(newFlagCount) });
}
