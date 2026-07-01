import type { CommentRow, CommentTag, PlateRow } from './types';

export function dayString(dateMs: number): string {
  return new Date(dateMs).toISOString().slice(0, 10);
}

export async function upsertPlate(db: D1Database, plate: string, nowMs: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO plates (plate, first_seen_at, last_seen_at, comment_count)
       VALUES (?1, ?2, ?2, 1)
       ON CONFLICT(plate) DO UPDATE SET last_seen_at = ?2, comment_count = comment_count + 1`
    )
    .bind(plate, nowMs)
    .run();
}

export interface InsertCommentInput {
  plate: string;
  authorName: string | null;
  body: string;
  tag: CommentTag | null;
  imageKey: string | null;
  userHash: string;
  nowMs: number;
}

export async function insertComment(db: D1Database, input: InsertCommentInput): Promise<number> {
  const result = await db
    .prepare(
      `INSERT INTO comments
         (plate, author_name, body, tag, image_key, user_hash, flag_count, hidden, created_at, created_day)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7, ?8)`
    )
    .bind(
      input.plate,
      input.authorName,
      input.body,
      input.tag,
      input.imageKey,
      input.userHash,
      input.nowMs,
      dayString(input.nowMs)
    )
    .run();
  return Number(result.meta.last_row_id);
}

export interface ListCommentsOptions {
  limit: number;
  before?: number;
}

export async function listCommentsForPlate(
  db: D1Database,
  plate: string,
  options: ListCommentsOptions
): Promise<CommentRow[]> {
  const before = options.before ?? Number.MAX_SAFE_INTEGER;
  const { results } = await db
    .prepare(
      `SELECT id, plate, author_name, body, tag, image_key, user_hash, flag_count, hidden, created_at, created_day
       FROM comments
       WHERE plate = ?1 AND hidden = 0 AND created_at < ?2
       ORDER BY created_at DESC
       LIMIT ?3`
    )
    .bind(plate, before, options.limit)
    .all<CommentRow>();
  return results ?? [];
}

export async function getPlate(db: D1Database, plate: string): Promise<PlateRow | null> {
  const row = await db
    .prepare(`SELECT plate, first_seen_at, last_seen_at, comment_count FROM plates WHERE plate = ?1`)
    .bind(plate)
    .first<PlateRow>();
  return row ?? null;
}

export async function getVisibleCommentCount(db: D1Database, plate: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM comments WHERE plate = ?1 AND hidden = 0`)
    .bind(plate)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function listRecentPlates(db: D1Database, limit: number): Promise<PlateRow[]> {
  const { results } = await db
    .prepare(
      `SELECT plate, first_seen_at, last_seen_at, comment_count
       FROM plates
       ORDER BY last_seen_at DESC
       LIMIT ?1`
    )
    .bind(limit)
    .all<PlateRow>();
  return results ?? [];
}

export async function getComment(db: D1Database, commentId: number): Promise<CommentRow | null> {
  const row = await db
    .prepare(
      `SELECT id, plate, author_name, body, tag, image_key, user_hash, flag_count, hidden, created_at, created_day
       FROM comments WHERE id = ?1`
    )
    .bind(commentId)
    .first<CommentRow>();
  return row ?? null;
}

export async function flagComment(db: D1Database, commentId: number, hide: boolean): Promise<void> {
  await db
    .prepare(`UPDATE comments SET flag_count = flag_count + 1, hidden = ?2 WHERE id = ?1`)
    .bind(commentId, hide ? 1 : 0)
    .run();
}
