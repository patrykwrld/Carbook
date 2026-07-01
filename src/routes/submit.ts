import type { Context } from 'hono';
import { checkAbuse, recordSubmission } from '../abuse';
import { insertEvent, upsertPlate } from '../db';
import { hashUser } from '../hash';
import { InvalidImageError, storeImage } from '../image';
import { isValidPlate, normalizePlate } from '../plate';
import { FEEDBACK_TYPES } from '../types';
import type { Env, FeedbackType } from '../types';

const MAX_COMMENT_LENGTH = 500;

interface SubmitBody {
  plate?: unknown;
  feedbackType?: unknown;
  comment?: unknown;
  imageBase64?: unknown;
  imageContentType?: unknown;
}

export async function handleSubmit(c: Context<{ Bindings: Env }>): Promise<Response> {
  let body: SubmitBody;
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

  if (typeof body.feedbackType !== 'string' || !FEEDBACK_TYPES.includes(body.feedbackType as FeedbackType)) {
    return c.json({ ok: false, error: 'INVALID_FEEDBACK_TYPE' }, 400);
  }
  const feedbackType = body.feedbackType as FeedbackType;

  let comment: string | null = null;
  if (typeof body.comment === 'string') {
    const trimmed = body.comment.trim().slice(0, MAX_COMMENT_LENGTH);
    comment = trimmed.length > 0 ? trimmed : null;
  }

  const nowMs = Date.now();
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const userAgent = c.req.header('User-Agent') ?? 'unknown';
  const userHash = await hashUser(c.env.USER_HASH_SALT, ip, userAgent);

  const abuseCheck = await checkAbuse(c.env.RATE_LIMIT_KV, userHash, plate, feedbackType);
  if (!abuseCheck.allowed) {
    return c.json({ ok: false, error: abuseCheck.reason }, 429);
  }

  let imageKey: string | null = null;
  if (typeof body.imageBase64 === 'string' && typeof body.imageContentType === 'string') {
    try {
      imageKey = await storeImage(c.env.IMAGES_KV, plate, {
        base64: body.imageBase64,
        contentType: body.imageContentType,
      });
    } catch (err) {
      if (err instanceof InvalidImageError) {
        return c.json({ ok: false, error: 'INVALID_IMAGE' }, 400);
      }
      throw err;
    }
  }

  await upsertPlate(c.env.DB, plate, nowMs);

  const inserted = await insertEvent(c.env.DB, {
    plate,
    feedbackType,
    comment,
    imageKey,
    userHash,
    nowMs,
  });

  if (!inserted) {
    return c.json({ ok: false, error: 'DUPLICATE_SUBMISSION' }, 429);
  }

  await recordSubmission(c.env.RATE_LIMIT_KV, userHash, plate, feedbackType);

  return c.json({ ok: true });
}
