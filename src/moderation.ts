export const MIN_COMMENT_LENGTH = 3;
export const MAX_COMMENT_LENGTH = 1000;
export const MAX_AUTHOR_NAME_LENGTH = 40;

/** Comments are auto-hidden once enough distinct users flag them. */
export const AUTO_HIDE_FLAG_THRESHOLD = 3;

export function sanitizeCommentBody(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < MIN_COMMENT_LENGTH || trimmed.length > MAX_COMMENT_LENGTH) return null;
  return trimmed;
}

export function sanitizeAuthorName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, MAX_AUTHOR_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

export function shouldAutoHide(flagCount: number): boolean {
  return flagCount >= AUTO_HIDE_FLAG_THRESHOLD;
}
