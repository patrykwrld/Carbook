import type { FeedbackType } from './types';

const DAY_SECONDS = 24 * 60 * 60;

export const MAX_SUBMISSIONS_PER_USER_PER_DAY = 5;
export const MAX_SUBMISSIONS_PER_USER_PER_PLATE_PER_DAY = 2;

export type AbuseRejectionReason =
  | 'DAILY_LIMIT_EXCEEDED'
  | 'DUPLICATE_SUBMISSION'
  | 'PLATE_TARGETING_LIMIT_EXCEEDED';

export interface AbuseCheckResult {
  allowed: boolean;
  reason?: AbuseRejectionReason;
}

function dailyCountKey(userHash: string): string {
  return `user:${userHash}:daily_count`;
}

function plateCountKey(userHash: string, plate: string): string {
  return `user:${userHash}:plate:${plate}`;
}

function dedupeKey(userHash: string, plate: string, feedbackType: FeedbackType): string {
  return `dup:${userHash}:${plate}:${feedbackType}`;
}

/**
 * Reads current counters without mutating state, so a rejected submission
 * never consumes any part of the user's quota.
 */
export async function checkAbuse(
  kv: KVNamespace,
  userHash: string,
  plate: string,
  feedbackType: FeedbackType
): Promise<AbuseCheckResult> {
  const dup = await kv.get(dedupeKey(userHash, plate, feedbackType));
  if (dup !== null) {
    return { allowed: false, reason: 'DUPLICATE_SUBMISSION' };
  }

  const dailyRaw = await kv.get(dailyCountKey(userHash));
  const dailyCount = dailyRaw ? parseInt(dailyRaw, 10) : 0;
  if (dailyCount >= MAX_SUBMISSIONS_PER_USER_PER_DAY) {
    return { allowed: false, reason: 'DAILY_LIMIT_EXCEEDED' };
  }

  const plateRaw = await kv.get(plateCountKey(userHash, plate));
  const plateCount = plateRaw ? parseInt(plateRaw, 10) : 0;
  if (plateCount >= MAX_SUBMISSIONS_PER_USER_PER_PLATE_PER_DAY) {
    return { allowed: false, reason: 'PLATE_TARGETING_LIMIT_EXCEEDED' };
  }

  return { allowed: true };
}

/**
 * Records a successful submission. Must only be called after checkAbuse
 * passes and the D1 insert succeeds, so counters stay consistent with
 * actual stored events.
 */
export async function recordSubmission(
  kv: KVNamespace,
  userHash: string,
  plate: string,
  feedbackType: FeedbackType
): Promise<void> {
  const dailyRaw = await kv.get(dailyCountKey(userHash));
  const dailyCount = dailyRaw ? parseInt(dailyRaw, 10) : 0;
  await kv.put(dailyCountKey(userHash), String(dailyCount + 1), { expirationTtl: DAY_SECONDS });

  const plateRaw = await kv.get(plateCountKey(userHash, plate));
  const plateCount = plateRaw ? parseInt(plateRaw, 10) : 0;
  await kv.put(plateCountKey(userHash, plate), String(plateCount + 1), { expirationTtl: DAY_SECONDS });

  await kv.put(dedupeKey(userHash, plate, feedbackType), '1', { expirationTtl: DAY_SECONDS });
}
