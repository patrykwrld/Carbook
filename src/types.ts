export type FeedbackType =
  | 'LET_MERGE'
  | 'SAFE_DRIVING'
  | 'AGGRESSIVE_DRIVING'
  | 'PHONE_USE';

export const FEEDBACK_TYPES: readonly FeedbackType[] = [
  'LET_MERGE',
  'SAFE_DRIVING',
  'AGGRESSIVE_DRIVING',
  'PHONE_USE',
];

export const POSITIVE_TYPES: readonly FeedbackType[] = ['LET_MERGE', 'SAFE_DRIVING'];
export const NEGATIVE_TYPES: readonly FeedbackType[] = ['AGGRESSIVE_DRIVING', 'PHONE_USE'];

export interface FeedbackEventRow {
  id: number;
  plate: string;
  feedback_type: FeedbackType;
  comment: string | null;
  image_key: string | null;
  user_hash: string;
  created_at: number;
  created_day: string;
}

export interface Env {
  DB: D1Database;
  RATE_LIMIT_KV: KVNamespace;
  IMAGES_KV: KVNamespace;
  ASSETS: Fetcher;
  USER_HASH_SALT: string;
}

export type Trend = 'up' | 'down' | 'stable';

export interface PlateResult {
  plate: string;
  visible: boolean;
  reason?: string;
  score?: number;
  trend?: Trend;
  totalEvents?: number;
  uniqueUsers?: number;
  distinctDays?: number;
  ratios?: Record<FeedbackType, number>;
}
