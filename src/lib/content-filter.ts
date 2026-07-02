/**
 * Ingest filter (BLUEPRINT §5.2): comments describe cars and driving, never
 * people. Reject anything that looks like contact info, links, or targeted
 * abuse before it reaches the database. Deliberately simple — regex and a
 * blocklist, no external calls.
 */

const CONTACT_PATTERNS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /(\+?\d[\d\s\-().]{7,}\d)/,
    reason: "Looks like a phone number — no personal contact info.",
  },
  {
    pattern: /\S+@\S+\.\S{2,}/,
    reason: "Looks like an email address — no personal contact info.",
  },
  {
    pattern: /(https?:\/\/|www\.)\S+/i,
    reason: "No links.",
  },
  {
    pattern: /\b(ul\.|ulica|street|str\.|apt\.?|apartment|mieszka(?:nie)?)\s+\S+\s*\d/i,
    reason: "Looks like an address — no personal info.",
  },
];

// Targeted-abuse terms (not general profanity — that's allowed, this is a
// road, not a library). Extend as moderation reports come in.
const BLOCKLIST = [
  "kys",
  "kill yourself",
  "zabij się",
  "faggot",
  "nigger",
  "retard",
  "pedał",
  "cwel",
];

export type FilterResult = { ok: true } | { ok: false; reason: string };

export function checkCommentBody(body: string): FilterResult {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, reason: "Say something." };
  if (trimmed.length > 500)
    return { ok: false, reason: "Keep it under 500 characters." };

  for (const { pattern, reason } of CONTACT_PATTERNS) {
    if (pattern.test(trimmed)) return { ok: false, reason };
  }

  const lowered = trimmed.toLowerCase();
  for (const term of BLOCKLIST) {
    if (lowered.includes(term))
      return {
        ok: false,
        reason: "That crosses the line. Comment on the car, not the human.",
      };
  }

  return { ok: true };
}
