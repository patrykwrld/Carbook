const DAY_SECONDS = 24 * 60 * 60;

export const MAX_COMMENTS_PER_USER_PER_DAY = 10;
export const MAX_COMMENTS_PER_USER_PER_PLATE_PER_DAY = 5;
export const MIN_SECONDS_BETWEEN_COMMENTS = 10;

export type AbuseRejectionReason =
  | 'DAILY_LIMIT_EXCEEDED'
  | 'PLATE_TARGETING_LIMIT_EXCEEDED'
  | 'TOO_FAST';

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

function lastCommentKey(userHash: string): string {
  return `user:${userHash}:last_comment_at`;
}

function flagKey(userHash: string, commentId: number): string {
  return `flag:${userHash}:${commentId}`;
}

/** Prevents one commenter from flagging the same comment repeatedly to force an auto-hide. */
export async function hasAlreadyFlagged(
  kv: KVNamespace,
  userHash: string,
  commentId: number
): Promise<boolean> {
  return (await kv.get(flagKey(userHash, commentId))) !== null;
}

export async function recordFlag(kv: KVNamespace, userHash: string, commentId: number): Promise<void> {
  await kv.put(flagKey(userHash, commentId), '1');
}

/**
 * Reads current counters without mutating state, so a rejected comment
 * never consumes any part of the user's quota.
 */
export async function checkAbuse(
  kv: KVNamespace,
  userHash: string,
  plate: string,
  nowMs: number
): Promise<AbuseCheckResult> {
  const lastRaw = await kv.get(lastCommentKey(userHash));
  if (lastRaw !== null) {
    const lastMs = parseInt(lastRaw, 10);
    if (nowMs - lastMs < MIN_SECONDS_BETWEEN_COMMENTS * 1000) {
      return { allowed: false, reason: 'TOO_FAST' };
    }
  }

  const dailyRaw = await kv.get(dailyCountKey(userHash));
  const dailyCount = dailyRaw ? parseInt(dailyRaw, 10) : 0;
  if (dailyCount >= MAX_COMMENTS_PER_USER_PER_DAY) {
    return { allowed: false, reason: 'DAILY_LIMIT_EXCEEDED' };
  }

  const plateRaw = await kv.get(plateCountKey(userHash, plate));
  const plateCount = plateRaw ? parseInt(plateRaw, 10) : 0;
  if (plateCount >= MAX_COMMENTS_PER_USER_PER_PLATE_PER_DAY) {
    return { allowed: false, reason: 'PLATE_TARGETING_LIMIT_EXCEEDED' };
  }

  return { allowed: true };
}

/**
 * Records a successful comment. Must only be called after checkAbuse
 * passes and the D1 insert succeeds, so counters stay consistent with
 * actual stored comments.
 */
export async function recordComment(
  kv: KVNamespace,
  userHash: string,
  plate: string,
  nowMs: number
): Promise<void> {
  const dailyRaw = await kv.get(dailyCountKey(userHash));
  const dailyCount = dailyRaw ? parseInt(dailyRaw, 10) : 0;
  await kv.put(dailyCountKey(userHash), String(dailyCount + 1), { expirationTtl: DAY_SECONDS });

  const plateRaw = await kv.get(plateCountKey(userHash, plate));
  const plateCount = plateRaw ? parseInt(plateRaw, 10) : 0;
  await kv.put(plateCountKey(userHash, plate), String(plateCount + 1), { expirationTtl: DAY_SECONDS });

  await kv.put(lastCommentKey(userHash), String(nowMs), {
    expirationTtl: Math.max(60, MIN_SECONDS_BETWEEN_COMMENTS),
  });
}
