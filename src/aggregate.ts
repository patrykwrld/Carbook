import { FEEDBACK_TYPES, POSITIVE_TYPES } from './types';
import type { FeedbackEventRow, FeedbackType, Trend } from './types';

export const ROLLING_WINDOW_DAYS = 30;
export const VISIBILITY_MIN_UNIQUE_USERS = 5;
export const VISIBILITY_MIN_DISTINCT_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENCY_HALF_LIFE_DAYS = 10;
const TREND_STABLE_THRESHOLD = 5; // score points

export interface AggregateResult {
  visible: boolean;
  reason?: string;
  score: number;
  trend: Trend;
  totalEvents: number;
  uniqueUsers: number;
  distinctDays: number;
  ratios: Record<FeedbackType, number>;
}

function isPositive(type: FeedbackType): boolean {
  return (POSITIVE_TYPES as readonly string[]).includes(type);
}

function recencyWeight(ageMs: number): number {
  const ageDays = ageMs / DAY_MS;
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

function ratioForWindow(events: FeedbackEventRow[]): number | null {
  if (events.length === 0) return null;
  const positive = events.filter((e) => isPositive(e.feedback_type)).length;
  return positive / events.length;
}

/**
 * Computes the deterministic, cheap-to-evaluate aggregate for a plate.
 * `events` must already be restricted to the rolling 30-day window and a
 * single plate; `nowMs` is injected for testability.
 */
export function computeAggregate(events: FeedbackEventRow[], nowMs: number): AggregateResult {
  const uniqueUsers = new Set(events.map((e) => e.user_hash)).size;
  const distinctDays = new Set(events.map((e) => e.created_day)).size;
  const totalEvents = events.length;

  const ratios = Object.fromEntries(
    FEEDBACK_TYPES.map((type) => [
      type,
      totalEvents === 0 ? 0 : round2(events.filter((e) => e.feedback_type === type).length / totalEvents),
    ])
  ) as Record<FeedbackType, number>;

  if (uniqueUsers < VISIBILITY_MIN_UNIQUE_USERS || distinctDays < VISIBILITY_MIN_DISTINCT_DAYS) {
    return {
      visible: false,
      reason: 'INSUFFICIENT_DATA',
      score: 0,
      trend: 'stable',
      totalEvents,
      uniqueUsers,
      distinctDays,
      ratios,
    };
  }

  let weightedPositive = 0;
  let weightedTotal = 0;
  for (const event of events) {
    const weight = recencyWeight(Math.max(0, nowMs - event.created_at));
    weightedTotal += weight;
    if (isPositive(event.feedback_type)) {
      weightedPositive += weight;
    }
  }
  const score = weightedTotal === 0 ? 0 : clamp(Math.round((weightedPositive / weightedTotal) * 100), 0, 100);

  const last7 = events.filter((e) => nowMs - e.created_at <= 7 * DAY_MS);
  const prev7 = events.filter(
    (e) => nowMs - e.created_at > 7 * DAY_MS && nowMs - e.created_at <= 14 * DAY_MS
  );
  const trend = computeTrend(ratioForWindow(last7), ratioForWindow(prev7));

  return {
    visible: true,
    score,
    trend,
    totalEvents,
    uniqueUsers,
    distinctDays,
    ratios,
  };
}

export function computeTrend(last7Ratio: number | null, prev7Ratio: number | null): Trend {
  if (last7Ratio === null || prev7Ratio === null) return 'stable';
  const diff = (last7Ratio - prev7Ratio) * 100;
  if (diff > TREND_STABLE_THRESHOLD) return 'up';
  if (diff < -TREND_STABLE_THRESHOLD) return 'down';
  return 'stable';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
