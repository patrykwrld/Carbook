import type { Context } from 'hono';
import { checkAbuse, recordComment } from '../abuse';
import { getPlate, insertComment, listCommentsForPlate, upsertPlate } from '../db';
import { hashUser } from '../hash';
import { InvalidImageError, storeImage } from '../image';
import { MAX_COMMENT_LENGTH, sanitizeAuthorName, sanitizeCommentBody } from '../moderation';
import { isValidPlate, normalizePlate } from '../plate';
import { COMMENT_TAGS } from '../types';
import type { CommentTag, Env } from '../types';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface SubmitCommentBody {
  plate?: unknown;
  body?: unknown;
  tag?: unknown;
  authorName?: unknown;
  imageBase64?: unknown;
  imageContentType?: unknown;
}

export async function handleCreateComment(c: Context<{ Bindings: Env }>): Promise<Response> {
  let payload: SubmitCommentBody;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ ok: false, error: 'INVALID_JSON' }, 400);
  }

  if (typeof payload.plate !== 'string') {
    return c.json({ ok: false, error: 'PLATE_REQUIRED' }, 400);
  }
  const plate = normalizePlate(payload.plate);
  if (!isValidPlate(plate)) {
    return c.json({ ok: false, error: 'INVALID_PLATE' }, 400);
  }

  if (typeof payload.body !== 'string') {
    return c.json({ ok: false, error: 'BODY_REQUIRED' }, 400);
  }
  const body = sanitizeCommentBody(payload.body);
  if (!body) {
    return c.json({ ok: false, error: 'INVALID_BODY', maxLength: MAX_COMMENT_LENGTH }, 400);
  }

  let tag: CommentTag | null = null;
  if (payload.tag !== undefined && payload.tag !== null) {
    if (typeof payload.tag !== 'string' || !COMMENT_TAGS.includes(payload.tag as CommentTag)) {
      return c.json({ ok: false, error: 'INVALID_TAG' }, 400);
    }
    tag = payload.tag as CommentTag;
  }

  const authorName = sanitizeAuthorName(typeof payload.authorName === 'string' ? payload.authorName : null);

  const nowMs = Date.now();
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const userAgent = c.req.header('User-Agent') ?? 'unknown';
  const userHash = await hashUser(c.env.USER_HASH_SALT, ip, userAgent);

  const abuseCheck = await checkAbuse(c.env.RATE_LIMIT_KV, userHash, plate, nowMs);
  if (!abuseCheck.allowed) {
    return c.json({ ok: false, error: abuseCheck.reason }, 429);
  }

  let imageKey: string | null = null;
  if (typeof payload.imageBase64 === 'string' && typeof payload.imageContentType === 'string') {
    try {
      imageKey = await storeImage(c.env.IMAGES_KV, plate, {
        base64: payload.imageBase64,
        contentType: payload.imageContentType,
      });
    } catch (err) {
      if (err instanceof InvalidImageError) {
        return c.json({ ok: false, error: 'INVALID_IMAGE' }, 400);
      }
      throw err;
    }
  }

  await upsertPlate(c.env.DB, plate, nowMs);

  const commentId = await insertComment(c.env.DB, {
    plate,
    authorName,
    body,
    tag,
    imageKey,
    userHash,
    nowMs,
  });

  await recordComment(c.env.RATE_LIMIT_KV, userHash, plate, nowMs);

  return c.json({
    ok: true,
    comment: {
      id: commentId,
      plate,
      authorName,
      body,
      tag,
      imageKey,
      createdAt: nowMs,
    },
  });
}

export async function handleGetPlate(c: Context<{ Bindings: Env }>): Promise<Response> {
  const rawPlate = c.req.param('plate') ?? '';
  const plate = normalizePlate(rawPlate);
  if (!isValidPlate(plate)) {
    return c.json({ ok: false, error: 'INVALID_PLATE' }, 400);
  }

  const beforeParam = c.req.query('before');
  const before = beforeParam ? parseInt(beforeParam, 10) : undefined;
  const limitParam = c.req.query('limit');
  const limit = limitParam
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(limitParam, 10) || DEFAULT_PAGE_SIZE))
    : DEFAULT_PAGE_SIZE;

  const plateRow = await getPlate(c.env.DB, plate);
  const comments = await listCommentsForPlate(c.env.DB, plate, { limit, before });

  return c.json({
    ok: true,
    plate,
    commentCount: plateRow?.comment_count ?? 0,
    comments: comments.map((row) => ({
      id: row.id,
      authorName: row.author_name,
      body: row.body,
      tag: row.tag,
      imageKey: row.image_key,
      createdAt: row.created_at,
    })),
    nextBefore: comments.length === limit ? comments[comments.length - 1].created_at : null,
  });
}
