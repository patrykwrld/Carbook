import { describe, expect, it } from 'vitest';
import { computeAggregate, computeTrend, VISIBILITY_MIN_UNIQUE_USERS } from '../src/aggregate';
import type { FeedbackEventRow, FeedbackType } from '../src/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-01T00:00:00Z');

let nextId = 1;
function event(
  userHash: string,
  feedbackType: FeedbackType,
  daysAgo: number
): FeedbackEventRow {
  const createdAt = NOW - daysAgo * DAY_MS;
  return {
    id: nextId++,
    plate: 'ABC123',
    feedback_type: feedbackType,
    comment: null,
    image_key: null,
    user_hash: userHash,
    created_at: createdAt,
    created_day: new Date(createdAt).toISOString().slice(0, 10),
  };
}

describe('computeAggregate visibility', () => {
  it('hides plates with fewer than the minimum unique users', () => {
    const events = [
      event('u1', 'SAFE_DRIVING', 1),
      event('u2', 'SAFE_DRIVING', 2),
    ];
    const result = computeAggregate(events, NOW);
    expect(result.visible).toBe(false);
    expect(result.reason).toBe('INSUFFICIENT_DATA');
  });

  it('hides plates with enough users but only a single distinct day', () => {
    const events = Array.from({ length: VISIBILITY_MIN_UNIQUE_USERS }, (_, i) =>
      event(`u${i}`, 'SAFE_DRIVING', 0)
    );
    const result = computeAggregate(events, NOW);
    expect(result.visible).toBe(false);
  });

  it('shows plates meeting both the unique-user and distinct-day thresholds', () => {
    const events = [
      event('u1', 'SAFE_DRIVING', 0),
      event('u2', 'SAFE_DRIVING', 1),
      event('u3', 'SAFE_DRIVING', 2),
      event('u4', 'SAFE_DRIVING', 3),
      event('u5', 'SAFE_DRIVING', 4),
    ];
    const result = computeAggregate(events, NOW);
    expect(result.visible).toBe(true);
    expect(result.uniqueUsers).toBe(5);
    expect(result.distinctDays).toBe(5);
  });
});

describe('computeAggregate score', () => {
  it('scores all-positive events near 100', () => {
    const events = [
      event('u1', 'SAFE_DRIVING', 0),
      event('u2', 'LET_MERGE', 1),
      event('u3', 'SAFE_DRIVING', 2),
      event('u4', 'LET_MERGE', 3),
      event('u5', 'SAFE_DRIVING', 4),
    ];
    const result = computeAggregate(events, NOW);
    expect(result.score).toBe(100);
  });

  it('scores all-negative events near 0', () => {
    const events = [
      event('u1', 'AGGRESSIVE_DRIVING', 0),
      event('u2', 'PHONE_USE', 1),
      event('u3', 'AGGRESSIVE_DRIVING', 2),
      event('u4', 'PHONE_USE', 3),
      event('u5', 'AGGRESSIVE_DRIVING', 4),
    ];
    const result = computeAggregate(events, NOW);
    expect(result.score).toBe(0);
  });

  it('weights recent events more heavily than old ones', () => {
    // Same 50/50 split by count, but negative events are old and positive
    // events are recent -> recency weighting should push score above 50.
    const events = [
      event('u1', 'AGGRESSIVE_DRIVING', 29),
      event('u2', 'PHONE_USE', 28),
      event('u3', 'SAFE_DRIVING', 0),
      event('u4', 'LET_MERGE', 1),
      event('u5', 'SAFE_DRIVING', 2),
    ];
    const result = computeAggregate(events, NOW);
    expect(result.score).toBeGreaterThan(50);
  });

  it('is deterministic for identical inputs', () => {
    const events = [
      event('u1', 'SAFE_DRIVING', 0),
      event('u2', 'AGGRESSIVE_DRIVING', 1),
      event('u3', 'SAFE_DRIVING', 2),
      event('u4', 'PHONE_USE', 3),
      event('u5', 'LET_MERGE', 4),
    ];
    const a = computeAggregate(events, NOW);
    const b = computeAggregate(events, NOW);
    expect(a).toEqual(b);
  });
});

describe('computeTrend', () => {
  it('reports stable when either window has no data', () => {
    expect(computeTrend(null, 0.5)).toBe('stable');
    expect(computeTrend(0.5, null)).toBe('stable');
  });

  it('reports up when recent ratio improves beyond the threshold', () => {
    expect(computeTrend(0.9, 0.5)).toBe('up');
  });

  it('reports down when recent ratio worsens beyond the threshold', () => {
    expect(computeTrend(0.2, 0.6)).toBe('down');
  });

  it('reports stable for small fluctuations within the threshold', () => {
    expect(computeTrend(0.52, 0.5)).toBe('stable');
  });
});
