import type { Env, FeedbackEventRow, FeedbackType } from './types';
import { ROLLING_WINDOW_DAYS } from './aggregate';

const DAY_MS = 24 * 60 * 60 * 1000;

export function dayString(dateMs: number): string {
  return new Date(dateMs).toISOString().slice(0, 10);
}

export async function upsertPlate(db: D1Database, plate: string, nowMs: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO plates (plate, first_seen_at, last_seen_at)
       VALUES (?1, ?2, ?2)
       ON CONFLICT(plate) DO UPDATE SET last_seen_at = ?2`
    )
    .bind(plate, nowMs)
    .run();
}

export interface InsertEventInput {
  plate: string;
  feedbackType: FeedbackType;
  comment: string | null;
  imageKey: string | null;
  userHash: string;
  nowMs: number;
}

/**
 * Returns false if the D1 unique index (plate, user_hash, feedback_type,
 * created_day) rejected the insert as a duplicate — the KV dedupe check is
 * the primary gate, this is the consistency backstop.
 */
export async function insertEvent(db: D1Database, input: InsertEventInput): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO feedback_events
           (plate, feedback_type, comment, image_key, user_hash, created_at, created_day)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
      )
      .bind(
        input.plate,
        input.feedbackType,
        input.comment,
        input.imageKey,
        input.userHash,
        input.nowMs,
        dayString(input.nowMs)
      )
      .run();
    return true;
  } catch (err) {
    if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
      return false;
    }
    throw err;
  }
}

export async function getEventsInWindow(
  db: D1Database,
  plate: string,
  nowMs: number
): Promise<FeedbackEventRow[]> {
  const windowStart = nowMs - ROLLING_WINDOW_DAYS * DAY_MS;
  const { results } = await db
    .prepare(
      `SELECT id, plate, feedback_type, comment, image_key, user_hash, created_at, created_day
       FROM feedback_events
       WHERE plate = ?1 AND created_at >= ?2
       ORDER BY created_at ASC`
    )
    .bind(plate, windowStart)
    .all<FeedbackEventRow>();
  return results ?? [];
}
