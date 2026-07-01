export type CommentTag =
  | 'SAFE_DRIVING'
  | 'AGGRESSIVE_DRIVING'
  | 'LET_MERGE'
  | 'PHONE_USE'
  | 'OTHER';

export const COMMENT_TAGS: readonly CommentTag[] = [
  'SAFE_DRIVING',
  'AGGRESSIVE_DRIVING',
  'LET_MERGE',
  'PHONE_USE',
  'OTHER',
];

export interface CommentRow {
  id: number;
  plate: string;
  author_name: string | null;
  body: string;
  tag: CommentTag | null;
  image_key: string | null;
  user_hash: string;
  flag_count: number;
  hidden: number;
  created_at: number;
  created_day: string;
}

export interface PlateRow {
  plate: string;
  first_seen_at: number;
  last_seen_at: number;
  comment_count: number;
}

export interface Env {
  DB: D1Database;
  RATE_LIMIT_KV: KVNamespace;
  IMAGES_KV: KVNamespace;
  ASSETS: Fetcher;
  USER_HASH_SALT: string;
}
